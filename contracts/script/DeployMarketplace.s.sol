// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Marketplace} from "../src/Marketplace.sol";

/// @notice Redeploys only the Marketplace (preserves existing token state).
///
/// Usage:
///   forge script script/DeployMarketplace.s.sol \
///     --rpc-url base_sepolia \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract DeployMarketplace is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address mealSwipeToken = 0xeC42BcA5AFc709846bbBe47b23728529FC22e939;
        address mockUsdc      = 0x724405Ca5Bde59213Bf98a3Af94368bA6d812bAf;

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        Marketplace market = new Marketplace(mealSwipeToken, mockUsdc);
        console.log("Marketplace deployed at:", address(market));

        vm.stopBroadcast();
    }
}
