// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";

contract MealSwipeTokenTest is Test {
    MealSwipeToken public token;
    address public owner;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public diningHall = makeAddr("diningHall");

    function setUp() public {
        owner = address(this);
        token = new MealSwipeToken();
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsOwner() public view {
        assertEq(token.owner(), owner);
    }

    function test_Constructor_SetsName() public view {
        assertEq(token.name(), "MealSwipeToken");
    }

    function test_Constructor_SetsSymbol() public view {
        assertEq(token.symbol(), "MST");
    }

    function test_Constructor_SetsDecimals() public view {
        assertEq(token.decimals(), 0);
    }

    function test_Constructor_SetsCurrentWeek() public view {
        uint256 expectedWeek = block.timestamp / 7 days;
        assertEq(token.currentWeek(), expectedWeek);
    }

    // ============ balanceOf Tests ============

    function test_BalanceOf_ReturnsZeroForNewAddress() public view {
        uint256 currentWeek = token.currentWeek();
        assertEq(token.balanceOf(alice, currentWeek), 0);
    }

    function test_BalanceOf_ReturnsZeroForDifferentWeek() public view {
        uint256 futureWeek = token.currentWeek() + 10;
        assertEq(token.balanceOf(alice, futureWeek), 0);
    }

    function test_BalanceOf_ReturnsZeroForZeroAddress() public view {
        uint256 currentWeek = token.currentWeek();
        assertEq(token.balanceOf(address(0), currentWeek), 0);
    }

    // ============ mint Tests ============

    function test_Mint_AdminCanMint() public {
        uint256 currentWeek = token.currentWeek();

        token.mint(alice, 6, currentWeek);

        assertEq(token.balanceOf(alice, currentWeek), 6);
    }

    function test_Mint_UpdatesTotalSupplyByWeek() public {
        uint256 currentWeek = token.currentWeek();

        token.mint(alice, 6, currentWeek);
        token.mint(bob, 4, currentWeek);

        assertEq(token.totalSupplyByWeek(currentWeek), 10);
    }

    function test_Mint_EmitsMintEvent() public {
        uint256 currentWeek = token.currentWeek();

        vm.expectEmit(true, false, false, true);
        emit MealSwipeToken.Mint(alice, 6, currentWeek);

        token.mint(alice, 6, currentWeek);
    }

    function test_Mint_CanMintToSameAddressMultipleTimes() public {
        uint256 currentWeek = token.currentWeek();

        token.mint(alice, 3, currentWeek);
        token.mint(alice, 3, currentWeek);

        assertEq(token.balanceOf(alice, currentWeek), 6);
    }

    function test_Mint_CanMintForDifferentWeeks() public {
        uint256 currentWeek = token.currentWeek();
        uint256 nextWeek = currentWeek + 1;

        token.mint(alice, 6, currentWeek);
        token.mint(alice, 6, nextWeek);

        assertEq(token.balanceOf(alice, currentWeek), 6);
        assertEq(token.balanceOf(alice, nextWeek), 6);
    }

    function test_Mint_RevertsWhenNotOwner() public {
        uint256 currentWeek = token.currentWeek();

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.NotOwner.selector);
        token.mint(alice, 6, currentWeek);
    }

    function test_Mint_RevertsWhenAmountIsZero() public {
        uint256 currentWeek = token.currentWeek();

        vm.expectRevert(MealSwipeToken.InvalidAmount.selector);
        token.mint(alice, 0, currentWeek);
    }

    function test_Mint_RevertsWhenAmountExceedsSix() public {
        uint256 currentWeek = token.currentWeek();

        vm.expectRevert(MealSwipeToken.InvalidAmount.selector);
        token.mint(alice, 7, currentWeek);
    }

    function test_Mint_RevertsWhenToIsZeroAddress() public {
        uint256 currentWeek = token.currentWeek();

        vm.expectRevert(MealSwipeToken.ZeroAddress.selector);
        token.mint(address(0), 6, currentWeek);
    }

    function test_Mint_AllowsAmountsOneToSix() public {
        uint256 currentWeek = token.currentWeek();

        // Test all valid amounts 1-6
        for (uint256 i = 1; i <= 6; i++) {
            address recipient = makeAddr(string(abi.encodePacked("recipient", i)));
            token.mint(recipient, i, currentWeek);
            assertEq(token.balanceOf(recipient, currentWeek), i);
        }
    }

    // ============ mint() Edge Cases ============

    function test_Mint_EdgeCase_DoubleMintSameWeekAccumulatesBalanceAndSupply() public {
        // Minting to the same address twice in the same week must accumulate,
        // not overwrite. Also verifies totalSupplyByWeek tracks both mints.
        uint256 week = token.currentWeek();

        token.mint(alice, 4, week);
        token.mint(alice, 2, week);

        assertEq(token.balanceOf(alice, week), 6);
        assertEq(token.totalSupplyByWeek(week), 6);
    }

    function test_Mint_EdgeCase_FutureWeekEpochSucceeds() public {
        // Admin can pre-mint for a future week with no current-week context.
        uint256 futureWeek = token.currentWeek() + 52; // one year out

        token.mint(alice, 6, futureWeek);

        assertEq(token.balanceOf(alice, futureWeek), 6);
        assertEq(token.totalSupplyByWeek(futureWeek), 6);
        // Current week is unaffected
        assertEq(token.totalSupplyByWeek(token.currentWeek()), 0);
    }

    function test_Mint_EdgeCase_PastWeekEpochSucceeds() public {
        // No restriction prevents minting for a past week epoch.
        // (Useful for retroactive corrections; burnAll enforces expiry separately.)
        uint256 pastWeek = token.currentWeek();
        vm.warp(block.timestamp + 7 days); // advance to the next week
        uint256 newCurrentWeek = token.getCurrentWeek(); // live week via block.timestamp

        token.mint(alice, 3, pastWeek);

        assertEq(token.balanceOf(alice, pastWeek), 3);
        assertEq(token.totalSupplyByWeek(pastWeek), 3);
        // New current week is unaffected by the past-week mint
        assertEq(token.totalSupplyByWeek(newCurrentWeek), 0);
    }

    // ============ transfer Tests ============

    function test_Transfer_DecrementsSenderBalance() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.transfer(bob, 2);

        assertEq(token.balanceOf(alice, week), 4);
    }

    function test_Transfer_IncrementsRecipientBalance() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.transfer(bob, 2);

        assertEq(token.balanceOf(bob, week), 2);
    }

    function test_Transfer_EmitsTransferEvent() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.expectEmit(true, true, false, true);
        emit MealSwipeToken.Transfer(alice, bob, 2, week);

        vm.prank(alice);
        token.transfer(bob, 2);
    }

    function test_Transfer_FullBalance() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.transfer(bob, 6);

        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.balanceOf(bob, week), 6);
    }

    function test_Transfer_IsScopedToCurrentWeek() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        // Advance to next week
        vm.warp(block.timestamp + 7 days);
        token.mint(alice, 3, week + 1);

        // Transfer in the new week only affects new week's balance
        vm.prank(alice);
        token.transfer(bob, 2);

        assertEq(token.balanceOf(alice, week), 6);       // old week untouched
        assertEq(token.balanceOf(alice, week + 1), 1);   // new week decremented
        assertEq(token.balanceOf(bob, week + 1), 2);
    }

    function test_Transfer_RevertsOnInsufficientBalance() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 3, week);

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transfer(bob, 4);
    }

    function test_Transfer_RevertsWhenBalanceIsZero() public {
        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transfer(bob, 1);
    }

    function test_Transfer_RevertsOnZeroAmount() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InvalidAmount.selector);
        token.transfer(bob, 0);
    }

    function test_Transfer_RevertsOnZeroAddress() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.ZeroAddress.selector);
        token.transfer(address(0), 1);
    }

    // ============ transfer() Edge Cases ============

    function test_Transfer_EdgeCase_SelfTransferLeavesBalanceUnchanged() public {
        // Transferring to yourself is not blocked by the contract.
        // The mapping subtracts then adds for the same key — net effect is zero.
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.transfer(alice, 3);

        assertEq(token.balanceOf(alice, week), 6);
    }

    function test_Transfer_EdgeCase_Week2TransferOfWeek1TokensReverts() public {
        // Tokens minted in week 1 are not accessible in week 2.
        // transfer() uses live block.timestamp / 7 days, so the week 2 balance is 0.
        uint256 week1 = token.currentWeek();
        token.mint(alice, 6, week1);

        vm.warp(block.timestamp + 7 days); // move to week 2

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transfer(bob, 1);

        // Week 1 balance is untouched
        assertEq(token.balanceOf(alice, week1), 6);
    }

    // ============ approve() / allowance() / transferFrom() Tests ============

    function test_Approve_ZeroAmountSucceeds() public {
        // ERC-20 standard allows approve(spender, 0) to explicitly clear an allowance.
        vm.prank(alice);
        token.approve(bob, 0);

        assertEq(token.allowance(alice, bob), 0);
    }

    function test_Approve_OverwritesPreviousAllowance() public {
        // A second approve() must overwrite the first — no accumulation.
        vm.startPrank(alice);
        token.approve(bob, 5);
        token.approve(bob, 2);
        vm.stopPrank();

        assertEq(token.allowance(alice, bob), 2);
    }

    function test_TransferFrom_ExactAllowanceLeavesAllowanceAtZero() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.approve(bob, 4);

        vm.prank(bob);
        token.transferFrom(alice, bob, 4);

        assertEq(token.allowance(alice, bob), 0);
        assertEq(token.balanceOf(alice, week), 2);
        assertEq(token.balanceOf(bob, week), 4);
    }

    function test_TransferFrom_RevertsWhenAllowanceTooLow() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.approve(bob, 1);

        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.InsufficientAllowance.selector);
        token.transferFrom(alice, bob, 2);
    }

    function test_TransferFrom_RevertsWhenAllowanceSufficientButBalanceLow() public {
        // Allowance is large but the on-chain balance for the current week is less.
        uint256 week = token.currentWeek();
        token.mint(alice, 3, week);

        vm.prank(alice);
        token.approve(bob, 6);

        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transferFrom(alice, bob, 4);
    }

    function test_TransferFrom_AllowancePersistsAcrossWeeksButBalanceDoesNot() public {
        // approve() is not week-scoped, so the allowance carries into week 2.
        // However, week-1 tokens are not visible in week 2, so the call reverts.
        uint256 week1 = token.currentWeek();
        token.mint(alice, 6, week1);

        vm.prank(alice);
        token.approve(bob, 6);

        vm.warp(block.timestamp + 7 days); // move to week 2, no new mint

        assertEq(token.allowance(alice, bob), 6); // allowance still intact

        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transferFrom(alice, bob, 1);
    }

    function test_TransferFrom_RevertsOnZeroToAddress() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.approve(bob, 6);

        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.ZeroAddress.selector);
        token.transferFrom(alice, address(0), 1);
    }

    function test_TransferFrom_FromZeroAddressRevertsInsufficientAllowance() public {
        // There is no explicit `from == address(0)` guard. The contract reaches
        // the allowance check first: allowances[address(0)][caller] is 0, so it
        // reverts InsufficientAllowance before any balance logic is reached.
        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.InsufficientAllowance.selector);
        token.transferFrom(address(0), bob, 1);
    }

    // ============ approveDining / revokeDining Tests ============

    function test_ApproveDining_SetsMapping() public {
        token.approveDining(diningHall);
        assertTrue(token.approvedDining(diningHall));
    }

    function test_ApproveDining_EmitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit MealSwipeToken.DiningApproved(diningHall);
        token.approveDining(diningHall);
    }

    function test_ApproveDining_RevertsWhenNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.NotOwner.selector);
        token.approveDining(diningHall);
    }

    function test_ApproveDining_RevertsOnZeroAddress() public {
        vm.expectRevert(MealSwipeToken.ZeroAddress.selector);
        token.approveDining(address(0));
    }

    function test_RevokeDining_ClearsMapping() public {
        token.approveDining(diningHall);
        token.revokeDining(diningHall);
        assertFalse(token.approvedDining(diningHall));
    }

    function test_RevokeDining_EmitsEvent() public {
        token.approveDining(diningHall);

        vm.expectEmit(true, false, false, false);
        emit MealSwipeToken.DiningRevoked(diningHall);
        token.revokeDining(diningHall);
    }

    function test_RevokeDining_RevertsWhenNotOwner() public {
        token.approveDining(diningHall);

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.NotOwner.selector);
        token.revokeDining(diningHall);
    }

    function test_RevokeDining_DoesNotRevertOnUnapprovedAddress() public {
        // Revoking an address that was never approved is a no-op, not an error
        token.revokeDining(diningHall);
        assertFalse(token.approvedDining(diningHall));
    }

    // ============ redeemSwipe Tests ============

    function test_RedeemSwipe_DecrementsWalletBalance() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.approveDining(diningHall);

        vm.prank(diningHall);
        token.redeemSwipe(alice);

        assertEq(token.balanceOf(alice, week), 5);
    }

    function test_RedeemSwipe_DecrementsTotalSupply() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.approveDining(diningHall);

        vm.prank(diningHall);
        token.redeemSwipe(alice);

        assertEq(token.totalSupplyByWeek(week), 5);
    }

    function test_RedeemSwipe_EmitsEvent() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.approveDining(diningHall);

        vm.expectEmit(true, false, false, true);
        emit MealSwipeToken.SwipeRedeemed(alice, week);

        vm.prank(diningHall);
        token.redeemSwipe(alice);
    }

    function test_RedeemSwipe_CanRedeemMultipleTimes() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 3, week);
        token.approveDining(diningHall);

        vm.startPrank(diningHall);
        token.redeemSwipe(alice);
        token.redeemSwipe(alice);
        token.redeemSwipe(alice);
        vm.stopPrank();

        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.totalSupplyByWeek(week), 0);
    }

    function test_RedeemSwipe_RevertsWhenNotApprovedDining() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(bob);
        vm.expectRevert(MealSwipeToken.NotApprovedDining.selector);
        token.redeemSwipe(alice);
    }

    function test_RedeemSwipe_RevertsForOwnerIfNotApproved() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        // owner is not automatically an approved dining address
        vm.expectRevert(MealSwipeToken.NotApprovedDining.selector);
        token.redeemSwipe(alice);
    }

    function test_RedeemSwipe_RevertsAfterDiningRevoked() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.approveDining(diningHall);
        token.revokeDining(diningHall);

        vm.prank(diningHall);
        vm.expectRevert(MealSwipeToken.NotApprovedDining.selector);
        token.redeemSwipe(alice);
    }

    function test_RedeemSwipe_RevertsOnZeroBalance() public {
        token.approveDining(diningHall);

        vm.prank(diningHall);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.redeemSwipe(alice);
    }

    function test_RedeemSwipe_RevertsOnZeroAddress() public {
        token.approveDining(diningHall);

        vm.prank(diningHall);
        vm.expectRevert(MealSwipeToken.ZeroAddress.selector);
        token.redeemSwipe(address(0));
    }

    // ============ redeemSwipe() Edge Cases ============

    function test_RedeemSwipe_EdgeCase_ExactlyOneSwipeDrainsBothBalanceAndSupplyToZero() public {
        // Redeeming the only swipe a wallet holds must cleanly zero both the
        // per-wallet balance and the week's totalSupplyByWeek in one call.
        uint256 week = token.currentWeek();
        token.mint(alice, 1, week);
        token.approveDining(diningHall);

        vm.prank(diningHall);
        token.redeemSwipe(alice);

        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.totalSupplyByWeek(week), 0);
    }

    function test_RedeemSwipe_EdgeCase_RevokedAfterSuccessfulRedeemPreventsNextRedeem() public {
        // Confirm the full approve → use → revoke lifecycle:
        // a successful redeem before revocation does not keep the dining address active.
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.approveDining(diningHall);

        vm.prank(diningHall);
        token.redeemSwipe(alice); // succeeds — balance now 5
        assertEq(token.balanceOf(alice, week), 5);

        token.revokeDining(diningHall);

        vm.prank(diningHall);
        vm.expectRevert(MealSwipeToken.NotApprovedDining.selector);
        token.redeemSwipe(alice);

        // Balance must be unchanged after the failed second attempt
        assertEq(token.balanceOf(alice, week), 5);
    }

    // ============ burnAll Tests ============

    function test_BurnAll_BalanceOfReturnsZero() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.mint(bob, 4, week);

        token.burnAll(week);

        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.balanceOf(bob, week), 0);
    }

    function test_BurnAll_ZeroesTotalSupply() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.mint(bob, 4, week);

        token.burnAll(week);

        assertEq(token.totalSupplyByWeek(week), 0);
    }

    function test_BurnAll_SetsBurnedWeeks() public {
        uint256 week = token.currentWeek();
        token.burnAll(week);
        assertTrue(token.burnedWeeks(week));
    }

    function test_BurnAll_EmitsEventWithCorrectTotal() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.mint(bob, 4, week);

        vm.expectEmit(false, false, false, true);
        emit MealSwipeToken.SwipesBurned(week, 10);

        token.burnAll(week);
    }

    function test_BurnAll_EmitsZeroTotalForEmptyWeek() public {
        uint256 week = token.currentWeek();

        vm.expectEmit(false, false, false, true);
        emit MealSwipeToken.SwipesBurned(week, 0);

        token.burnAll(week);
    }

    function test_BurnAll_DoesNotAffectOtherWeeks() public {
        uint256 week = token.currentWeek();
        uint256 nextWeek = week + 1;
        token.mint(alice, 6, week);
        token.mint(alice, 6, nextWeek);

        token.burnAll(week);

        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.balanceOf(alice, nextWeek), 6);
    }

    function test_BurnAll_RevertsCalledTwice() public {
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.burnAll(week);

        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        token.burnAll(week);
    }

    function test_BurnAll_RevertsWhenNotOwner() public {
        uint256 week = token.currentWeek();

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.NotOwner.selector);
        token.burnAll(week);
    }

    // ============ burnAll() Edge Cases ============

    function test_BurnAll_EdgeCase_FutureNeverMintedWeekSucceeds() public {
        // burnAll has no restriction on which week is burned — a future epoch
        // with zero supply should succeed and mark that week as burned.
        uint256 futureWeek = token.currentWeek() + 10;

        token.burnAll(futureWeek);

        assertTrue(token.burnedWeeks(futureWeek));
        assertEq(token.totalSupplyByWeek(futureWeek), 0);
        assertEq(token.balanceOf(alice, futureWeek), 0);
    }

    function test_BurnAll_EdgeCase_ReMintIntoBurnedWeekReverts() public {
        // mint() now guards against burned weeks — minting into an already-burned
        // epoch reverts EpochAlreadyBurned, preventing permanently inaccessible tokens.
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.burnAll(week);

        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        token.mint(alice, 3, week);
    }

    function test_BurnAll_EdgeCase_TransferAfterBurnInSameEpochReverts() public {
        // transfer() checks burnedWeeks before the raw balance, so tokens in a
        // burned week cannot be moved even within the same block.
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);
        token.burnAll(week);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        token.transfer(bob, 1);
    }

    function test_BurnAll_EdgeCase_TransferFromAfterBurnInSameEpochReverts() public {
        // transferFrom() also has the burnedWeeks guard — allowance cannot be
        // exercised against a burned week's tokens.
        uint256 week = token.currentWeek();
        token.mint(alice, 6, week);

        vm.prank(alice);
        token.approve(bob, 6);

        token.burnAll(week);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        token.transferFrom(alice, bob, 1);
    }

    // ============ getCurrentWeek Tests ============

    function test_GetCurrentWeek_MatchesTimestamp() public view {
        assertEq(token.getCurrentWeek(), block.timestamp / 7 days);
    }

    function test_GetCurrentWeek_AdvancesAfterWarp() public {
        uint256 weekBefore = token.getCurrentWeek();
        vm.warp(block.timestamp + 7 days);
        assertEq(token.getCurrentWeek(), weekBefore + 1);
    }

    // ============ Week Epoch Boundary Edge Cases ============

    function test_EpochBoundary_WarpToExactEpochStartIncrementsWeek() public {
        // Warp to the precise first second of the next epoch (not just +7 days from
        // an arbitrary mid-epoch position). Confirms the boundary is inclusive —
        // block.timestamp == (N+1) * 7 days belongs to epoch N+1, not N.
        uint256 weekN = token.getCurrentWeek();
        uint256 nextEpochStart = (weekN + 1) * 7 days;

        vm.warp(nextEpochStart);

        assertEq(token.getCurrentWeek(), weekN + 1);
    }

    function test_EpochBoundary_WeekNBalanceReadableInWeekNPlusOne() public {
        // balanceOf is not restricted to the current epoch — historical balances
        // remain readable after a week rolls over (as long as the week hasn't been burned).
        // The balance is readable but unusable: transfer() uses live block.timestamp / 7 days
        // so the caller's week-(N+1) balance is 0, causing InsufficientBalance.
        uint256 weekN = token.getCurrentWeek();
        token.mint(alice, 6, weekN);

        vm.warp((weekN + 1) * 7 days); // move to epoch N+1

        // Week N balance is still readable
        assertEq(token.balanceOf(alice, weekN), 6);
        // Week N+1 balance is 0 (nothing minted there)
        assertEq(token.balanceOf(alice, weekN + 1), 0);

        // Transfer reverts because it operates on the current (N+1) balance
        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transfer(bob, 1);
    }

    function testFuzz_EpochBoundary_GetCurrentWeekMatchesTimestampAtAnyPoint(uint32 offset) public {
        // getCurrentWeek() must equal block.timestamp / 7 days at any arbitrary point in time.
        // uint32 bounds the offset to ~136 years, safely within uint256 range.
        vm.warp(block.timestamp + offset);
        assertEq(token.getCurrentWeek(), block.timestamp / 7 days);
    }

    // ============ Integration Test ============

    function test_Integration_FullFlow() public {
        uint256 week = token.currentWeek();

        // Setup: approve dining hall
        token.approveDining(diningHall);

        // Step 1: mint — admin loads alice (6 swipes) and bob (4 swipes)
        token.mint(alice, 6, week);
        token.mint(bob, 4, week);
        assertEq(token.balanceOf(alice, week), 6);
        assertEq(token.balanceOf(bob, week), 4);
        assertEq(token.totalSupplyByWeek(week), 10);

        // Step 2: transfer — alice sends 2 swipes to bob
        vm.prank(alice);
        token.transfer(bob, 2);
        assertEq(token.balanceOf(alice, week), 4);
        assertEq(token.balanceOf(bob, week), 6);

        // Step 3: redeem — alice uses 3 meals at dining hall
        vm.startPrank(diningHall);
        token.redeemSwipe(alice);
        token.redeemSwipe(alice);
        token.redeemSwipe(alice);
        vm.stopPrank();
        assertEq(token.balanceOf(alice, week), 1);
        assertEq(token.totalSupplyByWeek(week), 7); // 10 - 3 redeemed

        // Step 4: redeem — bob uses 2 meals
        vm.startPrank(diningHall);
        token.redeemSwipe(bob);
        token.redeemSwipe(bob);
        vm.stopPrank();
        assertEq(token.balanceOf(bob, week), 4);
        assertEq(token.totalSupplyByWeek(week), 5); // 7 - 2 redeemed

        // Step 5: burnAll — week ends, remaining swipes expire
        token.burnAll(week);
        assertEq(token.balanceOf(alice, week), 0); // 1 remaining swipe wiped
        assertEq(token.balanceOf(bob, week), 0);   // 4 remaining swipes wiped
        assertEq(token.totalSupplyByWeek(week), 0);
        assertTrue(token.burnedWeeks(week));

        // Step 6: confirm new week is unaffected
        uint256 nextWeek = week + 1;
        token.mint(alice, 6, nextWeek);
        assertEq(token.balanceOf(alice, nextWeek), 6);
        assertEq(token.balanceOf(alice, week), 0); // burned week still 0
    }
}
