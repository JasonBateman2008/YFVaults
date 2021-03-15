// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./interfaces/IMasterChefHeco.sol";
import "./interfaces/IMdexFactory.sol";
import "./interfaces/IMdexRouter.sol";
import "./interfaces/IMdexPair.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IYFVaults.sol";
import "./utils/HomoraMath.sol";

contract StratHecoPool is Ownable, ReentrancyGuard, Pausable {
    // Maximize yields in HecoPool

    using SafeMath for uint256;
    using HomoraMath for uint256;
    using SafeERC20 for IERC20;

    address public constant WHT  = 0x5545153CCFcA01fbd7Dd11C0b23ba694D9509A6F;
    address public constant USDT = 0xa71EdC38d189767582C38A3145b5873052c3e47a;

    bool public onlyGov = true;
    bool public isAutoComp; // this vault is purely for staking. eg. MDEX YF-USDT LP staking vault.

    address public lpPoolAddress; // address of farm, eg, HecoPool etc.
    uint256 public pid; // pid of pool in lpPoolAddress

    mapping(address => mapping(address => bool)) public approved;

    address public lpToken;
    address public token0Address;
    address public token1Address;
    address public earnedAddress;

    IMdexRouter public router; // router of uniswap, mdex etc
    IMdexFactory public factory;

    address public YFVAddress;
    address public YFTokenAddress;
    address public govAddress; // timelock contract

    uint256 public lastEarnBlock   = 0;
    uint256 public wantLockedTotal = 0;
    uint256 public sharesTotal     = 0;

    uint256 public buyBackRate    = 300;
    uint256 public constant buyBackRateMax = 10000; // 100 = 1%
    uint256 public constant buyBackRateUL  = 800;

    uint256 public withdrawFee = 15;
    uint256 public constant withdrawFeeMax = 100000; // 100 = 1%

    uint256 public directEarning = 4500;
    uint256 public constant directEarningMax = 10000; // 100 = 1%

    // 2% earning => USDT => stake YF-USDT
    uint256 public controllerFee = 200;
    uint256 public constant controllerFeeMax = 10000; // 100 = 1%
    uint256 public constant controllerFeeUL = 300;

    // *** Deprecated
    uint256 public entranceFeeFactor = 9990; // < 0.1% entrance fee - goes to pool + prevents front-running
    uint256 public constant entranceFeeFactorMax = 10000;
    uint256 public constant entranceFeeFactorLL = 9950; // 0.5% is the max entrance fee settable. LL = lowerlimit

    address[] public earnedToYFPath;
    address[] public earnedToUSDTPath;

    address[] public earnedToToken0Path;
    address[] public earnedToToken1Path;

    address[] public token0ToEarnedPath;
    address[] public token1ToEarnedPath;

    uint256 public accUsdtPerShare    = 0;
    uint256 public accMdxPerShare     = 0;
    uint256 public accBuybackPerShare = 0;

    constructor(
        bool _isAutoComp,
        address _govAddress,

        address _YFVAddress,
        address _YFTokenAddress,

        uint256 _pid,
        address _lpPoolAddress,
        address _lpToken,
        address _token0Address,
        address _token1Address,
        address _earnedAddress,

        IMdexRouter _router,
        IMdexFactory _factory
    ) public {
        isAutoComp = _isAutoComp;
        govAddress = _govAddress;

        YFVAddress = _YFVAddress;
        YFTokenAddress = _YFTokenAddress;

        lpToken = _lpToken; // Farm or Stake token
        token0Address = _token0Address;
        token1Address = _token1Address;

        if (isAutoComp) {
            pid = _pid;

            lpPoolAddress = _lpPoolAddress; // Maybe HecoPool
            earnedAddress = _earnedAddress; // Maybe MDX

            router = _router; // Maybe Mdex Router
            factory = _factory;

            earnedToYFPath = [earnedAddress, WHT, YFTokenAddress];
            if (WHT == earnedAddress) {
                earnedToYFPath = [WHT, YFTokenAddress];
            }

            earnedToUSDTPath = [earnedAddress, WHT, USDT];
            if (WHT == earnedAddress) {
                earnedToUSDTPath = [WHT, USDT];
            }

            earnedToToken0Path = [earnedAddress, WHT, token0Address];
            if (WHT == token0Address) {
                earnedToToken0Path = [earnedAddress, WHT];
            }

            earnedToToken1Path = [earnedAddress, WHT, token1Address];
            if (WHT == token1Address) {
                earnedToToken1Path = [earnedAddress, WHT];
            }

            token0ToEarnedPath = [token0Address, WHT, earnedAddress];
            if (WHT == token0Address) {
                token0ToEarnedPath = [WHT, earnedAddress];
            }

            token1ToEarnedPath = [token1Address, WHT, earnedAddress];
            if (WHT == token1Address) {
                token1ToEarnedPath = [WHT, earnedAddress];
            }
        }

        transferOwnership(YFVAddress);
    }

    function accFarmRewardPerShare() external view returns (uint256, uint256, uint256) {
        return (accUsdtPerShare, accMdxPerShare, accBuybackPerShare);
    }

    /// @dev Ensure that the spell approve the given spender to spend all of its tokens.
    /// @param token The token to approve.
    /// @param spender The spender to allow spending.
    /// NOTE: This is safe because spell is never built to hold fund custody.
    function ensureApprove(address token, address spender) public {
        if (!approved[token][spender]) {
            IERC20(token).safeApprove(spender, uint256(-1));
            approved[token][spender] = true;
        }
    }

    /// @dev Internal call to convert msg.value ETH to WETH inside the contract.
    function doTransmitETH() internal {
        if (msg.value > 0) {
            IWETH(WHT).deposit{value: msg.value}();
        }
    }

    /// @dev Internal call to transmit tokens from the bank if amount is positive.
    /// @param token The token to perform the transmit action.
    /// @param amount The amount to transmit.
    function doTransmit(address token, uint256 amount) internal {
        if (amount > 0) {
            IYFVaults(YFVAddress).transmit(token, amount);
        }
    }

    /// @dev Internal call to refund tokens to the current bank executor.
    /// @param token The token to perform the refund action.
    function doRefund(address token) internal {
        uint balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(IYFVaults(YFVAddress).EXECUTOR(), balance);
        }
    }

    /// @dev Internal call to refund all WETH to the current executor as native ETH.
    function doRefundETH() internal {
        uint balance = IWETH(WHT).balanceOf(address(this));
        if (balance > 0) {
            IWETH(WHT).withdraw(balance);
            (bool success, ) = IYFVaults(YFVAddress).EXECUTOR().call{value: balance}(new bytes(0));
            require(success, 'refund ETH failed');
        }
    }

    /// @dev Compute optimal deposit amount
    /// @param amtA amount of token A desired to deposit
    /// @param amtB amount of token B desired to deposit
    /// @param resA amount of token A in reserve
    /// @param resB amount of token B in reserve
    function optimalDeposit(
        uint256 amtA,
        uint256 amtB,
        uint256 resA,
        uint256 resB
    ) internal pure returns (uint256 swapAmt, bool isReversed) {
        if (amtA.mul(resB) >= amtB.mul(resA)) {
            swapAmt = _optimalDepositA(amtA, amtB, resA, resB);
            isReversed = false;
        } else {
            swapAmt = _optimalDepositA(amtB, amtA, resB, resA);
            isReversed = true;
        }
    }

    struct Amounts {
        uint amtAUser;
        uint amtBUser;
        uint amtLPUser;
        uint amtAMin;
        uint amtBMin;
    }

    /// @dev Compute optimal deposit amount helper.
    /// @param amtA amount of token A desired to deposit
    /// @param amtB amount of token B desired to deposit
    /// @param resA amount of token A in reserve
    /// @param resB amount of token B in reserve
    /// Formula: https://blog.alphafinance.io/byot/
    function _optimalDepositA(
        uint256 amtA,
        uint256 amtB,
        uint256 resA,
        uint256 resB
    ) internal pure returns (uint256) {
        require(amtA.mul(resB) >= amtB.mul(resA), 'Reversed');

        uint256 a = 997;
        uint256 b = uint256(1997).mul(resA);
        uint256 _c = (amtA.mul(resB)).sub(amtB.mul(resA));
        uint256 c = _c.mul(1000).div(amtB.add(resB)).mul(resA);
        uint256 d = a.mul(c).mul(4);
        uint256 e = HomoraMath.sqrt(b.mul(b).add(d));
        uint256 numerator = e.sub(b);
        uint256 denominator = a.mul(2);

        return numerator.div(denominator);
    }

    function addLiquidityInternal(
        address tokenA,
        address tokenB,
        Amounts calldata amt
    ) internal {
        address lp = factory.getPair(tokenA, tokenB);
        require(lp != address(0), 'no lp token');

        ensureApprove(tokenA, address(router));
        ensureApprove(tokenB, address(router));
        ensureApprove(lp, address(router));

        // 1. Get user input amounts
        doTransmitETH();
        doTransmit(tokenA, amt.amtAUser);
        doTransmit(tokenB, amt.amtBUser);
        doTransmit(lp, amt.amtLPUser);

        // 2. Calculate optimal swap amount
        uint swapAmt;
        bool isReversed;
        {
            uint amtA = IERC20(tokenA).balanceOf(address(this));
            uint amtB = IERC20(tokenB).balanceOf(address(this));
            uint resA;
            uint resB;
            if (IMdexPair(lp).token0() == tokenA) {
                (resA, resB, ) = IMdexPair(lp).getReserves();
            } else {
                (resB, resA, ) = IMdexPair(lp).getReserves();
            }
            (swapAmt, isReversed) = optimalDeposit(amtA, amtB, resA, resB);
        }

        // 3. Swap optimal amount
        if (swapAmt > 0) {
            address[] memory path = new address[](2);
            (path[0], path[1]) = isReversed ? (tokenB, tokenA) : (tokenA, tokenB);
            router.swapExactTokensForTokens(swapAmt, 0, path, address(this), now);
        }

        // 4. Add liquidity
        uint balA = IERC20(tokenA).balanceOf(address(this));
        uint balB = IERC20(tokenB).balanceOf(address(this));
        if (balA > 0 || balB > 0) {
            router.addLiquidity(
                tokenA,
                tokenB,
                balA,
                balB,
                amt.amtAMin,
                amt.amtBMin,
                address(this),
                now
            );
        }
    }

    function addLiquidityWERC20(
        Amounts calldata amt
    ) external payable onlyOwner whenNotPaused {
        // 1-4. add liquidity
        addLiquidityInternal(token0Address, token1Address, amt);

        // 5. Deposit to Farm pool
        {
            address user = address(this);
            uint256 amount = IERC20(lpToken).balanceOf(user);

            deposit(user, amount);
        }

        // 6. Refund leftovers to users
        doRefundETH();
        doRefund(token0Address);
        doRefund(token1Address);
    }

    // Receives new deposits from user
    function deposit(address _userAddress, uint256 _wantAmt)
        public
        onlyOwner
        whenNotPaused
        returns (uint256)
    {
        if (_userAddress != address(this)) {
            IERC20(lpToken).safeTransferFrom(
                address(msg.sender),
                address(this),
                _wantAmt
            );
        }

        uint256 sharesAdded = _wantAmt;
        if (wantLockedTotal > 0) {
            sharesAdded = _wantAmt
                .mul(sharesTotal)
                .div(wantLockedTotal);
        }
        sharesTotal = sharesTotal.add(sharesAdded);

        if (isAutoComp) {
            _farm();
        } else {
            wantLockedTotal = wantLockedTotal.add(_wantAmt);
        }

        return sharesAdded;
    }

    function farm() public nonReentrant {
        _farm();
    }

    function _farm() internal {
        uint256 wantAmt = IERC20(lpToken).balanceOf(address(this));
        wantLockedTotal = wantLockedTotal.add(wantAmt);

        IERC20(lpToken).safeIncreaseAllowance(lpPoolAddress, wantAmt);
        IMasterChefHeco(lpPoolAddress).deposit(pid, wantAmt);
    }

    function withdraw(address _userAddress, uint256 _wantAmt)
        public
        onlyOwner
        nonReentrant
        returns (uint256)
    {
        // Shh - currently unused
        _userAddress;

        require(_wantAmt > 0, "_wantAmt <= 0");

        if (isAutoComp) {
            IMasterChefHeco(lpPoolAddress).withdraw(pid, _wantAmt);
        }

        uint256 wantAmt = IERC20(lpToken).balanceOf(address(this));
        if (_wantAmt > wantAmt) {
            _wantAmt = wantAmt;
        }

        if (wantLockedTotal < _wantAmt) {
            _wantAmt = wantLockedTotal;
        }

        uint256 sharesRemoved = _wantAmt.mul(sharesTotal).div(wantLockedTotal);
        if (sharesRemoved > sharesTotal) {
            sharesRemoved = sharesTotal;
        }
        sharesTotal = sharesTotal.sub(sharesRemoved);
        wantLockedTotal = wantLockedTotal.sub(_wantAmt);

        IERC20(lpToken).safeTransfer(YFVAddress, _wantAmt);
        return sharesRemoved;
    }

    function calcWithdrawFee(uint256 amount) external view returns (uint256) {
        return amount.mul(withdrawFee).div(withdrawFeeMax);
    }

    // 1. Harvest farm tokens
    // 2. Converts farm tokens into want tokens
    // 3. Deposits want tokens
    function earn() public whenNotPaused {
        if (onlyGov) {
            require(msg.sender == govAddress, "Not authorised");
        }
        require(isAutoComp, "!isAutoComp");

        // Harvest farm tokens
        IMasterChefHeco(lpPoolAddress).withdraw(pid, 0);

        // Converts farm tokens into want tokens
        uint256 earnedAmt = IERC20(earnedAddress).balanceOf(address(this));
        uint256 fee = distributeFees(earnedAmt);
        uint256 earning = distributeDirectEarning(earnedAmt);
        uint256 buyback = buyBack(earnedAmt);

        // re-deposit
        earnedAmt = earnedAmt.sub(fee).sub(earning).sub(buyback);
        IERC20(earnedAddress).safeIncreaseAllowance(
            address(router),
            earnedAmt
        );

        if (earnedAddress != token0Address) {
            // Swap half earned to token0
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                earnedAmt.div(2),
                0,
                earnedToToken0Path,
                address(this),
                now + 60
            );
        }

        if (earnedAddress != token1Address) {
            // Swap half earned to token1
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                earnedAmt.div(2),
                0,
                earnedToToken1Path,
                address(this),
                now + 60
            );
        }

        // Get want tokens, ie. add liquidity
        uint256 token0Amt = IERC20(token0Address).balanceOf(address(this));
        uint256 token1Amt = IERC20(token1Address).balanceOf(address(this));

        if (token0Amt > 0 && token1Amt > 0) {
            IERC20(token0Address).safeIncreaseAllowance(
                address(router),
                token0Amt
            );
            IERC20(token1Address).safeIncreaseAllowance(
                address(router),
                token1Amt
            );

            router.addLiquidity(
                token0Address,
                token1Address,
                token0Amt,
                token1Amt,
                0,
                0,
                address(this),
                now + 60
            );
        }

        lastEarnBlock = block.number;
        _farm();
    }

    function buyBack(uint256 _earnedAmt) internal returns (uint256) {
        if (buyBackRate <= 0) {
            return _earnedAmt;
        }

        uint256 buyBackAmt = _earnedAmt.mul(buyBackRate).div(buyBackRateMax);
        accBuybackPerShare = accBuybackPerShare.add(buyBackAmt.mul(1e12).div(sharesTotal));

        IERC20(earnedAddress).safeIncreaseAllowance(
            address(router),
            buyBackAmt
        );

        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            buyBackAmt,
            0,
            earnedToYFPath,
            address(this),
            now + 60
        );

        IERC20(YFTokenAddress).safeIncreaseAllowance(
            YFVAddress,
            buyBackAmt
        );

        return _earnedAmt.sub(buyBackAmt);
    }

    function distributeFees(uint256 _earnedAmt) internal returns (uint256) {
        if (_earnedAmt > 0) {
            // Performance fee
            if (controllerFee > 0) {
                uint256 fee = _earnedAmt.mul(controllerFee).div(controllerFeeMax);

                IERC20(earnedAddress).safeIncreaseAllowance(
                    address(router),
                    fee
                );

                router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    fee,
                    0,
                    earnedToUSDTPath,
                    YFVAddress,
                    now + 60
                );

                accUsdtPerShare = accUsdtPerShare.add(fee.mul(1e12).div(sharesTotal));

                _earnedAmt = _earnedAmt.sub(fee);
            }
        }

        return _earnedAmt;
    }

    // 45% of earning distribute direct to user
    function distributeDirectEarning(uint256 _earnedAmt) internal returns (uint256) {
        if (_earnedAmt > 0) {
            uint256 earning = _earnedAmt.mul(directEarning).div(directEarningMax);
            accMdxPerShare = accMdxPerShare.add(earning.mul(1e12).div(sharesTotal));

            IERC20(earnedAddress).safeIncreaseAllowance(
                YFVAddress,
                earning
            );

            _earnedAmt = _earnedAmt.sub(earning);
        }

        return _earnedAmt;
    }

    // Converts dust tokens into earned tokens, which will be reinvested on the next earn().
    function convertDustToEarned() public whenNotPaused {
        require(isAutoComp, "!isAutoComp");

        // Converts token0 dust (if any) to earned tokens
        uint256 token0Amt = IERC20(token0Address).balanceOf(address(this));
        if (token0Address != earnedAddress && token0Amt > 0) {
            IERC20(token0Address).safeIncreaseAllowance(
                address(router),
                token0Amt
            );

            // Swap all dust tokens to earned tokens
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                token0Amt,
                0,
                token0ToEarnedPath,
                address(this),
                now + 60
            );
        }

        // Converts token1 dust (if any) to earned tokens
        uint256 token1Amt = IERC20(token1Address).balanceOf(address(this));
        if (token1Address != earnedAddress && token1Amt > 0) {
            IERC20(token1Address).safeIncreaseAllowance(
                address(router),
                token1Amt
            );

            // Swap all dust tokens to earned tokens
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                token1Amt,
                0,
                token1ToEarnedPath,
                address(this),
                now + 60
            );
        }
    }

    function pause() public {
        require(msg.sender == govAddress, "Not authorised");
        _pause();
    }

    function unpause() external {
        require(msg.sender == govAddress, "Not authorised");
        _unpause();
    }

    function setEntranceFeeFactor(uint256 _entranceFeeFactor) public {
        require(msg.sender == govAddress, "Not authorised");
        require(_entranceFeeFactor > entranceFeeFactorLL, "!safe - too low");
        require(_entranceFeeFactor <= entranceFeeFactorMax, "!safe - too high");
        entranceFeeFactor = _entranceFeeFactor;
    }

    function setWithdrawFee(uint256 _withdrawFee) public {
        require(msg.sender == govAddress, "Not authorised");
        withdrawFee = _withdrawFee;
    }

    function setControllerFee(uint256 _controllerFee) public {
        require(msg.sender == govAddress, "Not authorised");
        require(_controllerFee <= controllerFeeUL, "too high");
        controllerFee = _controllerFee;
    }

    function setbuyBackRate(uint256 _buyBackRate) public {
        require(msg.sender == govAddress, "Not authorised");
        require(buyBackRate <= buyBackRateUL, "too high");
        buyBackRate = _buyBackRate;
    }

    function setGov(address _govAddress) public {
        require(msg.sender == govAddress, "!gov");
        govAddress = _govAddress;
    }

    function setOnlyGov(bool _onlyGov) public {
        require(msg.sender == govAddress, "!gov");
        onlyGov = _onlyGov;
    }

    function inCaseTokensGetStuck(
        address _token,
        uint256 _amount,
        address _to
    ) public {
        require(msg.sender == govAddress, "!gov");
        require(_token != earnedAddress, "!safe");
        require(_token != lpToken, "!safe");
        IERC20(_token).safeTransfer(_to, _amount);
    }
}
