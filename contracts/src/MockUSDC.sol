// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice A simple ERC-20 token with 6 decimals used as the payment token for MealCoin prototype
/// @dev Mint freely during testing. 1 USDC = 1_000_000 (6 decimals), so $12 = 12_000_000
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @notice Mints tokens to a specified address
    /// @param to The address to mint tokens to
    /// @param amount The amount of tokens to mint (in smallest units, 6 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns the number of decimals used for token amounts
    /// @return The number of decimals (6 for USDC)
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
