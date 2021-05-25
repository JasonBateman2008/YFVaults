// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./interfaces/IDexRouter.sol";
import "./interfaces/IFarmPool.sol";
import "./interfaces/IYFPool.sol";
import "./utils/LpSpell.sol";

interface IStrategyHub {
    function transit() external;
}

interface ISwapMining {
    function takerWithdraw() external;
    function mdx() external returns (address);
}

contract StratMdex is Ownable, ReentrancyGuard, Pausable, LpSpell {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public governor; // timelock contract
    modifier onlyGov() {
        require(msg.sender == governor, 'not the governor');
        _;
    }

    IStrategyHub public stratHub;  // deal to YF-USDT N% of earned(USDT)

    IFarmPool public farmPool; // address of farm, eg, Heco, Bsc etc.
    uint public pid; // pid of pool in farm

    address public constant USDT = 0xa71EdC38d189767582C38A3145b5873052c3e47a;
    address public constant YF = 0x0D1cde65E2DBa76D08c29867Aa3bC1b84e1E3AEd;

    address public boardroom;
    address public custodian; // 平台手续费账户

    address public immutable want; // deposit token
    address public token0; // lp token0 iff deposit is lp token
    address public token1; // lp token1 iff deposit is lp token
    address public immutable earned; // earned token

    uint public sharesTotal = 0;
    uint public wantLockedTotal = 0;

    uint public lastEarnBlock = 0;
    uint public lastFeeTotal = 0;
    uint public lastReinvestTotal = 0;

    uint public constant FEE_DENOMINATOR = 10000; // 100 = 1%
    uint public withdrawFee = 2;

    uint public controllerFee1 = 100;
    uint public controllerFee2 = 300;
    uint public controllerFee3 = 300;
    uint public repurchaseRate = 300;
    uint public reinvestedRate = 4500;

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

        IDexRouter router_,
        IStrategyHub stratHub_
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
        stratHub = stratHub_;

        token0ToEarnedPath = [token0, USDT, earned_];
        if (USDT == token0) {
            token0ToEarnedPath = [USDT, earned_];
        }

        token1ToEarnedPath = [token1, USDT, earned_];
        if (USDT == token1) {
            token1ToEarnedPath = [USDT, earned_];
        }
    }

    function _claimMDX() internal {
        uint _before = IERC20(earned).balanceOf(address(this));
        farmPool.withdraw(pid, 0);

        uint _rewards = IERC20(earned).balanceOf(address(this)).sub(_before);
        if (_rewards > 0) {
            lastFeeTotal = lastFeeTotal.add(_rewards.mul(
                controllerFee1.add(controllerFee2).add(controllerFee3)
            ).div(FEE_DENOMINATOR));

            // 待复投收益
            lastReinvestTotal = lastReinvestTotal.add(_rewards.mul(reinvestedRate).div(FEE_DENOMINATOR));
        }
    }

    function _transferEarnedTo(address _user, uint _rewards0, uint _rewards1) internal {
        // 1. MDX rewards
        if (_rewards0 > 0) {
            IERC20(earned).safeTransfer(_user, _rewards0);
        }

        // 2. repurchase YF rewards
        if (_rewards1 > 0) {
            address[] memory path = new address[](3);
            (path[0], path[1], path[2]) = (earned, USDT, YF);

            ensureApprove(earned, address(router));
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                _rewards1,
                0,
                path,
                custodian,
                block.timestamp.add(60)
            );
        }
    }

    /// @dev View function to see pending MDX & YF
    function pending() public view returns (uint, uint) {
        uint _before = IERC20(earned).balanceOf(address(this));
        (uint _rewards, ) = farmPool.pending(pid, address(this));

        // fee + reinvested
        uint _deduction = _rewards.mul(
            controllerFee1.add(controllerFee2).add(controllerFee3).add(reinvestedRate)
        ).div(FEE_DENOMINATOR);

        // 全部可领收益
        uint _balance = _rewards.sub(_deduction).add(
            _before.sub(lastFeeTotal).sub(lastReinvestTotal)
        );

        // will repurchase YF
        uint mdx1 = _balance.mul(repurchaseRate).div(FEE_DENOMINATOR);
        // mdx
        uint mdx2 = _balance.sub(mdx1);

        return (mdx2, mdx1);
    }

    /// @dev Claim MDEX rewards
    /// @param _userAddress The user
    /// @param _rewards0 The MDX rewards
    /// @param _rewards1 The YF or others rewards
    /// @return The MDX rewards claimed
    /// @return The others rewards claimed
    function claim(address _userAddress, uint _rewards0, uint _rewards1) external onlyOwner returns (uint, uint) {
        uint _balance = IERC20(earned).balanceOf(address(this)).sub(
            lastFeeTotal.add(lastReinvestTotal)
        );

        // 1. 已领收益
        if (_rewards0.add(_rewards1) <= _balance) {
            _transferEarnedTo(_userAddress, _rewards0, _rewards1);
            return (_rewards0, _rewards1);
        }

        // 2. 领取尚未领取的收益
        _claimMDX();
        _balance = IERC20(earned).balanceOf(address(this)).sub(
            lastFeeTotal.add(lastReinvestTotal)
        );

        // 3. 发放收益
        if (_rewards0.add(_rewards1) <= _balance) {
            _transferEarnedTo(_userAddress, _rewards0, _rewards1);
            return (_rewards0, _rewards1);
        }

        if (_rewards1 < _balance) {
            _transferEarnedTo(_userAddress, _balance.sub(_rewards1), _rewards1);
            return (_balance.sub(_rewards1), _rewards1);
        }

        if (_rewards0 < _balance) {
            _transferEarnedTo(_userAddress, _rewards0, _balance.sub(_rewards0));
            return (_rewards0, _balance.sub(_rewards0));
        }

        return (0, 0);
    }

    // Receives new deposits from user
    function deposit(address _userAddress, uint _wantAmt) external onlyOwner whenNotPaused returns (uint) {
        // Shh...
        _userAddress;

        // 领取尚未领取的收益
        _claimMDX();

        uint sharesAdded = _wantAmt;
        if (wantLockedTotal > 0) {
            sharesAdded = _wantAmt.mul(sharesTotal).div(wantLockedTotal);
        }

        sharesTotal = sharesTotal.add(sharesAdded);
        wantLockedTotal = wantLockedTotal.add(_wantAmt);

        ensureApprove(want, address(farmPool));
        farmPool.deposit(pid, _wantAmt);

        return sharesAdded;
    }

    function withdraw(address _userAddress, uint _wantAmt) external onlyOwner nonReentrant returns (uint) {
        // Shh...
        _userAddress;
        require(_wantAmt > 0, "_wantAmt <= 0");

        // 领取尚未领取的收益
        _claimMDX();

        if (wantLockedTotal < _wantAmt) {
            _wantAmt = wantLockedTotal;
        }

        // Withdraw LP from Mdex
        farmPool.withdraw(pid, _wantAmt);

        uint sharesRemoved = _wantAmt.mul(sharesTotal).div(wantLockedTotal);
        if (sharesRemoved > sharesTotal) {
            sharesRemoved = sharesTotal;
        }

        // Withdraw fee: 0.02%
        uint fee = _wantAmt.mul(withdrawFee).div(FEE_DENOMINATOR);
        if (fee > 0) {
            IERC20(want).safeTransfer(custodian, fee);
        }

        sharesTotal = sharesTotal.sub(sharesRemoved);
        wantLockedTotal = wantLockedTotal.sub(_wantAmt);

        // LP 拆成单币给用户
        WithdrawAmounts memory amt = WithdrawAmounts(_wantAmt.sub(fee), 0, 0);
        removeLiquidityInternal(token0, token1, want, amt);

        return sharesRemoved;
    }

    /// @dev 1. Claim Mdex LP rewards
    /// @dev 2. deal to fee
    /// @dev 3. Reinvest to Mdex
    function earn() external whenNotPaused onlyGov {
        ensureApprove(want, address(farmPool));
        ensureApprove(earned, address(farmPool));
        ensureApprove(earned, address(router));
        ensureApprove(token0, address(router));
        ensureApprove(token1, address(router));

        // Step 1
        _claimMDX();
        lastEarnBlock = block.number;

        // Step 2
        uint _balance = IERC20(earned).balanceOf(address(this));
        if (_balance < lastFeeTotal) {
            lastFeeTotal = _balance;
        }

        if (lastFeeTotal > 0) {
            address[] memory path = new address[](2);
            (path[0], path[1]) = (earned, USDT);

            // 1%卖成USDT给平台手续费账户
            uint denom = controllerFee1.add(controllerFee2).add(controllerFee3);
            uint fee1 = lastFeeTotal.mul(controllerFee1).div(denom);
            if (fee1 > 0) {
                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    fee1,
                    0,
                    path,
                    custodian,
                    block.timestamp.add(60)
                );
            }

            // 3%卖成USDT给平台手续费账户
            uint fee2 = lastFeeTotal.mul(controllerFee2).div(denom);
            if (fee2 > 0) {
                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    fee2,
                    0,
                    path,
                    boardroom,
                    block.timestamp.add(60)
                );
            }

            // 3%卖成USDT给share池用户
            uint fee3 = lastFeeTotal.sub(fee1).sub(fee2);
            if (fee3 > 0) {
                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    fee3,
                    0,
                    path,
                    address(stratHub),
                    block.timestamp.add(60)
                );
                stratHub.transit();
            }

            lastFeeTotal = 0;
        }

        // Step 3
        _balance = IERC20(earned).balanceOf(address(this));
        if (_balance < lastReinvestTotal) {
            lastReinvestTotal = _balance;
        }

        if (lastReinvestTotal > 0) {
            address[] memory path;

            // Get lpToken tokens, ie. add liquidity
            uint token0Amt = lastReinvestTotal.div(2);
            uint token1Amt = lastReinvestTotal.div(2);

            // Swap half earned to token0
            if (earned != token0 && token0Amt > 0) {
                uint _beforeToken0Amt = IERC20(token0).balanceOf(address(this));
                if (token0 == USDT) {
                    path = new address[](2);
                    (path[0], path[1]) = (earned, token0);
                }
                else {
                    path = new address[](3);
                    (path[0], path[1], path[2]) = (earned, USDT, token0);
                }

                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    token0Amt,
                    0,
                    path,
                    address(this),
                    block.timestamp.add(60)
                );
                token0Amt = IERC20(token0).balanceOf(address(this)).sub(_beforeToken0Amt);
            }

            if (earned != token1 && token1Amt > 0) {
                uint _beforeToken1Amt = IERC20(token1).balanceOf(address(this));
                if (token1 == USDT) {
                    path = new address[](2);
                    (path[0], path[1]) = (earned, token1);
                }
                else {
                    path = new address[](3);
                    (path[0], path[1], path[2]) = (earned, USDT, token1);
                }

                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    token1Amt,
                    0,
                    path,
                    address(this),
                    block.timestamp.add(60)
                );
                token1Amt = IERC20(token1).balanceOf(address(this)).sub(_beforeToken1Amt);
            }

            if (token0Amt > 0 && token1Amt > 0) {
                router.addLiquidity(
                    token0,
                    token1,
                    token0Amt,
                    token1Amt,
                    0,
                    0,
                    address(this),
                    block.timestamp.add(60)
                );
            }

            uint wantAmt = IERC20(want).balanceOf(address(this));
            if (wantAmt > 0) {
                farmPool.deposit(pid, wantAmt);
                wantLockedTotal = wantLockedTotal.add(wantAmt);
            }
            lastReinvestTotal = 0;
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

    event SetRepurchaseRate(uint indexed rate);
    function setRepurchaseRate(uint rate_) external onlyGov {
        require(rate_ < FEE_DENOMINATOR, "Repurchase rate overflow");
        repurchaseRate = rate_;
        emit SetRepurchaseRate(rate_);
    }

    event SetReinvestedRate(uint indexed rate);
    function setReinvestedRate(uint rate_) external onlyGov {
        require(rate_ < FEE_DENOMINATOR, "Reinvested rate overflow");
        reinvestedRate = rate_;
        emit SetReinvestedRate(rate_);
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
