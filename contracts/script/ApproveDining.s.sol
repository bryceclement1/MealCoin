// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MealSwipeToken.sol";

contract ApproveDining is Script {
    function run() external {
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        address diningAddress = vm.envAddress("DINING_ADDRESS");

        vm.startBroadcast();
        MealSwipeToken(tokenAddress).approveDining(diningAddress);
        vm.stopBroadcast();

        console.log("approveDining called for:", diningAddress);
    }
}
