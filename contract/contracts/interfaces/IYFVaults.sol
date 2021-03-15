// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IYFVaults {
    /// @dev Return the current target while under execution.
    function SPELL() external view returns (address);

    /// @dev Return the current executor (the owner of the current position).
    function EXECUTOR() external view returns (address);

    function transmit(address token, uint256 amount) external;

    function pending(uint256 pid, address user) external view returns (uint256, uint256, uint256);

    function deposit(uint256 pid, uint256 amount) external;

    function withdraw(uint256 pid, uint256 amount) external;

    function emergencyWithdraw(uint256 pid) external;
}
