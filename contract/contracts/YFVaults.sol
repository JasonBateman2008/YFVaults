// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IYFToken.sol";
import "./interfaces/IYFVaults.sol";

// For interacting with our own strategy
interface IStrategy {
    // Total want tokens managed by stratfegy
    function wantLockedTotal() external view returns (uint256);

    // Sum of all shares of users to wantLockedTotal
    function sharesTotal() external view returns (uint256);

    // 0.015% withdraw fee
    function calcWithdrawFee(uint256 amount) external view returns (uint256);

    // Accumulated Farm reward per share, times 1e12
    // MDX, USDT, Buyback(YF)
    function accFarmRewardPerShare() external view returns (uint256, uint256, uint256);

    // Main want token compounding function
    function earn() external;

    // Transfer want tokens yfvaluts -> strategy
    function deposit(address _userAddress, uint256 _wantAmt) external returns (uint256);

    // Transfer want tokens strategy -> yfvaluts
    function withdraw(address _userAddress, uint256 _wantAmt) external returns (uint256);

    function inCaseTokensGetStuck(address _token, uint256 _amount, address _to) external;
}

contract YFCaster {
  /// @dev Call to the target using the given data.
  /// @param target The address target to call.
  /// @param data The data used in the call.
  function cast(address target, bytes calldata data) external payable {
    (bool ok, bytes memory returndata) = target.call{value: msg.value}(data);
    if (!ok) {
      if (returndata.length > 0) {
        // The easiest way to bubble the revert reason is using memory via assembly
        // solhint-disable-next-line no-inline-assembly
        assembly {
          let returndata_size := mload(returndata)
          revert(add(32, returndata), returndata_size)
        }
      } else {
        revert('bad cast call');
      }
    }
  }
}

contract YFVaults is IYFVaults, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint private constant _NOT_ENTERED = 1;
    uint private constant _ENTERED = 2;
    address private constant _NO_ADDRESS = address(1);

    uint public _GENERAL_LOCK; // TEMPORARY: re-entrancy lock guard.
    uint public _IN_EXEC_LOCK; // TEMPORARY: exec lock guard.
    address public override EXECUTOR; // TEMPORARY: position ID currently under execution.
    address public override SPELL; // TEMPORARY: spell currently under execution.

    /// @dev Reentrancy lock guard.
    modifier lock() {
        require(_GENERAL_LOCK == _NOT_ENTERED, 'general lock');
        _GENERAL_LOCK = _ENTERED;
        _;
        _GENERAL_LOCK = _NOT_ENTERED;
    }

    /// @dev Ensure that the function is called from within the execution scope.
    modifier inExec() {
        require(EXECUTOR != _NO_ADDRESS, 'not within execution');
        require(SPELL == msg.sender, 'not from spell');
        require(_IN_EXEC_LOCK == _NOT_ENTERED, 'in exec lock');
        _IN_EXEC_LOCK = _ENTERED;
        _;
        _IN_EXEC_LOCK = _NOT_ENTERED;
    }

    // Info of each user.
    struct UserInfo {
        uint256 shares;            // How many LP tokens the user has provided.
        uint256 stakeRewardDebt;   // Stake YF Reward debt. See explanation below.

        uint256 mdxRewardDebt;     // MDX Reward debt. See explanation below.
        uint256 usdtRewardDebt;    // USDT Reward debt. See explanation below.
        uint256 buybackRewardDebt; // Buyback YF  Reward debt

        // We do some fancy math here. Basically, any point in time, the amount of YF
        // entitled to a user but is pending to be distributed is:
        //
        //   amount = user.shares / sharesTotal * wantLockedTotal
        //   pending reward = (amount * pool.accPerShare) - user.stakeRewardDebt
        //
        // Whenever a user deposits or withdraws want tokens to a pool. Here's what happens:
        //   1. The pool's `accPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `stakeRewardDebt` gets updated.
    }

    struct PoolInfo {
        IERC20 want;             // Address of the want token(lpToken).
        uint256 allocPoint;      // How many allocation points assigned to this pool. YF to distribute per block.
        uint256 lastRewardBlock; // Last block number that YF distribution occurs.
        uint256 accPerShare;     // Accumulated YF per share, times 1e12. See below.
        address strat;           // Strategy address that will auto compound want tokens
    }

    address public YF; // TODO...

    address public MDX         = 0x25D2e80cB6B86881Fd7e07dd263Fb79f4AbE033c;
    address public USDT        = 0xa71EdC38d189767582C38A3145b5873052c3e47a;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 public YFMaxSupply     = 300e18;
    uint256 public YFPerBlock      = 300000000000000;  // YF tokens created per block

    uint256 public startBlock      = 3888888;          // https://hecoinfo.com/block/3888888
    uint256 public totalAllocPoint = 0;                // Total YF allocation points. Must be the sum of all allocation points in all pools.

    PoolInfo[] public poolInfo; // Info of each pool.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo; // Info of each user that stakes LP tokens.

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    address public caster; // The caster address for untrusted execution.

    constructor(address YFToken_) public {
        YF = YFToken_;
        caster = address(new YFCaster());

        _IN_EXEC_LOCK = _NOT_ENTERED;
        EXECUTOR = _NO_ADDRESS;
        SPELL = _NO_ADDRESS;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // *** DO NOT add the same LP token more than once. Rewards will be messed up if you do. (Only if want tokens are stored here.)
    function add(
        uint256 _allocPoint,
        IERC20 _want,
        bool _withUpdate,
        address _strat
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);

        poolInfo.push(
            PoolInfo({
                want:            _want,
                allocPoint:      _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPerShare:     0,
                strat:           _strat
            })
        );
    }

    // Update the given pool's YF allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (IERC20(YF).totalSupply() >= YFMaxSupply) {
            return 0;
        }
        return _to.sub(_from);
    }

    // View function to see pending on frontend.
    function pending(uint256 _pid, address _user)
        external
        view
        override
        returns (uint256, uint256, uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint256 accPerShare = pool.accPerShare;
        uint256 sharesTotal = IStrategy(pool.strat).sharesTotal();
        (uint256 usdt, uint256 mdx, uint256 buyback) = IStrategy(pool.strat).accFarmRewardPerShare();

        if (block.number > pool.lastRewardBlock && sharesTotal != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 YFReward = multiplier.mul(YFPerBlock).mul(pool.allocPoint).div(totalAllocPoint);

            accPerShare = accPerShare.add(
                YFReward.mul(1e12).div(sharesTotal)
            );
        }

        uint256 YF_ = user.shares.mul(accPerShare).div(1e12).sub(user.stakeRewardDebt);
        uint256 Buyback_ = user.shares.mul(buyback).div(1e12).sub(user.buybackRewardDebt);
        uint256 USDT_ = user.shares.mul(usdt).div(1e12).sub(user.usdtRewardDebt);
        uint256 MDX_  = user.shares.mul(mdx).div(1e12).sub(user.mdxRewardDebt);

        return (YF_.add(Buyback_), USDT_, MDX_);
    }

    // View function to see staked Want tokens on frontend.
    function stakedWantTokens(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint256 sharesTotal     = IStrategy(pool.strat).sharesTotal();
        uint256 wantLockedTotal = IStrategy(poolInfo[_pid].strat).wantLockedTotal();

        if (sharesTotal == 0) {
            return 0;
        }
        return user.shares.mul(wantLockedTotal).div(sharesTotal);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 sharesTotal = IStrategy(pool.strat).sharesTotal();
        if (sharesTotal == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        if (multiplier <= 0) {
            return;
        }
        uint256 YFReward =
            multiplier.mul(YFPerBlock).mul(pool.allocPoint).div(
                totalAllocPoint
            );

        IYFToken(YF).mint(address(this), YFReward);

        pool.accPerShare = pool.accPerShare.add(
            YFReward.mul(1e12).div(sharesTotal)
        );
        pool.lastRewardBlock = block.number;
    }

    // Want tokens moved from user -> AUTOFarm (YF allocation) -> Strat (compounding)
    function deposit(uint256 _pid, uint256 _wantAmt) public override nonReentrant {
        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        // 1. FarmReward * 2% for Staking YF-USDT LP user
        // 2. FarmReward * 45% for Farm user
        // 3. Buyback FarmReward * 3% to YF for Farm user
        (uint256 accUsdtPerShare, uint256 accMdxPerShare, uint256 accBuybackPerShare) = IStrategy(pool.strat).accFarmRewardPerShare();

        if (user.shares > 0) {
            uint256 pendingYF_ =
                user.shares.mul(pool.accPerShare).div(1e12).sub(
                    user.stakeRewardDebt
                );
            if (pendingYF_ > 0) {
                safeYFTransfer(msg.sender, pendingYF_);
            }

            uint256 pendingBuyback_ =
                user.shares.mul(accBuybackPerShare).div(1e12).sub(
                    user.buybackRewardDebt
                );
            if (pendingBuyback_ > 0) {
                safeBuybackTransfer(poolInfo[_pid].strat, msg.sender, pendingBuyback_);
            }

            uint256 pendingUSDT_ =
                user.shares.mul(accUsdtPerShare).div(1e12).sub(
                    user.usdtRewardDebt
                );
            if (pendingUSDT_ > 0) {
                safeUSDTransfer(poolInfo[_pid].strat, msg.sender, pendingUSDT_);
            }

            uint256 pendingMDX_ =
                user.shares.mul(accMdxPerShare).div(1e12).sub(
                    user.mdxRewardDebt
                );
            if (pendingMDX_ > 0) {
                safeMDXTransfer(poolInfo[_pid].strat, msg.sender, pendingMDX_);
            }
        }

        if (_wantAmt > 0) {
            pool.want.safeTransferFrom(
                address(msg.sender),
                address(this),
                _wantAmt
            );

            pool.want.safeIncreaseAllowance(pool.strat, _wantAmt);
            uint256 sharesAdded = IStrategy(poolInfo[_pid].strat).deposit(msg.sender, _wantAmt);
            user.shares = user.shares.add(sharesAdded);
        }

        // For stake user
        user.stakeRewardDebt = user.shares.mul(pool.accPerShare).div(1e12);
        user.usdtRewardDebt  = user.shares.mul(accUsdtPerShare).div(1e12);

        // For farm user
        user.mdxRewardDebt     = user.shares.mul(accMdxPerShare).div(1e12);
        user.buybackRewardDebt = user.shares.mul(accBuybackPerShare).div(1e12);

        emit Deposit(msg.sender, _pid, _wantAmt);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _wantAmt) public override nonReentrant {
        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 wantLockedTotal = IStrategy(poolInfo[_pid].strat).wantLockedTotal();
        uint256 sharesTotal     = IStrategy(poolInfo[_pid].strat).sharesTotal();

        require(user.shares > 0, "user.shares is 0");
        require(sharesTotal > 0, "sharesTotal is 0");

        // 1. FarmReward * 2% for Staking YF-USDT LP user
        // 2. FarmReward * 45% for Farm user
        // 3. Buyback FarmReward * 3% to YF for Farm user
        (uint256 accUsdtPerShare, uint256 accMdxPerShare, uint256 accBuybackPerShare) = IStrategy(pool.strat).accFarmRewardPerShare();

        {
            // Withdraw pending YF
            uint256 pendingYF_ =
                user.shares.mul(pool.accPerShare).div(1e12).sub(
                    user.stakeRewardDebt
                );
            if (pendingYF_ > 0) {
                safeYFTransfer(msg.sender, pendingYF_);
            }

            uint256 pendingBuyback_ =
                user.shares.mul(accBuybackPerShare).div(1e12).sub(
                    user.buybackRewardDebt
                );
            if (pendingBuyback_ > 0) {
                safeBuybackTransfer(poolInfo[_pid].strat, msg.sender, pendingBuyback_);
            }

            // Withdraw pending USDT
            uint256 pendingUSDT_ =
                user.shares.mul(accUsdtPerShare).div(1e12).sub(
                    user.usdtRewardDebt
                );
            if (pendingUSDT_ > 0) {
                safeUSDTransfer(poolInfo[_pid].strat, msg.sender, pendingUSDT_);
            }

            // Withdraw pending MDX
            uint256 pendingMDX_ =
                user.shares.mul(accMdxPerShare).div(1e12).sub(
                    user.mdxRewardDebt
                );
            if (pendingMDX_ > 0) {
                safeMDXTransfer(poolInfo[_pid].strat, msg.sender, pendingMDX_);
            }
        }

        // Withdraw want tokens
        uint256 amount = user.shares.mul(wantLockedTotal).div(sharesTotal);
        if (_wantAmt > amount) {
            _wantAmt = amount;
        }
        if (_wantAmt > 0) {
            uint256 sharesRemoved =
                IStrategy(poolInfo[_pid].strat).withdraw(msg.sender, _wantAmt);

            if (sharesRemoved > user.shares) {
                user.shares = 0;
            } else {
                user.shares = user.shares.sub(sharesRemoved);
            }

            uint256 wantBal = IERC20(pool.want).balanceOf(address(this));
            if (wantBal < _wantAmt) {
                _wantAmt = wantBal;
            }

            uint256 fee = IStrategy(poolInfo[_pid].strat).calcWithdrawFee(_wantAmt);
            pool.want.safeTransfer(address(msg.sender), _wantAmt.sub(fee));
        }

        // For stake user
        user.stakeRewardDebt = user.shares.mul(pool.accPerShare).div(1e12);
        user.usdtRewardDebt  = user.shares.mul(accUsdtPerShare).div(1e12);

        // For farm user
        user.mdxRewardDebt     = user.shares.mul(accMdxPerShare).div(1e12);
        user.buybackRewardDebt = user.shares.mul(accBuybackPerShare).div(1e12);

        emit Withdraw(msg.sender, _pid, _wantAmt);
    }

    function withdrawAll(uint256 _pid) public nonReentrant {
        withdraw(_pid, uint256(-1));
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public override nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 wantLockedTotal = IStrategy(poolInfo[_pid].strat).wantLockedTotal();
        uint256 sharesTotal     = IStrategy(poolInfo[_pid].strat).sharesTotal();
        uint256 amount          = user.shares.mul(wantLockedTotal).div(sharesTotal);

        IStrategy(poolInfo[_pid].strat).withdraw(msg.sender, amount);
        pool.want.safeTransfer(address(msg.sender), amount);

        user.shares = 0;
        user.stakeRewardDebt   = 0;
        user.usdtRewardDebt    = 0;
        user.mdxRewardDebt     = 0;
        user.buybackRewardDebt = 0;

        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }

    // Safe YF transfer function, just in case if rounding error causes pool to not have enough
    function safeYFTransfer(address _to, uint256 _amount) internal {
        uint256 YFBalance = IERC20(YF).balanceOf(address(this));

        if (_amount > YFBalance) {
            IERC20(YF).transfer(_to, YFBalance);
        } else {
            IERC20(YF).transfer(_to, _amount);
        }
    }

    function safeBuybackTransfer(address owner, address _to, uint256 _amount) internal {
        uint256 buybackBal = IERC20(YF).allowance(owner, address(this));

        if (_amount > buybackBal) {
            IERC20(YF).safeTransferFrom(owner, _to, buybackBal);
        } else {
            IERC20(YF).safeTransferFrom(owner, _to, _amount);
        }
    }

    function safeUSDTransfer(address owner, address _to, uint256 _amount) internal {
        uint256 usdBal = IERC20(USDT).allowance(owner, address(this));

        if (_amount > usdBal) {
            IERC20(USDT).safeTransferFrom(owner, _to, usdBal);
        } else {
            IERC20(USDT).safeTransferFrom(owner, _to, _amount);
        }
    }

    // Safe MDX transfer function, just in case if rounding error causes pool to not have enough MDXs.
    function safeMDXTransfer(address owner, address _to, uint256 _amount) internal {
        uint256 mdxBal = IERC20(MDX).allowance(owner, address(this));
        if (_amount > mdxBal) {
            IERC20(MDX).safeTransferFrom(owner, _to, mdxBal);
        } else {
            IERC20(MDX).safeTransferFrom(owner, _to, _amount);
        }
    }

    function inCaseTokensGetStuck(address _token, uint256 _amount) public onlyOwner {
        require(_token != YF, "!safe");
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    /// @dev Execute the action via YFCaster, calling its function with the supplied data.
    /// @param pid The strategy ID to execute the action.
    /// @param data Extra data to pass to the target for the execution.
    function execute(
        uint256 pid,
        bytes memory data
    ) external payable lock {
        PoolInfo storage pool = poolInfo[pid];
        address spell = pool.strat;

        EXECUTOR = msg.sender;
        SPELL = spell;

        YFCaster(caster).cast{value: msg.value}(spell, data);

        EXECUTOR = _NO_ADDRESS;
        SPELL = _NO_ADDRESS;
    }

    /// @dev Transmit user assets to the caller, so users only need to approve Bank for spending.
    /// @param token The token to transfer from user to the caller.
    /// @param amount The amount to transfer.
    function transmit(address token, uint amount) external override inExec {
        IERC20(token).safeTransferFrom(EXECUTOR, msg.sender, amount);
    }
}
