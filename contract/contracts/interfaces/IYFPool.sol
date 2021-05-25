// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IStrategy.sol";

interface IYFPool {
    function add(
        address _want,
        address _earned,
        IStrategy _strat
    ) external;

    function pending(uint pid, address user) external view returns (uint, uint);

    function totalRewards(uint pid, address user) external view returns (uint, uint);

    function claim(uint pid) external;

    function deposit(uint pid, uint amount) external;

    function withdraw(uint pid, uint amount) external;

    function emergencyWithdraw(uint pid) external;

    function transmit(address token_, uint _amount) external;

    /// @dev Return the current executor (the owner of the current position).
    function EXECUTOR() external view returns (address);
}
