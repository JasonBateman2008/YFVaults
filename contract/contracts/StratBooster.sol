// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./interfaces/IDexRouter.sol";
import "./interfaces/IDexPair.sol";
import "./interfaces/IFarmPool.sol";
import "./interfaces/IYFPool.sol";
import "./utils/LpSpell.sol";

interface ISwapMining {
    function takerWithdraw() external;
    function mdx() external returns (address);
}

contract StratBooster is Ownable, ReentrancyGuard, Pausable, LpSpell {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public governor; // timelock contract
    modifier onlyGov() {
        require(msg.sender == governor, 'not the governor');
        _;
    }

    IFarmPool public farmPool; // address of farm, eg, Heco, Bsc etc.
    uint public pid; // pid of pool in farm

    address public constant USDT = 0xa71EdC38d189767582C38A3145b5873052c3e47a;
    address public boardroom;
    address public custodian; // 平台手续费账户

    address public immutable want; // deposit token
    address public token0; // lp token0 iff deposit is lp token
    address public token1; // lp token1 iff deposit is lp token
    address public immutable earned; // earned token

    uint public lastEarnBlock = 0;
    uint public sharesTotal = 0;
    uint public wantLockedTotal = 0;

    uint public constant FEE_DENOMINATOR = 10000; // 100 = 1%
    uint public withdrawFee = 2;

    uint public controllerFee1 = 100;
    uint public controllerFee2 = 300;
    uint public controllerFee3 = 300;

    address[] public token0ToEarnedPath;
    address[] public token1ToEarnedPath;

    constructor(
        IYFPool pool_,
        IFarmPool farmPool_,
        uint pid_,

        address want_,
        address token0_,
        address token1_,
        address earned_,

        IDexRouter router_
    ) LpSpell(router_, pool_) public {
        require(want_ != address(0), "Zero address");

        transferOwnership(address(pool_));
        governor = msg.sender;

        want = want_;
        token0 = token0_;
        token1 = token1_;
        earned = earned_;

        farmPool = farmPool_;
        pid = pid_;

        token0ToEarnedPath = [token0, USDT, earned_];
        if (USDT == token0) {
            token0ToEarnedPath = [USDT, earned_];
        }

        token1ToEarnedPath = [token1, USDT, earned_];
        if (USDT == token1) {
            token1ToEarnedPath = [USDT, earned_];
        }
    }

    /// @dev View function to see pending BOO
    function pending() public view returns (uint, uint) {
        uint balance = IERC20(earned).balanceOf(address(this));
        uint rewards = farmPool.pendingRewards(7, address(this));
        (uint amount,,) = farmPool.userInfo(7, address(this));
        return (balance.add(rewards).add(amount), 0);
    }

    /// @dev Claim MDEX rewards
    /// @param _userAddress The user
    /// @param _rewards0 The BOO rewards
    /// @param _rewards1 The YF or others rewards
    /// @return The BOO rewards claimed
    /// @return The others rewards claimed
    function claim(address _userAddress, uint _rewards0, uint _rewards1) external onlyOwner returns (uint, uint) {
        uint _balance = IERC20(earned).balanceOf(address(this));
        // 1. 已领收益
        if (_rewards0 <= _balance) {
            IERC20(earned).safeTransfer(_userAddress, _rewards0);
            return (_rewards0, _rewards1);
        }

        // 2. 领取尚未领取的收益
        farmPool.claim(7);
        _balance = IERC20(earned).balanceOf(address(this));

        if (_rewards0 <= _balance) {
            IERC20(earned).safeTransfer(_userAddress, _rewards0);
            return (_rewards0, _rewards1);
        }

        // 3. 提取BOO单币池的本金
        farmPool.withdraw(7, _rewards0.sub(_balance));
        _balance = IERC20(earned).balanceOf(address(this));

        if (_rewards0 > _balance) {
            _rewards0 = _balance;
        }

        if (_rewards0 > 0) {
            IERC20(earned).safeTransfer(_userAddress, _rewards0);
        }
        return (_rewards0, _rewards1);
    }

    // Receives new deposits from user
    function deposit(address _userAddress, uint _wantAmt) external onlyOwner whenNotPaused returns (uint) {
        // Shh...
        _userAddress;

        sharesTotal = sharesTotal.add(_wantAmt);
        wantLockedTotal = wantLockedTotal.add(_wantAmt);

        ensureApprove(want, address(farmPool));
        farmPool.deposit(pid, _wantAmt);

        return _wantAmt;
    }

    function withdraw(address _userAddress, uint _wantAmt) external onlyOwner nonReentrant returns (uint) {
        require(_wantAmt > 0, "_wantAmt <= 0");
        farmPool.withdraw(pid, _wantAmt);

        // Shh...
        _userAddress;

        // Withdraw fee: 0.02%
        uint fee = _wantAmt.mul(withdrawFee).div(FEE_DENOMINATOR);
        if (fee > 0) {
            IERC20(want).safeTransfer(custodian, fee);
        }

        sharesTotal = sharesTotal.sub(_wantAmt);
        wantLockedTotal = wantLockedTotal.sub(_wantAmt);

        // LP 拆成单币给用户
        WithdrawAmounts memory amt = WithdrawAmounts(_wantAmt.sub(fee), 0, 0);
        removeLiquidityInternal(token0, token1, want, amt);

        return _wantAmt;
    }

    /// @dev 1. Claim BOO-XXX LP rewards
    /// @dev 2. Deposits rewards(BOO) to BOO单币质押池
    /// @dev 3. Claim BOO 单币池 rewards
    /// @dev 4. Deposits to BOO单币质押池
    function earn() external whenNotPaused onlyGov {
        ensureApprove(earned, address(router));
        ensureApprove(earned, address(farmPool));

        // Step 1
        uint _before = IERC20(earned).balanceOf(address(this));
        farmPool.claim(pid);

        // Step 2
        uint _rewards = IERC20(earned).balanceOf(address(this)).sub(_before);
        if (_rewards > 0) {
            // 1%卖成USDT给平台手续费账户
            uint fee1 = _rewards.mul(controllerFee1).div(FEE_DENOMINATOR);
            if (fee1 > 0) {
                address[] memory path = new address[](2);
                (path[0], path[1]) = (earned, USDT);
                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    fee1,
                    0,
                    path,
                    custodian,
                    block.timestamp.add(60)
                );
            }

            // 3%以BOO的形式给平台手续费账户
            uint fee2 = _rewards.mul(controllerFee2).div(FEE_DENOMINATOR);
            if (fee2 > 0) {
                IERC20(earned).safeTransfer(custodian, fee2);
            }

            // 3%以BOO的形式给boardroom
            uint fee3 = _rewards.mul(controllerFee3).div(FEE_DENOMINATOR);
            if (fee3 > 0) {
                IERC20(earned).safeTransfer(boardroom, fee3);
            }

            // 93%投入BOO单币池, 挖出的BOO全部给用户
            uint reinvest = _rewards.sub(fee1).sub(fee2).sub(fee3);
            if (reinvest > 0) {
                farmPool.deposit(7, reinvest);
            }
        }

        // Step 3
        farmPool.claim(7);

        // Step 4
        _rewards = IERC20(earned).balanceOf(address(this));
        if (_rewards > 0) {
            farmPool.deposit(7, _rewards);
        }
    }

    event SetGov(address indexed gov);
    function setGov(address governor_) external onlyGov {
        require(governor_ != address(0), "Zero address");
        governor = governor_;
        emit SetGov(governor_);
    }

    event SetFundsAccount(address indexed boardroom, address indexed custodian);

    /// @dev Reward distribute to
    /// @param boardroom_ 基金会地址
    /// @param custodian_ 平台费用
    function setFundsAccount(address boardroom_, address custodian_) external onlyGov {
        require(boardroom_ != address(0), "Zero address");
        require(custodian_ != address(0), "Zero address");

        boardroom = boardroom_;
        custodian = custodian_;
        emit SetFundsAccount(boardroom_, custodian_);
    }

    event SetWithdrawFee(uint indexed rate);
    function setWithdrawFee(uint rate_) external onlyGov {
        require(rate_ < FEE_DENOMINATOR, "Fee rate overflow");
        withdrawFee = rate_;
        emit SetWithdrawFee(rate_);
    }

    event SetControllerFee(uint indexed fee1, uint indexed fee2, uint indexed fee3);
    function setControllerFee(uint fee1, uint fee2, uint fee3) external onlyGov {
        require(fee1 + fee2 + fee3 < FEE_DENOMINATOR, "Overflow of Proportions");
        controllerFee1 = fee1;
        controllerFee2 = fee2;
        controllerFee3 = fee3;
        emit SetControllerFee(fee1, fee2, fee3);
    }

    function pause() external onlyGov {
        _pause();
    }

    function unpause() external onlyGov {
        _unpause();
    }

    function inCaseTokensGetStuck(address _token, uint _amount, address _to) external onlyGov {
        require(_token != earned, "!safe");
        require(_token != want, "!safe");
        require(_token != token0, "!safe");
        require(_token != token1, "!safe");
        IERC20(_token).safeTransfer(_to, _amount);
    }

    function convertDustToEarned() external {
        require(token0 != address(0), "!safe");
        require(token1 != address(0), "!safe");
        require(earned != address(0), "!safe");

        // Converts dust tokens into earned tokens, which will be reinvested on the next earn().
        // Converts token0 dust (if any) to earned tokens
        uint token0Amt = IERC20(token0).balanceOf(address(this));
        if (token0 != earned && token0Amt > 0) {
            ensureApprove(token0, address(router));
            // Swap all dust tokens to earned tokens
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                token0Amt,
                0,
                token0ToEarnedPath,
                address(this),
                block.timestamp.add(60)
            );
        }

        // Converts token1 dust (if any) to earned tokens
        uint token1Amt = IERC20(token1).balanceOf(address(this));
        if (token1 != earned && token1Amt > 0) {
            ensureApprove(token1, address(router));
            // Swap all dust tokens to earned tokens
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                token1Amt,
                0,
                token1ToEarnedPath,
                address(this),
                block.timestamp.add(60)
            );
        }
    }

    function harvestSwapMiningReward() external {
        ISwapMining mining = ISwapMining(0x7373c42502874C88954bDd6D50b53061F018422e);
        address mdx = mining.mdx();
        uint _before = IERC20(mdx).balanceOf(address(this));
        mining.takerWithdraw();
        uint _after = IERC20(mdx).balanceOf(address(this));
        uint _reward = _after.sub(_before);
        IERC20(mdx).safeTransfer(custodian, _reward);
    }

    function addLiquidityWERC20(Amounts calldata amt) external payable override {
        uint _beforeWHTBal    = IERC20(WHT).balanceOf(address(this));
        uint _beforeToken0Bal = IERC20(token0).balanceOf(address(this));
        uint _beforeToken1Bal = IERC20(token1).balanceOf(address(this));

        // 1-5. add liquidity
        addLiquidityInternal(token0, token1, want, amt);

        // 6. Refund leftovers to users
        doRefundETH(IERC20(WHT).balanceOf(address(this)).sub(_beforeWHTBal));

        if (token0 != WHT) {
            doRefund(token0, IERC20(token0).balanceOf(address(this)).sub(_beforeToken0Bal));
        }
        if (token1 != WHT) {
            doRefund(token1, IERC20(token1).balanceOf(address(this)).sub(_beforeToken1Bal));
        }
    }
}
