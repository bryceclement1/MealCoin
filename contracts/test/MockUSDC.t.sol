// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC public usdc;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_Name() public view {
        assertEq(usdc.name(), "Mock USDC");
    }

    function test_Symbol() public view {
        assertEq(usdc.symbol(), "USDC");
    }

    function test_Decimals() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_Mint() public {
        uint256 amount = 100_000_000; // $100
        usdc.mint(alice, amount);
        assertEq(usdc.balanceOf(alice), amount);
    }

    function test_MintMultipleTimes() public {
        usdc.mint(alice, 50_000_000); // $50
        usdc.mint(alice, 50_000_000); // $50 more
        assertEq(usdc.balanceOf(alice), 100_000_000); // $100 total
    }

    function test_Transfer() public {
        uint256 amount = 100_000_000; // $100
        usdc.mint(alice, amount);

        vm.prank(alice);
        usdc.transfer(bob, 12_000_000); // $12

        assertEq(usdc.balanceOf(alice), 88_000_000); // $88
        assertEq(usdc.balanceOf(bob), 12_000_000); // $12
    }

    function test_Approve_And_TransferFrom() public {
        uint256 amount = 100_000_000; // $100
        usdc.mint(alice, amount);

        vm.prank(alice);
        usdc.approve(bob, 12_000_000); // Approve bob to spend $12

        vm.prank(bob);
        usdc.transferFrom(alice, bob, 12_000_000); // Bob transfers $12 from alice

        assertEq(usdc.balanceOf(alice), 88_000_000);
        assertEq(usdc.balanceOf(bob), 12_000_000);
    }

    function test_AnyoneCanMint() public {
        // Alice can mint to herself
        vm.prank(alice);
        usdc.mint(alice, 100_000_000);
        assertEq(usdc.balanceOf(alice), 100_000_000);

        // Bob can also mint to himself
        vm.prank(bob);
        usdc.mint(bob, 50_000_000);
        assertEq(usdc.balanceOf(bob), 50_000_000);
    }

    function test_TotalSupply() public {
        usdc.mint(alice, 100_000_000);
        usdc.mint(bob, 50_000_000);
        assertEq(usdc.totalSupply(), 150_000_000);
    }
}
