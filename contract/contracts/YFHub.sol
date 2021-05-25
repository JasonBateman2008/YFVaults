// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";

import "./interfaces/IDexRouter.sol";
import "./interfaces/IYFPool.sol";
import "./interfaces/IStrategy.sol";

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

contract YFHub is Ownable, ReentrancyGuard, IYFPool {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    // Info of each user.
    struct UserInfo {
        uint shares;     // How many want tokens the user has provided.
        uint principals;

        uint reward0Remain;
        uint reward0Debt; // Reward0 farm harvest debt

        uint reward1Remain;
        uint reward1Debt; // Reward1 farm harvest debt

        // We do some fancy math here. Basically, any point in time, the amount of YFToken
        // entitled to a user but is pending to be distributed is:
        //
        //   amount = user.shares / sharesTotal * wantLockedTotal
        //   pending reward = (amount * pool.accPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws want tokens to a pool. Here's what happens:
        //   1. The pool's `accPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    struct PoolInfo {
        address want;    // Address of the want token.
        address earned;  // Address of the harvest token.

        uint acc0PerShare;
        uint acc1PerShare;

        uint last0Pending;
        uint last1Pending;

        uint totalAmount;
        uint lastRewardBlock; // Last block number that BOO rewards occurs.

        IStrategy strat;      // Strategy address that will auto compound want tokens
    }

    EnumerableSet.AddressSet whitelist;
    PoolInfo[] public poolInfo; // Info of each pool.
    mapping(uint => mapping(address => UserInfo)) public userInfo; // Info of each user that stakes LP tokens.

    event Claim(address indexed user, uint indexed pid, uint amount0, uint amount1);
    event Deposit(address indexed user, uint indexed pid, uint amount);
    event Withdraw(address indexed user, uint indexed pid, uint amount);
    event EmergencyWithdraw(address indexed user, uint indexed pid, uint amount);

    address public immutable caster; // The caster address for untrusted execution.
    address public constant router = 0xED7d5F38C79115ca12fe6C0041abb22F0A06C300;

    address public constant USDT = 0xa71EdC38d189767582C38A3145b5873052c3e47a;
    address public constant YF = 0x0D1cde65E2DBa76D08c29867Aa3bC1b84e1E3AEd;

    address private constant _NO_ADDRESS = address(1);
    address public override EXECUTOR; // TEMPORARY: user currently under execution.

    uint public immutable startBlock;
    constructor(uint _startBlock) public {
        startBlock = _startBlock;
        caster = address(new YFCaster());
        EXECUTOR = _NO_ADDRESS;
    }

    function poolLength() external view returns (uint) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // *** DO NOT add the same LP token more than once.
    // *** Rewards will be messed up if you do. (Only if want tokens are stored here.)
    function add(
        address _want,
        address _earned,
        IStrategy _strat
    ) public override onlyOwner {
        uint lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        whitelist.add(address(_strat));

        poolInfo.push(
            PoolInfo({
                want: _want,
                earned: _earned,

                acc0PerShare: 0,
                acc1PerShare: 0,

                last0Pending: 0,
                last1Pending: 0,

                totalAmount: 0,
                lastRewardBlock: lastRewardBlock,

                strat: _strat
            })
        );
    }

    /// @dev Update reward variables of the given pool to be up-to-date.
    function updatePool(uint _pid) public {
        PoolInfo storage pool = poolInfo[_pid];

        if (block.number <= pool.lastRewardBlock) {
            return;
        }

        if (pool.totalAmount == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        (uint pending0, uint pending1) = pool.strat.pending();
        (uint rewards0, uint rewards1) = (pending0.sub(pool.last0Pending), pending1.sub(pool.last1Pending));

        if (rewards0 > 0) {
            pool.acc0PerShare = pool.acc0PerShare.add(rewards0.mul(1e12).div(pool.totalAmount));
            pool.last0Pending = pending0;
        }

        if (rewards1 > 0) {
            pool.acc1PerShare = pool.acc1PerShare.add(rewards1.mul(1e12).div(pool.totalAmount));
            pool.last1Pending = pending1;
        }

        pool.lastRewardBlock = block.number;
    }

    /// @dev View function to see staked Want tokens on frontend.
    /// @param _pid id of pool.
    /// @param _user the user to staked
    /// @return the total staked
    /// @return the total principal
    function stakedWantTokens(uint _pid, address _user) external view returns (uint, uint) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint sharesTotal = pool.totalAmount;
        uint wantLockedTotal = pool.strat.wantLockedTotal();

        if (sharesTotal == 0) {
            return (0, 0);
        }

        return (
            user.shares.mul(wantLockedTotal).div(sharesTotal),
            user.principals
        );
    }

    /// @dev View function to see pending rewards on frontend.
    /// @param _pid id of pool.
    /// @param _user the user to staked
    /// @return pending0 the BOO or MDX pending rewards
    /// @return pending1 the others pending rewards
    function pending(uint _pid, address _user) external override view returns (uint, uint) {
        PoolInfo storage pool = poolInfo[_pid];
        (uint pending0, uint pending1) = _pending(_pid, _user);

        // BOO or MDX swap to YF
        if (pending1 > 0) {
            address[] memory path = new address[](3);
            (path[0], path[1], path[2]) = (pool.earned, USDT, YF);
            uint[] memory amounts = IDexRouter(router).getAmountsOut(pending1, path);
            pending1 = amounts[2];
        }

        return (pending0, pending1);
    }

    function _pending(uint _pid, address _user) internal view returns (uint, uint) {
        UserInfo storage user = userInfo[_pid][_user];
        (uint rewards0, uint rewards1) = totalRewards(_pid, _user);

        return (
            rewards0.add(user.reward0Remain).sub(user.reward0Debt),
            rewards1.add(user.reward1Remain).sub(user.reward1Debt)
        );
    }

    function totalRewards(uint _pid, address _user) public override view returns (uint, uint) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint acc0PerShare = pool.acc0PerShare;
        uint acc1PerShare = pool.acc1PerShare;

        if (block.number > pool.lastRewardBlock && pool.totalAmount > 0) {
            (uint pending0, uint pending1) = pool.strat.pending();
            (uint rewards0, uint rewards1) = (pending0.sub(pool.last0Pending), pending1.sub(pool.last1Pending));

            if (rewards0 > 0) {
                acc0PerShare = acc0PerShare.add(rewards0.mul(1e12).div(pool.totalAmount));
            }

            if (rewards1 > 0) {
                acc1PerShare = acc1PerShare.add(rewards1.mul(1e12).div(pool.totalAmount));
            }
        }

        return (
            user.shares.mul(acc0PerShare).div(1e12),
            user.shares.mul(acc1PerShare).div(1e12)
        );
    }

    function claimAll() external {
        uint length = poolInfo.length;
        for (uint pid = 0; pid < length; pid++) {
            claim(pid);
        }
    }

    function claim(uint _pid) public override nonReentrant {
        updatePool(_pid);
        EXECUTOR = msg.sender;

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][EXECUTOR];

        (uint rewards0, uint rewards1) = _pending(_pid, EXECUTOR);
        if (rewards0 > 0 || rewards1 > 0) {
            pool.strat.claim(EXECUTOR, rewards0, rewards1);
            (pool.last0Pending, pool.last1Pending) = pool.strat.pending();

            user.reward0Remain = 0;
            user.reward1Remain = 0;
            (user.reward0Debt, user.reward1Debt) = totalRewards(_pid, EXECUTOR);
        }

        EXECUTOR = _NO_ADDRESS;
        emit Claim(EXECUTOR, _pid, rewards0, rewards1);
    }

    function deposit(uint _pid, uint _wantAmt) external override nonReentrant {
        updatePool(_pid);
        EXECUTOR = msg.sender;

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][EXECUTOR];

        if (user.shares > 0) {
            (user.reward0Remain, user.reward1Remain) = _pending(_pid, EXECUTOR);
        }

        if (_wantAmt > 0) {
            // 1. transfer to strategy
            IERC20(pool.want).safeTransferFrom(EXECUTOR, address(pool.strat), _wantAmt);
            uint sharesAdded = pool.strat.deposit(EXECUTOR, _wantAmt);

            // 2. increase user shares
            user.shares = user.shares.add(sharesAdded);
            pool.totalAmount = pool.totalAmount.add(sharesAdded);

            // 3. increase user principals
            user.principals = user.principals.add(_wantAmt);
        }
        (user.reward0Debt, user.reward1Debt) = totalRewards(_pid, EXECUTOR);

        EXECUTOR = _NO_ADDRESS;
        emit Deposit(msg.sender, _pid, _wantAmt);
    }

    function withdraw(uint _pid, uint _wantAmt) public override nonReentrant {
        updatePool(_pid);
        EXECUTOR = msg.sender;

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][EXECUTOR];

        uint sharesTotal     = pool.totalAmount;
        uint wantLockedTotal = pool.strat.wantLockedTotal();

        require(user.shares > 0, "user.shares is 0");
        require(wantLockedTotal > 0, "pool.totalAmount is 0");

        uint amount = user.shares.mul(wantLockedTotal).div(sharesTotal);
        (user.reward0Remain, user.reward1Remain) = _pending(_pid, EXECUTOR);

        // Withdraw all want tokens
        if (_wantAmt > amount) {
            _wantAmt = amount;
        }

        if (_wantAmt > 0) {
            uint sharesRemoved = pool.strat.withdraw(EXECUTOR, _wantAmt);

            if (sharesRemoved > user.shares) {
                user.shares = 0;
            } else {
                user.shares = user.shares.sub(sharesRemoved);
            }

            if (_wantAmt > user.principals) {
                user.principals = 0;
            } else {
                user.principals = user.principals.sub(_wantAmt);
            }

            if (sharesRemoved > pool.totalAmount) {
                pool.totalAmount = 0;
            } else {
                pool.totalAmount = pool.totalAmount.sub(sharesRemoved);
            }
        }
        (user.reward0Debt, user.reward1Debt) = totalRewards(_pid, EXECUTOR);

        EXECUTOR = _NO_ADDRESS;
        emit Withdraw(msg.sender, _pid, _wantAmt);
    }

    function withdrawAll(uint _pid) public {
        withdraw(_pid, uint(-1));
    }

    function emergencyWithdraw(uint _pid) external override nonReentrant {
        EXECUTOR = msg.sender;

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][EXECUTOR];

        uint sharesTotal = pool.totalAmount;
        uint wantLockedTotal = pool.strat.wantLockedTotal();

        uint _wantAmt = user.shares.mul(wantLockedTotal).div(sharesTotal);
        pool.strat.withdraw(msg.sender, _wantAmt);
        pool.totalAmount = pool.totalAmount.sub(user.shares);

        user.shares        = 0;
        user.principals    = 0;

        user.reward0Debt   = 0;
        user.reward1Debt   = 0;
        user.reward0Remain = 0;
        user.reward1Remain = 0;

        EXECUTOR = _NO_ADDRESS;
        emit EmergencyWithdraw(msg.sender, _pid, _wantAmt);
    }

    /// @dev Execute the action via YFCaster, calling its function with the supplied data.
    /// @param _pid The strategy ID to execute the action.
    /// @param data Extra data to pass to the target for the execution.
    function execute(
        uint _pid,
        bytes memory data
    ) external payable nonReentrant {
        updatePool(_pid);
        EXECUTOR = msg.sender;

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][EXECUTOR];

        // Spell single token to lp
        YFCaster(caster).cast{value: msg.value}(address(pool.strat), data);
        uint _wantAmt = IERC20(pool.want).balanceOf(address(pool.strat));

        if (user.shares > 0) {
            (user.reward0Remain, user.reward1Remain) = _pending(_pid, EXECUTOR);
        }

        if (_wantAmt > 0) {
            // 1. deposit to strategy
            uint sharesAdded = pool.strat.deposit(EXECUTOR, _wantAmt);

            // 2. increase user shares
            user.shares = user.shares.add(sharesAdded);
            pool.totalAmount = pool.totalAmount.add(sharesAdded);

            // 3. increase user principals
            user.principals = user.principals.add(_wantAmt);
        }
        (user.reward0Debt, user.reward1Debt) = totalRewards(_pid, EXECUTOR);

        EXECUTOR = _NO_ADDRESS;
        emit Deposit(msg.sender, _pid, _wantAmt);
    }

    /// @dev Transmit user assets to the caller, so users only need to approve Bank for spending.
    /// @param token The token to transfer from user to the caller.
    /// @param amount The amount to transfer.
    function transmit(address token, uint amount) external override {
        require(whitelist.contains(msg.sender), "invalid strategy");
        IERC20(token).safeTransferFrom(EXECUTOR, msg.sender, amount);
    }
}
