// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";

contract Mint is Script {
    address constant TOKEN = 0x32912D61e207282a2E08B56bf92a58ecDf716E92;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        uint256 week = block.timestamp / 7 days;
        address recipient = 0x836af593ced597B329AD4888086D7746aF42f8ce;

        console.log("Minting 6 swipes to:", recipient);
        console.log("Week epoch:", week);

        vm.startBroadcast(deployerPrivateKey);
        MealSwipeToken(TOKEN).mint(recipient, 6, week);
        vm.stopBroadcast();

        console.log("Done.");
    }
}
