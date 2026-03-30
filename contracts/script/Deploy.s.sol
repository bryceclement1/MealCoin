// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";
import {Marketplace} from "../src/Marketplace.sol";

/// @notice Deploys MealSwipeToken and Marketplace to Base mainnet.
/// Uses the real USDC contract deployed by Circle on Base mainnet.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url base \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
///
/// After deployment:
///   - Record the two contract addresses printed below
///   - Add them to backend .env, frontend .env.local, and indexer .env
///   - Whitelist both addresses in the CDP Paymaster dashboard
///   - Call approveDining(diningHallAddress) from the owner wallet for each physical terminal
///   - Do NOT call approveDining(marketplace) — the Marketplace uses transfer/transferFrom,
///     not redeemSwipe, so no dining approval is needed
contract Deploy is Script {
    // Real USDC on Base mainnet (Circle-issued, 6 decimals)
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("USDC address:", USDC);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MealSwipeToken
        MealSwipeToken token = new MealSwipeToken();
        console.log("MealSwipeToken deployed at:  ", address(token));

        // 2. Deploy Marketplace, wiring in the token and real USDC
        Marketplace market = new Marketplace(address(token), USDC);
        console.log("Marketplace deployed at:     ", address(market));

        vm.stopBroadcast();

        // ── Post-deployment checklist (run manually from owner wallet) ─────────
        // token.approveDining(<diningHallTerminalAddress>)   // for each physical terminal
        // token.mint(<studentWallet>, 6, currentWeek)        // weekly cron job handles this
    }
}
