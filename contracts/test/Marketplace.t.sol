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
        return startOfSaturday + 86100;
    }

    function test_GetNextSaturdayMidnight_FromThursday() public {
        vm.warp(THURSDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Thursday → 2 days until Saturday
        assertEq(result, SATURDAY + 86100);
    }

    function test_GetNextSaturdayMidnight_FromFriday() public {
        vm.warp(FRIDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Friday → 1 day until Saturday
        assertEq(result, SATURDAY + 86100);
    }

    function test_GetNextSaturdayMidnight_FromSaturday() public {
        vm.warp(SATURDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Saturday → 0 days, returns tonight's 23:59:59
        assertEq(result, SATURDAY + 86100);
    }

    function test_GetNextSaturdayMidnight_FromSaturday_MidDay() public {
        vm.warp(SATURDAY + 12 hours);
        uint256 result = market.getNextSaturdayMidnight();
        // Still Saturday — same-day expiry, not next week
        assertEq(result, SATURDAY + 86100);
    }

    function test_GetNextSaturdayMidnight_FromSunday() public {
        vm.warp(SUNDAY);
        uint256 result = market.getNextSaturdayMidnight();
        // Sunday → 6 days until next Saturday
        assertEq(result, SATURDAY + 7 days + 86100);
    }

    function test_GetNextSaturdayMidnight_FromMonday() public {
        vm.warp(MONDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86100);
    }

    function test_GetNextSaturdayMidnight_FromTuesday() public {
        vm.warp(TUESDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86100);
    }

    function test_GetNextSaturdayMidnight_FromWednesday() public {
        vm.warp(WEDNESDAY);
        uint256 result = market.getNextSaturdayMidnight();
        assertEq(result, SATURDAY + 7 days + 86100);
    }

    function test_GetNextSaturdayMidnight_ResultIsAlways_23_55_00() public {
        // Spot-check that the returned value mod 1 day is always 86100 (23:55:00)
        uint256[7] memory days_ = [THURSDAY, FRIDAY, SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY];
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(days_[i]);
            uint256 result = market.getNextSaturdayMidnight();
            assertEq(result % 1 days, 86100, "Time-of-day should always be 23:55:00");
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

    // ============ createSellOffer() Edge Cases ============

    function test_CreateSellOffer_EdgeCase_MinSwipeCount() public {
        // swipeCount = 1 is the boundary minimum — explicit test distinct from AllowsExactMaxPrice.
        _mintAndApprove(alice, 1);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(1, 10_000_000);

        (, , , uint256 swipeCount, , , ) = market.offers(offerId);
        assertEq(swipeCount, 1);
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 1);
    }

    function test_CreateSellOffer_EdgeCase_MaxSwipeCount() public {
        // swipeCount = 6 is the boundary maximum — no existing test creates a single
        // offer with all 6 swipes.
        _mintAndApprove(alice, 6);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(6, 10_000_000);

        (, , , uint256 swipeCount, , , ) = market.offers(offerId);
        assertEq(swipeCount, 6);
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 6);
    }

    function test_CreateSellOffer_EdgeCase_MinimumValidPrice() public {
        // pricePerSwipe = 1 (one USDC base unit) is the smallest valid non-zero price.
        _mintAndApprove(alice, 1);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(1, 1);

        (, , , , uint256 storedPrice, , ) = market.offers(offerId);
        assertEq(storedPrice, 1);
    }

    function test_CreateSellOffer_EdgeCase_TwoBackToBackOffersStoredIndependently() public {
        // Two consecutive sell offers must get different IDs and store their fields
        // independently — no struct aliasing or storage collision.
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 6, week);
        vm.prank(alice);
        token.approve(address(market), 6);

        vm.startPrank(alice);
        uint256 id1 = market.createSellOffer(2, 5_000_000);  // 2 swipes @ $5
        uint256 id2 = market.createSellOffer(4, 8_000_000);  // 4 swipes @ $8
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(market.offerCount(), 2);

        (, , , uint256 swipes1, uint256 price1, , ) = market.offers(id1);
        (, , , uint256 swipes2, uint256 price2, , ) = market.offers(id2);

        assertEq(swipes1, 2);
        assertEq(price1, 5_000_000);
        assertEq(swipes2, 4);
        assertEq(price2, 8_000_000);

        // All 6 escrowed tokens are now held by the contract
        assertEq(token.balanceOf(address(market), week), 6);
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

    // ============ createBuyOffer() Edge Cases ============

    function test_CreateBuyOffer_EdgeCase_MinSwipeCount() public {
        // swipeCount = 1 is the boundary minimum. ReturnsAndIncrementsOfferId uses 1
        // incidentally — this test isolates the boundary and verifies escrowed amount.
        uint256 totalPayment = 1 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);

        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(1, 10_000_000);

        (, , , uint256 swipeCount, , , ) = market.offers(offerId);
        assertEq(swipeCount, 1);
        assertEq(usdc.balanceOf(address(market)), totalPayment);
    }

    function test_CreateBuyOffer_EdgeCase_MinimumValidPrice() public {
        // pricePerSwipe = 1 (one USDC base unit) is the smallest valid non-zero price.
        // totalPayment = 1 * 1 = 1 base unit.
        _mintUSDCAndApprove(bob, 1);

        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(1, 1);

        (, , , , uint256 storedPrice, , ) = market.offers(offerId);
        assertEq(storedPrice, 1);
        assertEq(usdc.balanceOf(address(market)), 1);
    }

    function test_CreateBuyOffer_EdgeCase_ExactAllowanceLeavesZeroRemainder() public {
        // Buyer approves exactly totalPayment — the transferFrom consumes the entire
        // allowance, leaving 0 remaining. Confirms no over-pull.
        uint256 totalPayment = 3 * 8_000_000; // 3 swipes @ $8 = $24
        usdc.mint(bob, totalPayment);
        vm.prank(bob);
        usdc.approve(address(market), totalPayment); // exactly enough

        vm.prank(bob);
        market.createBuyOffer(3, 8_000_000);

        assertEq(usdc.allowance(bob, address(market)), 0);
        assertEq(usdc.balanceOf(address(market)), totalPayment);
    }

    function test_CreateBuyOffer_EdgeCase_ExcessAllowanceRemainsIntact() public {
        // Buyer approves more than totalPayment — only totalPayment is pulled,
        // the surplus allowance is untouched.
        uint256 totalPayment = 2 * 5_000_000; // 2 swipes @ $5 = $10
        uint256 surplus = 20_000_000;
        usdc.mint(bob, totalPayment + surplus);
        vm.prank(bob);
        usdc.approve(address(market), totalPayment + surplus);

        vm.prank(bob);
        market.createBuyOffer(2, 5_000_000);

        assertEq(usdc.allowance(bob, address(market)), surplus);
        assertEq(usdc.balanceOf(address(market)), totalPayment);
        assertEq(usdc.balanceOf(bob), surplus); // surplus stays with bob
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

    // ============ cancelOffer() Edge Cases ============

    function test_CancelOffer_EdgeCase_RevertsIfAlreadyAccepted() public {
        // An accepted offer has status Accepted — cancelling it must revert OfferNotPending.
        // Distinct from the cancel-after-cancel test: both use OfferNotPending but the
        // prior status is different, exercising the same guard from a different state.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        vm.prank(bob);
        market.acceptOffer(offerId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.cancelOffer(offerId);
    }

    function test_CancelOffer_EdgeCase_ExpiredOfferCanStillBeCancelled() public {
        // cancelOffer has no expiresAt check — it only requires status == Pending.
        // An offer past its Saturday 23:59:59 deadline is still Pending on-chain until
        // explicitly cancelled or accepted. The creator can always recover escrowed assets.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt + 1 days); // well past expiry

        vm.prank(alice);
        market.cancelOffer(offerId); // must not revert

        // Tokens returned to alice despite expiry.
        // Note: expiresAt + 1 day is still within the same 7-day epoch, so
        // getCurrentWeek() is unchanged and alice's balance is restored there.
        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 3);
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 0);
        // Verify status via the public mapping
        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Cancelled));
    }

    function test_CancelOffer_EdgeCase_GetOfferReturnsStatusCancelled() public {
        // Verifies the getOffer() view (not the raw offers mapping) reflects Cancelled
        // after cancellation. getOffer reverts for invalid IDs, so this also confirms
        // the ID remains valid post-cancel.
        uint256 offerId = _createAskOffer(3, 10_000_000);

        vm.prank(alice);
        market.cancelOffer(offerId);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Cancelled));
        assertEq(offer.offerId, offerId);
        assertEq(offer.creator, alice);
    }

    // ============ claimExpiredOffer Tests ============

    function test_ClaimExpiredOffer_Ask_ReturnsTokensToCreator() public {
        // The normal happy path: admin (or any keeper) calls claimExpiredOffer in the
        // 5-minute window between 23:55:00 (offer expires) and 23:59:59 (burnAll).
        // Seller gets tokens back without needing to be online.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt); // offer has just expired

        market.claimExpiredOffer(offerId); // called by admin/keeper, not alice

        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 3);
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 0);
    }

    function test_ClaimExpiredOffer_Bid_ReturnsUSDCToCreator() public {
        uint256 totalPayment = 3 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt);

        market.claimExpiredOffer(offerId);

        assertEq(usdc.balanceOf(bob), totalPayment);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_ClaimExpiredOffer_SetsStatusToExpired() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        vm.warp(market.getNextSaturdayMidnight());

        market.claimExpiredOffer(offerId);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Expired));
    }

    function test_ClaimExpiredOffer_EmitsOfferExpired() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        vm.warp(market.getNextSaturdayMidnight());

        vm.expectEmit(true, false, false, false);
        emit Marketplace.OfferExpired(offerId);

        market.claimExpiredOffer(offerId);
    }

    function test_ClaimExpiredOffer_CallableByAnyone() public {
        // Not restricted to owner or creator — any address can trigger the refund.
        // This allows admin keeper scripts, bots, or other users to clean up expired offers.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        vm.warp(market.getNextSaturdayMidnight());

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        market.claimExpiredOffer(offerId); // no revert

        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 3);
    }

    function test_ClaimExpiredOffer_RevertsIfNotYetExpired() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt - 1); // one second before expiry

        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotYetExpired.selector, offerId));
        market.claimExpiredOffer(offerId);
    }

    function test_ClaimExpiredOffer_RevertsIfAlreadyClaimed() public {
        uint256 offerId = _createAskOffer(3, 10_000_000);
        vm.warp(market.getNextSaturdayMidnight());

        market.claimExpiredOffer(offerId);

        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.claimExpiredOffer(offerId);
    }

    function test_ClaimExpiredOffer_RevertsForInvalidId() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotFound.selector, 99));
        market.claimExpiredOffer(99);
    }

    function test_ClaimExpiredOffer_Ask_ThenBurnAllSafe() public {
        // Full happy path: claimExpiredOffer in the 5-minute window, then burnAll.
        // Tokens are returned before the epoch is burned, so no tokens are ever locked.
        uint256 week = token.getCurrentWeek();
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt); // 23:55:00 — offer expired, burnAll not yet called

        market.claimExpiredOffer(offerId); // admin keeper sweeps this offer

        // Alice has her 3 tokens back
        assertEq(token.balanceOf(alice, token.getCurrentWeek()), 3);

        // burnAll fires at 23:59:59 — safe because no tokens remain in escrow
        vm.warp(expiresAt + 4 minutes + 59 seconds);
        token.burnAll(week); // no revert, no locked tokens
    }

    // ============ Cross-Contract / Epoch Interaction Edge Cases ============

    function test_Epoch_SellOfferBurnAllAcceptReverts() public {
        // If burnAll fires BEFORE claimExpiredOffer is called (e.g. admin error or
        // offer created after the 11:55pm cutoff), the epoch guard blocks the transfer.
        // acceptOffer sets status = Accepted (CEI) then mealSwipeToken.transfer reverts
        // with EpochAlreadyBurned — the whole transaction unwinds, status returns to Pending.
        // In the normal flow claimExpiredOffer is called first, so this is a last-resort test.
        uint256 week = token.getCurrentWeek();
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);

        token.burnAll(week);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        market.acceptOffer(offerId);

        // Offer status is still Pending (CEI + revert unwound the Accepted write)
        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Pending));

        // Bob's USDC was not moved (entire transaction reverted)
        assertEq(usdc.balanceOf(bob), 3 * 10_000_000);
    }

    function test_Epoch_SellOfferBurnAllCancelReverts() public {
        // Same edge case, cancel path. After burnAll, mealSwipeToken.transfer reverts,
        // so cancelOffer also can't return tokens. In normal flow, claimExpiredOffer
        // is called in the 5-minute window BEFORE burnAll, avoiding this entirely.
        uint256 week = token.getCurrentWeek();
        uint256 offerId = _createAskOffer(3, 10_000_000);

        token.burnAll(week);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        market.cancelOffer(offerId);

        // Offer status is still Pending (revert unwound the Cancelled write)
        (, , , , , , Marketplace.OfferStatus status) = market.offers(offerId);
        assertEq(uint256(status), uint256(Marketplace.OfferStatus.Pending));
    }

    function test_Epoch_BidOfferBurnAllCancelSucceeds() public {
        // Contrast with Ask: a Bid's escrowed USDC is NOT subject to burnedWeeks.
        // cancelOffer for a Bid calls paymentToken.transfer(creator, totalPayment) —
        // MockUSDC has no epoch guard, so the buyer always recovers their USDC.
        uint256 week = token.getCurrentWeek();
        uint256 totalPayment = 3 * 10_000_000;
        _mintUSDCAndApprove(bob, totalPayment);
        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, 10_000_000);

        token.burnAll(week);

        vm.prank(bob);
        market.cancelOffer(offerId); // must succeed

        assertEq(usdc.balanceOf(bob), totalPayment);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_Epoch_OfferCountOnlyIncrements() public {
        // offerCount is a pre-incremented counter — it advances on every createSellOffer
        // and createBuyOffer call and is never decremented by cancellation or acceptance.
        _mintAndApprove(alice, 6);
        vm.prank(alice);
        token.approve(address(market), 6);

        // Create 3 sell offers
        vm.startPrank(alice);
        market.createSellOffer(1, 5_000_000); // id 1
        market.createSellOffer(1, 5_000_000); // id 2
        market.createSellOffer(1, 5_000_000); // id 3
        vm.stopPrank();

        // Cancel offer 1
        vm.prank(alice);
        market.cancelOffer(1);
        assertEq(market.offerCount(), 3); // unchanged

        // Create a buy offer
        _mintUSDCAndApprove(bob, 5_000_000);
        vm.prank(bob);
        market.createBuyOffer(1, 5_000_000); // id 4
        assertEq(market.offerCount(), 4);

        // Accept offer 2
        _prepareBuyer(bob, 5_000_000);
        vm.prank(bob);
        market.acceptOffer(2);
        assertEq(market.offerCount(), 4); // still unchanged

        // Create one more
        _mintAndApprove(alice, 1);
        vm.prank(alice);
        market.createSellOffer(1, 5_000_000); // id 5
        assertEq(market.offerCount(), 5);
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

    // ============ Integration Tests ============

    function test_Integration_LateCreationReverts() public {
        // Creating an offer between 23:55:00 and midnight Saturday is blocked:
        // _getNextSaturdayMidnight() returns this Saturday's 23:55:00, which is
        // already in the past, so expiresAt <= block.timestamp → OfferAlreadyExpired.
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 6, week);

        // At exactly 23:55:00 (the expiry second itself)
        vm.warp(SATURDAY + 86100);
        vm.prank(alice);
        token.approve(address(market), 3);
        vm.prank(alice);
        vm.expectRevert(Marketplace.OfferAlreadyExpired.selector);
        market.createSellOffer(3, 10_000_000);

        // At 23:59:59 — four minutes into the burnAll buffer
        vm.warp(SATURDAY + 86399);
        _mintUSDCAndApprove(bob, 30_000_000);
        vm.prank(bob);
        vm.expectRevert(Marketplace.OfferAlreadyExpired.selector);
        market.createBuyOffer(3, 10_000_000);

        // One second before 23:55:00 — still valid
        vm.warp(SATURDAY + 86099);
        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, 10_000_000); // no revert
        assertGt(offerId, 0);
    }

    function test_Integration_FullSaturdayKeeperSequence() public {
        // Simulates the complete automated Saturday night sequence:
        // offers expire at 23:55 → keeper sweeps all pending offers → burnAll at 23:59
        // No user needs to be online. All escrowed assets are returned automatically.
        uint256 week = token.getCurrentWeek();
        address carol = makeAddr("carol");

        // Admin mints tokens to alice and carol
        token.mint(alice, 6, week);
        token.mint(carol, 4, week);
        usdc.mint(bob, 100_000_000);

        // Alice creates a sell offer (3 swipes @ $10)
        vm.prank(alice);
        token.approve(address(market), 3);
        vm.prank(alice);
        uint256 askId = market.createSellOffer(3, 10_000_000);

        // Carol creates a sell offer (2 swipes @ $8)
        vm.prank(carol);
        token.approve(address(market), 2);
        vm.prank(carol);
        uint256 carolAskId = market.createSellOffer(2, 8_000_000);

        // Bob creates a buy offer (2 swipes @ $9)
        vm.prank(bob);
        usdc.approve(address(market), 2 * 9_000_000);
        vm.prank(bob);
        uint256 bidId = market.createBuyOffer(2, 9_000_000);

        // Alice's offer gets accepted before expiry
        vm.prank(bob);
        usdc.approve(address(market), 30_000_000);
        vm.prank(bob);
        market.acceptOffer(askId);

        // Saturday 23:55:00 — carol's ask and bob's bid are still Pending
        uint256 expiresAt = market.getNextSaturdayMidnight();
        vm.warp(expiresAt);

        // Keeper sweeps all remaining Pending offers (carol and bob)
        market.claimExpiredOffer(carolAskId);
        market.claimExpiredOffer(bidId);

        // Carol got her tokens back; bob got his USDC back
        assertEq(token.balanceOf(carol, token.getCurrentWeek()), 4); // 2 returned + 2 never escrowed
        assertEq(token.balanceOf(address(market), token.getCurrentWeek()), 0);
        assertEq(usdc.balanceOf(address(market)), 0);

        // burnAll at 23:59 — safe, no tokens locked
        vm.warp(expiresAt + 4 minutes + 59 seconds);
        token.burnAll(week); // no revert

        // All balances expired
        assertEq(token.balanceOf(alice, week), 0);
        assertEq(token.balanceOf(carol, week), 0);
        assertEq(token.balanceOf(bob, week), 0);
    }

    function test_Integration_MultiWeekRollover() public {
        // Week N: alice sells to bob. An unaccepted offer from carol expires via keeper.
        // Week N+1: fresh mint, new offers, fully independent of week N state.
        uint256 weekN = token.getCurrentWeek();
        address carol = makeAddr("carol");

        token.mint(alice, 6, weekN);
        token.mint(carol, 3, weekN);
        usdc.mint(bob, 60_000_000);

        // Alice sells 3 to bob
        vm.prank(alice);
        token.approve(address(market), 3);
        vm.prank(alice);
        uint256 askId = market.createSellOffer(3, 10_000_000);
        vm.prank(bob);
        usdc.approve(address(market), 30_000_000);
        vm.prank(bob);
        market.acceptOffer(askId);

        // Carol's offer goes unaccepted
        vm.prank(carol);
        token.approve(address(market), 3);
        vm.prank(carol);
        uint256 carolId = market.createSellOffer(3, 10_000_000);

        // Saturday 23:55 — keeper claims carol's offer, then burnAll
        uint256 expiresAt = market.getNextSaturdayMidnight();
        vm.warp(expiresAt);
        market.claimExpiredOffer(carolId);
        vm.warp(expiresAt + 5 minutes);
        token.burnAll(weekN);

        // ── Week N+1 ──────────────────────────────────────────────────────────
        // Warp 8 days (not 7) — expiresAt + 7 days lands exactly on next Saturday
        // 23:55:00, which would itself trigger OfferAlreadyExpired. One extra day
        // puts us on Sunday, safely inside the new week's offer creation window.
        vm.warp(expiresAt + 8 days);
        uint256 weekN1 = token.getCurrentWeek();
        assertEq(weekN1, weekN + 1);

        token.mint(alice, 6, weekN1);
        token.mint(bob, 6, weekN1);

        // Week N state is untouched
        assertEq(token.balanceOf(alice, weekN), 0); // burned
        assertEq(token.balanceOf(carol, weekN), 0); // burned (tokens returned before burn)

        // Week N+1 is fresh
        assertEq(token.balanceOf(alice, weekN1), 6);
        assertEq(token.balanceOf(bob, weekN1), 6);

        // New offers work normally in week N+1
        vm.prank(alice);
        token.approve(address(market), 2);
        vm.prank(alice);
        uint256 newOfferId = market.createSellOffer(2, 10_000_000);
        assertEq(market.offerCount(), 3); // askId + carolId + newOfferId
        assertGt(newOfferId, carolId);
    }

    function test_Integration_MultiStudentScenario() public {
        // Four students, mixed offer types, some accepted, some expired.
        // Verifies the keeper handles the full state correctly.
        uint256 week = token.getCurrentWeek();
        address carol = makeAddr("carol");
        address dave  = makeAddr("dave");

        token.mint(alice, 6, week);
        token.mint(carol, 6, week);
        usdc.mint(bob,  120_000_000);
        usdc.mint(dave, 120_000_000);

        // Alice: sell 2 @ $10 — bob accepts
        vm.prank(alice);
        token.approve(address(market), 2);
        vm.prank(alice);
        uint256 id1 = market.createSellOffer(2, 10_000_000);
        vm.prank(bob);
        usdc.approve(address(market), 20_000_000);
        vm.prank(bob);
        market.acceptOffer(id1);

        // Carol: sell 4 @ $8 — no buyer, will expire
        vm.prank(carol);
        token.approve(address(market), 4);
        vm.prank(carol);
        uint256 id2 = market.createSellOffer(4, 8_000_000);

        // Dave: buy 3 @ $9 — no seller, will expire
        vm.prank(dave);
        usdc.approve(address(market), 3 * 9_000_000);
        vm.prank(dave);
        uint256 id3 = market.createBuyOffer(3, 9_000_000);

        // Carol cancels her own offer early
        vm.prank(carol);
        market.cancelOffer(id2);
        assertEq(token.balanceOf(carol, week), 6); // tokens returned

        // Dave's bid expires — keeper claims it
        vm.warp(market.getNextSaturdayMidnight());
        market.claimExpiredOffer(id3);
        assertEq(usdc.balanceOf(dave), 120_000_000); // full USDC returned

        // burnAll
        vm.warp(market.getNextSaturdayMidnight() + 5 minutes);
        token.burnAll(week);

        // Final state checks
        assertEq(token.balanceOf(alice, week), 0); // 4 remaining expired
        assertEq(token.balanceOf(carol, week), 0); // 6 expired
        assertEq(token.balanceOf(bob, week), 0);   // 2 from alice expired
        assertEq(token.balanceOf(address(market), week), 0); // no escrow
        assertEq(usdc.balanceOf(address(market)), 0); // no USDC in market
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

    // ============ acceptOffer (Ask) Edge Cases ============

    function test_AcceptOffer_Ask_EdgeCase_RevertsAtExactlyExpiresAt() public {
        // The expiry check is `block.timestamp >= offer.expiresAt`.
        // At exactly expiresAt (23:59:59 Saturday), the condition is true → revert.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        _prepareBuyer(bob, 3 * 10_000_000);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt); // exactly at the boundary

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferIsExpired.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Ask_EdgeCase_SucceedsOneSecondBeforeExpiry() public {
        // expiresAt - 1 is the last valid second — block.timestamp < expiresAt → accepted.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        _prepareBuyer(bob, totalPayment);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt - 1); // one second before the boundary

        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(token.balanceOf(bob, token.getCurrentWeek()), 3);
        assertEq(usdc.balanceOf(alice), totalPayment);
    }

    function test_AcceptOffer_Ask_EdgeCase_ExactUSDCAllowanceConsumedInFull() public {
        // Buyer approves exactly totalPayment. After acceptance the allowance must be 0 —
        // confirming transferFrom consumed it entirely with no under-pull.
        uint256 offerId = _createAskOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        _prepareBuyer(bob, totalPayment); // approves exactly totalPayment

        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(usdc.allowance(bob, address(market)), 0);
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

    // ============ acceptOffer (Bid) Edge Cases ============

    function test_AcceptOffer_Bid_EdgeCase_RevertsAtExactlyExpiresAt() public {
        // The expiry check is `block.timestamp >= offer.expiresAt`.
        // At exactly expiresAt the condition is true → revert, same as Ask path.
        uint256 offerId = _createBidOffer(3, 10_000_000);
        _prepareSeller(alice, 3);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferIsExpired.selector, offerId));
        market.acceptOffer(offerId);
    }

    function test_AcceptOffer_Bid_EdgeCase_SucceedsOneSecondBeforeExpiry() public {
        // expiresAt - 1 is the last valid second — block.timestamp < expiresAt → accepted.
        // Verifies token delivery to buyer and USDC release to seller at the boundary.
        uint256 offerId = _createBidOffer(3, 10_000_000);
        uint256 totalPayment = 3 * 10_000_000;
        _prepareSeller(alice, 3);
        uint256 expiresAt = market.getNextSaturdayMidnight();

        vm.warp(expiresAt - 1);

        vm.prank(alice);
        market.acceptOffer(offerId);

        assertEq(token.balanceOf(bob, token.getCurrentWeek()), 3);
        assertEq(usdc.balanceOf(alice), totalPayment);
        assertEq(usdc.balanceOf(address(market)), 0);
    }
}
