// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @dev Exposes internal Marketplace helpers for testing
contract MarketplaceHarness is Marketplace {
    constructor(address _mealSwipeToken, address _paymentToken)
        Marketplace(_mealSwipeToken, _paymentToken)
    {}

    function getNextSaturdayMidnight() external view returns (uint256) {
        return _getNextSaturdayMidnight();
    }
}

contract MarketplaceTest is Test {
    MarketplaceHarness public market;
    MealSwipeToken public token;
    MockUSDC public usdc;

    address public alice = makeAddr("alice");
    address public bob   = makeAddr("bob");

    // Unix epoch (Jan 1 1970) = Thursday
    // Day offsets from epoch:
    uint256 constant THURSDAY  = 0;           // day 0
    uint256 constant FRIDAY    = 1 days;      // day 1
    uint256 constant SATURDAY  = 2 days;      // day 2
    uint256 constant SUNDAY    = 3 days;      // day 3
    uint256 constant MONDAY    = 4 days;      // day 4
    uint256 constant TUESDAY   = 5 days;      // day 5
    uint256 constant WEDNESDAY = 6 days;      // day 6

    function setUp() public {
        token = new MealSwipeToken();
        usdc = new MockUSDC();
        market = new MarketplaceHarness(address(token), address(usdc));
    }

    /// @dev Mint MST to a student and have them approve the market
    function _mintAndApprove(address student, uint256 amount) internal {
        uint256 week = token.getCurrentWeek();
        token.mint(student, amount, week);
        vm.prank(student);
        token.approve(address(market), amount);
    }

    /// @dev Mint USDC to a buyer and have them approve the market for totalPayment
    function _mintUSDCAndApprove(address buyer, uint256 totalPayment) internal {
        usdc.mint(buyer, totalPayment);
        vm.prank(buyer);
        usdc.approve(address(market), totalPayment);
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsOwner() public view {
        assertEq(market.owner(), address(this));
    }

    function test_Constructor_SetsMealSwipeToken() public view {
        assertEq(address(market.mealSwipeToken()), address(token));
    }

    function test_Constructor_SetsPaymentToken() public view {
        assertEq(address(market.paymentToken()), address(usdc));
    }

    function test_Constructor_SetsOfferCountToZero() public view {
        assertEq(market.offerCount(), 0);
    }

    function test_Constants_MaxPrice() public view {
        assertEq(market.MAX_PRICE(), 12 * 1e6);
    }

    function test_Constants_MaxSwipes() public view {
        assertEq(market.MAX_SWIPES(), 6);
    }

    // ============ _getNextSaturdayMidnight Tests ============

    // Helper: compute expected Saturday 23:59:59 from any timestamp
    function _expectedSaturday(uint256 ts) internal pure returns (uint256) {
        uint256 dayOfWeek = (ts / 1 days + 4) % 7;
        uint256 daysUntilSaturday = (6 - dayOfWeek) % 7;
        uint256 startOfSaturday = (ts / 1 days + daysUntilSaturday) * 1 days;
        return startOfSaturday + 86399;
    }

    function test_GetNextSaturdayMidnight_FromThursday() public {
        vm.warp(THURSDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Thursday → 2 days until Saturday
        assertEq(result, SATURDAY + 86399);
    }

    function test_GetNextSaturdayMidnight_FromFriday() public {
        vm.warp(FRIDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Friday → 1 day until Saturday
        assertEq(result, SATURDAY + 86399);
    }

    function test_GetNextSaturdayMidnight_FromSaturday() public {
        vm.warp(SATURDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Saturday → 0 days, returns tonight's 23:59:59
        assertEq(result, SATURDAY + 86399);
    }

    function test_GetNextSaturdayMidnight_FromSaturday_MidDay() public {
        vm.warp(SATURDAY + 12 hours);
        uint256 result = market.getNextSaturdayMidnight();
        // Still Saturday — same-day expiry, not next week
        assertEq(result, SATURDAY + 86399);
    }

    function test_GetNextSaturdayMidnight_FromSunday() public {
        vm.warp(SUNDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Sunday → 6 days until next Saturday
        assertEq(result, SATURDAY + 7 days + 86399);
    }

    function test_GetNextSaturdayMidnight_FromMonday() public {
        vm.warp(MONDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86399);
    }

    function test_GetNextSaturdayMidnight_FromTuesday() public {
        vm.warp(TUESDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86399);
    }

    function test_GetNextSaturdayMidnight_FromWednesday() public {
        vm.warp(WEDNESDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86399);
    }

    function test_GetNextSaturdayMidnight_ResultIsAlways_23_59_59() public {
        // Spot-check that the returned value mod 1 day is always 86399 (23:59:59)
        uint256[7] memory days_ = [THURSDAY, FRIDAY, SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY];
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(days_[i]);
            uint256 result = market.getNextSaturdayMidnight();
            assertEq(result % 1 days, 86399, "Time-of-day should always be 23:59:59");
        }
    }

    function test_GetNextSaturdayMidnight_ResultIsAlwaysInFuture() public {
        uint256[7] memory days_ = [THURSDAY, FRIDAY, SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY];
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(days_[i]);
            uint256 result = market.getNextSaturdayMidnight();
            assertGe(result, block.timestamp, "expiry must be >= current time");
        }
    }

    function test_GetNextSaturdayMidnight_AdvancesWeeklyAfterSaturday() public {
        // Call once on Saturday, advance past it, verify we get the next Saturday
        vm.warp(SATURDAY);
        uint256 firstExpiry = market.getNextSaturdayMidnight();

        vm.warp(SATURDAY + 1 days); // now Sunday
        uint256 secondExpiry = market.getNextSaturdayMidnight();

        assertEq(secondExpiry, firstExpiry + 7 days);
    }

    // ============ createSellOffer Tests ============

    function test_CreateSellOffer_EscrowsTokens() public {
        _mintAndApprove(alice, 3);

        vm.prank(alice);
        market.createSellOffer(3, 10_000_000); // 3 swipes @ $10 each

        // tokens left alice
        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 0);
        // tokens are now in escrow (market contract holds them)
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 3);
    }

    function test_CreateSellOffer_StoresOfferFields() public {
        _mintAndApprove(alice, 3);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        (
            uint256 storedId,
            Marketplace.OfferType offerType,
            address creator,
            uint256 swipeCount,
            uint256 pricePerSwipe,
            uint256 storedExpiry,
            Marketplace.OfferStatus status
        ) = market.offers(offerId);

        assertEq(storedId, 1);
        assertEq(uint256(offerType), uint256(Marketplace.OfferType.Ask));
        assertEq(creator, alice);
        assertEq(swipeCount, 3);
        assertEq(pricePerSwipe, 10_000_000);
        assertEq(storedExpiry, expiresAt);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Pending));
    }

    function test_CreateSellOffer_ReturnsAndIncrementsOfferId() public {
        _mintAndApprove(alice, 6);

        vm.startPrank(alice);
        token.approve(address(market), 6); // top up allowance
        uint256 id1 = market.createSellOffer(3, 10_000_000);
        uint256 id2 = market.createSellOffer(3, 10_000_000);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(market.offerCount(), 2);
    }

    function test_CreateSellOffer_EmitsOfferCreated() public {
        _mintAndApprove(alice, 3);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.expectEmit(true, true, false, true);
        emit Marketplace.OfferCreated(1, alice, Marketplace.OfferType.Ask, 3, 10_000_000, expiresAt);

        vm.prank(alice);
        market.createSellOffer(3, 10_000_000);
    }

    function test_CreateSellOffer_RevertsOnZeroSwipes() public {
        vm.prank(alice);
        vm.expectRevert(Marketplace.InvalidSwipeCount.selector);
        market.createSellOffer(0, 10_000_000);
    }

    function test_CreateSellOffer_RevertsOnSwipesExceedingMax() public {
        vm.prank(alice);
        vm.expectRevert(Marketplace.InvalidSwipeCount.selector);
        market.createSellOffer(7, 10_000_000);
    }

    function test_CreateSellOffer_RevertsOnZeroPrice() public {
        _mintAndApprove(alice, 3);

        vm.prank(alice);
        vm.expectRevert(Marketplace.InvalidPrice.selector);
        market.createSellOffer(3, 0);
    }

    function test_CreateSellOffer_RevertsWhenPriceExceedsMax() public {
        _mintAndApprove(alice, 3);

        vm.prank(alice);
        vm.expectRevert(Marketplace.PriceExceedsMax.selector);
        market.createSellOffer(3, 12_000_001); // $12.000001 — one unit over cap
    }

    function test_CreateSellOffer_AllowsExactMaxPrice() public {
        _mintAndApprove(alice, 1);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(1, 12_000_000); // exactly $12
        assertEq(offerId, 1);
    }

    function test_CreateSellOffer_RevertsWithoutAllowance() public {
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);
        // alice never calls approve()

        vm.prank(alice);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.createSellOffer(3, 10_000_000);
    }

    function test_CreateSellOffer_RevertsWithInsufficientAllowance() public {
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);
        vm.prank(alice);
        token.approve(address(market), 2); // approved 2, trying to sell 3

        vm.prank(alice);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.createSellOffer(3, 10_000_000);
    }

    // ============ createBuyOffer Tests ============

    function test_CreateBuyOffer_EscrowsPayment() public {
        uint256 totalPayment = 3 * 10_000_000; // 3 swipes @ $10
        _mintUSDCAndApprove(bob, totalPayment);

        vm.prank(bob);
        market.createBuyOffer(3, 10_000_000);

        // USDC left bob
        assertEq(usdc.balanceOf(bob), 0);
        // USDC is now in escrow
        assertEq(usdc.balanceOf(address(market)), totalPayment);
    }

    function test_CreateBuyOffer_StoresOfferFields() public {
        uint256 totalPayment = 3 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, 10_000_000);

        (
            uint256 storedId,
            Marketplace.OfferType offerType,
            address creator,
            uint256 swipeCount,
            uint256 pricePerSwipe,
            uint256 storedExpiry,
            Marketplace.OfferStatus status
        ) = market.offers(offerId);

        assertEq(storedId, 1);
        assertEq(uint256(offerType), uint256(Marketplace.OfferType.Bid));
        assertEq(creator, bob);
        assertEq(swipeCount, 3);
        assertEq(pricePerSwipe, 10_000_000);
        assertEq(storedExpiry, expiresAt);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Pending));
    }

    function test_CreateBuyOffer_EmitsOfferCreated() public {
        uint256 totalPayment = 3 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.expectEmit(true, true, false, true);
        emit Marketplace.OfferCreated(1, bob, Marketplace.OfferType.Bid, 3, 10_000_000, expiresAt);

        vm.prank(bob);
        market.createBuyOffer(3, 10_000_000);
    }

    function test_CreateBuyOffer_EscrowsCorrectTotalPayment() public {
        // 6 swipes @ $12 = $72 total — verifies swipeCount * pricePerSwipe math
        uint256 totalPayment = 6 * 12_000_000;
        _mintUSDCAndApprove(bob, totalPayment);

        vm.prank(bob);
        market.createBuyOffer(6, 12_000_000);

        assertEq(usdc.balanceOf(address(market)), totalPayment);
    }

    function test_CreateBuyOffer_ReturnsAndIncrementsOfferId() public {
        uint256 payment = 1 * 10_000_000;
        _mintUSDCAndApprove(bob, payment * 2);

        vm.startPrank(bob);
        usdc.approve(address(market), payment * 2);
        uint256 id1 = market.createBuyOffer(1, 10_000_000);
        uint256 id2 = market.createBuyOffer(1, 10_000_000);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(market.offerCount(), 2);
    }

    function test_CreateBuyOffer_OfferCountSharedWithSellOffers() public {
        // sell offer gets id 1, buy offer gets id 2 — they share the same counter
        _mintAndApprove(alice, 1);
        vm.prank(alice);
        market.createSellOffer(1, 10_000_000);

        _mintUSDCAndApprove(bob, 10_000_000);
        vm.prank(bob);
        uint256 buyId = market.createBuyOffer(1, 10_000_000);

        assertEq(buyId, 2);
    }

    function test_CreateBuyOffer_RevertsOnZeroSwipes() public {
        vm.prank(bob);
        vm.expectRevert(Marketplace.InvalidSwipeCount.selector);
        market.createBuyOffer(0, 10_000_000);
    }

    function test_CreateBuyOffer_RevertsOnSwipesExceedingMax() public {
        vm.prank(bob);
        vm.expectRevert(Marketplace.InvalidSwipeCount.selector);
        market.createBuyOffer(7, 10_000_000);
    }

    function test_CreateBuyOffer_RevertsOnZeroPrice() public {
        vm.prank(bob);
        vm.expectRevert(Marketplace.InvalidPrice.selector);
        market.createBuyOffer(3, 0);
    }

    function test_CreateBuyOffer_RevertsWhenPriceExceedsMax() public {
        vm.prank(bob);
        vm.expectRevert(Marketplace.PriceExceedsMax.selector);
        market.createBuyOffer(3, 12_000_001);
    }

    function test_CreateBuyOffer_RevertsWithoutAllowance() public {
        usdc.mint(bob, 30_000_000);
        // bob never calls usdc.approve()

        vm.prank(bob);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.createBuyOffer(3, 10_000_000);
    }

    function test_CreateBuyOffer_RevertsWithInsufficientAllowance() public {
        uint256 totalPayment = 3 * 10_000_000;
        usdc.mint(bob, totalPayment);
        vm.prank(bob);
        usdc.approve(address(market), totalPayment - 1); // one unit short

        vm.prank(bob);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.createBuyOffer(3, 10_000_000);
    }

    // ============ cancelOffer Tests ============

    function test_CancelOffer_Ask_ReturnsTokensToSeller() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        uint256 weekBefore = token.getCurrentWeek();

        vm.prank(alice);
        market.cancelOffer(offerId);

        assertEq(token.balanceOf(alice, weekBefore), 3);
        assertEq(token.balanceOf(address(market), weekBefore), 0);
    }

    function test_CancelOffer_Bid_ReturnsPaymentToBuyer() public {
        uint256 totalPayment = 3 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, 10_000_000);

        vm.prank(bob);
        market.cancelOffer(offerId);

        assertEq(usdc.balanceOf(bob), totalPayment);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_CancelOffer_SetsStatusToCancelled() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        vm.prank(alice);
        market.cancelOffer(offerId);

        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Cancelled));
    }

    function test_CancelOffer_EmitsEvent() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        vm.expectEmit(true, true, false, false);
        emit Marketplace.OfferCancelled(offerId, alice);

        vm.prank(alice);
        market.cancelOffer(offerId);
    }

    function test_CancelOffer_RevertsForNonCreator() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.NotOfferCreator.selector, offerId));
        market.cancelOffer(offerId);
    }

    function test_CancelOffer_RevertsForInvalidOfferId() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 99));
        market.cancelOffer(99);
    }

    function test_CancelOffer_RevertsForOfferIdZero() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 0));
        market.cancelOffer(0);
    }

    function test_CancelOffer_RevertsIfAlreadyCancelled() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        vm.prank(alice);
        market.cancelOffer(offerId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.cancelOffer(offerId);
    }

    function test_CancelOffer_Bid_ReturnsCorrectTotalPayment() public {
        // 6 swipes @ $12 = $72 — verifies swipeCount * pricePerSwipe math on return
        uint256 totalPayment = 6 * 12_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(6, 12_000_000);

        vm.prank(bob);
        market.cancelOffer(offerId);

        assertEq(usdc.balanceOf(bob), totalPayment);
    }

    // ============ End-to-End Integration Test ============

    function test_Integration_FullFlow() public {
        address diningHall = makeAddr("diningHall");
        uint256 week        = token.getCurrentWeek();

        // ── Setup ────────────────────────────────────────────────────────────
        // Approve the marketplace as a dining terminal so it can hold tokens in
        // escrow (transferFrom), and approve the real dining hall for redeemSwipe.
        token.approveDining(address(market));
        token.approveDining(diningHall);

        // ── Step 1: mint ─────────────────────────────────────────────────────
        // Admin loads alice with 6 swipes and bob with $60 USDC for the week.
        token.mint(alice, 6, week);
        usdc.mint(bob, 60_000_000); // $60

        assertEq(token.balanceOf(alice, week), 6);
        assertEq(usdc.balanceOf(bob),          60_000_000);

        // ── Step 2: createSellOffer ───────────────────────────────────────────
        // Alice lists 3 swipes @ $10 each. Tokens move into escrow immediately.
        vm.startPrank(alice);
        token.approve(address(market), 3);
        uint256 offerId = market.createSellOffer(3, 10_000_000);
        vm.stopPrank();

        assertEq(token.balanceOf(alice,          week), 3); // 3 remain with alice
        assertEq(token.balanceOf(address(market), week), 3); // 3 in escrow
        assertEq(market.offerCount(), 1);

        (,Marketplace.OfferType offerType,, uint256 swipeCount,, , Marketplace.OfferStatus status)
            = market.offers(offerId);
        assertEq(uint256(offerType),  uint256(Marketplace.OfferType.Ask));
        assertEq(swipeCount,          3);
        assertEq(uint256(status),     uint256(Marketplace.OfferStatus.Pending));

        // ── Step 3: acceptOffer ───────────────────────────────────────────────
        // Bob buys alice's 3 swipes for $30. Payment goes alice directly; tokens
        // released from escrow to bob.
        vm.startPrank(bob);
        usdc.approve(address(market), 30_000_000); // $30
        market.acceptOffer(offerId);
        vm.stopPrank();

        assertEq(token.balanceOf(bob,            week), 3);  // bob got swipes
        assertEq(token.balanceOf(alice,          week), 3);  // alice kept her 3
        assertEq(token.balanceOf(address(market), week), 0); // escrow cleared
        assertEq(usdc.balanceOf(alice),  30_000_000);        // alice got $30
        assertEq(usdc.balanceOf(bob),    30_000_000);        // bob has $30 left

        (, , , , , , Marketplace.OfferStatus acceptedStatus) = market.offers(offerId);
        assertEq(uint256(acceptedStatus), uint256(Marketplace.OfferStatus.Accepted));

        // ── Step 4: redeemSwipe ───────────────────────────────────────────────
        // Bob uses 2 swipes at the dining hall. Alice uses 1.
        vm.startPrank(diningHall);
        token.redeemSwipe(bob);
        token.redeemSwipe(bob);
        token.redeemSwipe(alice);
        vm.stopPrank();

        assertEq(token.balanceOf(bob,   week), 1); // 1 remaining
        assertEq(token.balanceOf(alice, week), 2); // 2 remaining
        assertEq(token.totalSupplyByWeek(week), 3); // 6 minted - 3 redeemed

        // ── Step 5: burnAll ───────────────────────────────────────────────────
        // Week ends. All remaining balances expire.
        token.burnAll(week);

        assertEq(token.balanceOf(bob,   week), 0); // expired
        assertEq(token.balanceOf(alice, week), 0); // expired
        assertEq(token.totalSupplyByWeek(week), 0);
        assertTrue(token.burnedWeeks(week));

        // ── Step 6: new week is clean ─────────────────────────────────────────
        // Advance time, confirm old burned state doesn't bleed into next week.
        vm.warp(block.timestamp + 7 days);
        uint256 nextWeek = token.getCurrentWeek();

        token.mint(alice, 6, nextWeek);
        assertEq(token.balanceOf(alice, nextWeek), 6);
        assertEq(token.balanceOf(alice, week),     0); // old week still burned
    }

    // ============ getOffer Tests ============

    function test_GetOffer_ReturnsCorrectStruct() public {
        _mintAndApprove(alice, 3);
        uint256 expiresAt = market.getNextSaturdayMidnight();
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        Marketplace.Offer memory offer = market.getOffer(offerId);

        assertEq(offer.offerId, offerId);
        assertEq(uint256(offer.offerType), uint256(Marketplace.OfferType.Ask));
        assertEq(offer.creator, alice);
        assertEq(offer.swipeCount, 3);
        assertEq(offer.pricePerSwipe, 10_000_000);
        assertEq(offer.expiresAt, expiresAt);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Pending));
    }

    function test_GetOffer_ReflectsStatusChange() public {
        _mintAndApprove(alice, 3);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000);

        vm.prank(alice);
        market.cancelOffer(offerId);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Cancelled));
    }

    function test_GetOffer_RevertsForInvalidId() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 99));
        market.getOffer(99);
    }

    function test_GetOffer_RevertsForIdZero() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 0));
        market.getOffer(0);
    }

    // ============ acceptOffer (Ask) Tests ============

    /// @dev Helper: alice creates a sell offer; bob is the buyer
    function _createAskOffer(uint256 swipeCount, uint256 pricePerSwipe)
        internal
        returns (uint256 offerId)
    {
        _mintAndApprove(alice, swipeCount);
        vm.prank(alice);
        offerId = market.createSellOffer(swipeCount, pricePerSwipe);
    }

    /// @dev Helper: give bob enough USDC and approval to accept an ask
    function _prepareBuyer(address buyer, uint256 totalPayment) internal {
        _mintUSDCAndApprove(buyer, totalPayment);
    }

    function test_AcceptOffer_Ask_BuyerGetsSwipes() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(token.balanceOf(bob, token.getCurrentWeek()), 3);
    }

    function test_AcceptOffer_Ask_SellerGetsPaid() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        _prepareBuyer(bob, totalPayment);

        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(usdc.balanceOf(alice), totalPayment);
    }

    function test_AcceptOffer_Ask_MarketReleasesEscrow() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 0);
    }

    function test_AcceptOffer_Ask_SetsStatusToAccepted() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.prank(bob);
        market.acceptOffer(offerId);

        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Accepted));
    }

    function test_AcceptOffer_Ask_EmitsOfferAccepted() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.expectEmit(true, true, false, false);
        emit Marketplace.OfferAccepted(offerId, bob);

        vm.prank(bob);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_RevertsOnDoubleAccept() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.prank(bob);
        market.acceptOffer(offerId);

        // second attempt — status is now Accepted, not Pending
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_RevertsWhenExpired() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        // warp past the Saturday 23:59:59 expiry
        vm.warp(market.getNextSaturdayMidnight() + 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferIsExpired.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_RevertsForOwnOffer() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(alice, 3 * 10_000_000);

        vm.prank(alice);
        vm.expectRevert(Marketplace.CannotAcceptOwnOffer.selector);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_RevertsForInvalidOfferId() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 99));
        market.acceptOffer(99);
    }

    function test_AcceptOffer_Ask_RevertsWithoutPaymentAllowance() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        usdc.mint(bob, 3 * 10_000_000);
        // bob never calls usdc.approve()

        vm.prank(bob);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_RevertsWithInsufficientPaymentAllowance() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        usdc.mint(bob, totalPayment);
        vm.prank(bob);
        usdc.approve(address(market), totalPayment - 1); // one unit short

        vm.prank(bob);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.acceptOffer(offerId);
    }

    // ============ acceptOffer (Bid) Tests ============

    /// @dev Helper: bob posts a buy offer; alice is the seller who accepts
    function _createBidOffer(uint256 swipeCount, uint256 pricePerSwipe)
        internal
        returns (uint256 offerId)
    {
        uint256 totalPayment = swipeCount * pricePerSwipe;
        _mintUSDCAndApprove(bob, totalPayment);
        vm.prank(bob);
        offerId = market.createBuyOffer(swipeCount, pricePerSwipe);
    }

    /// @dev Helper: mint tokens to seller and approve market to pull them
    function _prepareSeller(address seller, uint256 swipeCount) internal {
        _mintAndApprove(seller, swipeCount);
    }

    function test_AcceptOffer_Bid_BuyerGetsSwipes() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        // bob (buyer/creator) receives the swipes
        assertEq(token.balanceOf(bob, token.getCurrentWeek()), 3);
    }

    function test_AcceptOffer_Bid_SellerGetsPaid() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        // alice (seller/acceptor) receives the escrowed USDC
        assertEq(usdc.balanceOf(alice), totalPayment);
    }

    function test_AcceptOffer_Bid_MarketReleasesEscrowedPayment() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_AcceptOffer_Bid_SellerTokensGoToBuyer() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        // alice's tokens left her wallet
        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 0);
    }

    function test_AcceptOffer_Bid_SetsStatusToAccepted() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Accepted));
    }

    function test_AcceptOffer_Bid_EmitsOfferAccepted() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.expectEmit(true, true, false, false);
        emit Marketplace.OfferAccepted(offerId, alice);

        vm.prank(alice);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_RevertsOnDoubleAccept() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.prank(alice);
        market.acceptOffer(offerId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_RevertsWhenExpired() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);

        vm.warp(market.getNextSaturdayMidnight() + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferIsExpired.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_RevertsForOwnOffer() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(bob, 3);

        vm.prank(bob);
        vm.expectRevert(Marketplace.CannotAcceptOwnOffer.selector);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_RevertsWithoutTokenAllowance() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);
        // alice never calls token.approve()

        vm.prank(alice);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_RevertsWithInsufficientTokenAllowance() public {
        uint256 offerId = _createBidOffer(3, 10_000_000);
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);
        vm.prank(alice);
        token.approve(address(market), 2); // approved 2, offer needs 3

        vm.prank(alice);
        vm.expectRevert(Marketplace.InsufficientTokenAllowance.selector);
        market.acceptOffer(offerId);
    }
}
