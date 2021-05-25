// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPoolV1 {
    function distributeHarvest(uint, uint, uint) external;
}

contract StratHub is Ownable {
    using SafeERC20 for IERC20;
    uint public sharesTotal = 0;

    address public token;
    address public poolV1;

    constructor(address _poolV1, address _token) public {
        require(_poolV1 != address(0), "Zero address");
        require(_token != address(0), "Zero address");
        poolV1 = _poolV1;
        token = _token;
    }

    /// @dev Transit V2 USDT reward to V1 YF-USDT pool
    function transit() external {
        uint amount = IERC20(token).balanceOf(address(this));

        if (amount > 0) {
            IERC20(token).safeTransfer(poolV1, amount);
            IPoolV1(poolV1).distributeHarvest(amount, 0, 0);
        }
    }
}
