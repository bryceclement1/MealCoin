// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {Marketplace} from "../src/Marketplace.sol";

/// @notice Deploys MockUSDC, MealSwipeToken, and Marketplace to Base Sepolia.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url base_sepolia \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
///
/// After deployment:
///   - Record the three contract addresses printed below
///   - Add them to your backend .env and frontend config
///   - Call approveDining(diningHallAddress) from the owner wallet for each physical terminal
///   - Do NOT call approveDining(marketplace) — the Marketplace uses transfer/transferFrom,
///     not redeemSwipe, so no dining approval is needed
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockUSDC (testnet payment token, 6 decimals)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:       ", address(usdc));

        // 2. Deploy MealSwipeToken
        MealSwipeToken token = new MealSwipeToken();
        console.log("MealSwipeToken deployed at:  ", address(token));

        // 3. Deploy Marketplace, wiring in both token addresses
        Marketplace market = new Marketplace(address(token), address(usdc));
        console.log("Marketplace deployed at:     ", address(market));

        vm.stopBroadcast();

        // ── Post-deployment checklist (run manually from owner wallet) ─────────
        // token.approveDining(<diningHallTerminalAddress>)   // for each physical terminal
        // usdc.mint(<testStudentWallet>, 100_000_000)        // $100 test USDC per student
        // token.mint(<studentWallet>, 6, currentWeek)        // weekly cron job handles this
    }
}
