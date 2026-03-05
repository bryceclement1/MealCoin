// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMealSwipeToken
/// @notice Interface used by the Marketplace to interact with MealSwipeToken without circular imports
interface IMealSwipeToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address wallet, uint256 week) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function getCurrentWeek() external view returns (uint256);
}
