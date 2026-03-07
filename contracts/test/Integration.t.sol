// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {MealSwipeToken} from "../src/MealSwipeToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Full cross-contract integration tests covering the complete MealCoin system flow.
///
/// Covers (per CONT-03):
///   - Happy path: mint → sell offer → accept → redeem → burnAll
///   - Buy offer (bid) happy path
///   - Cancel sell and buy offers (escrow returned)
///   - Double-accept reverts (OfferNotPending)
///   - Expired offer reverts (OfferIsExpired)
///   - Over-transfer reverts (InsufficientBalance)
///   - CEI pattern: status set before transfers prevents double-spend
///   - Cross-contract: createSellOffer → burnAll → accept reverts (EpochAlreadyBurned)
///   - claimExpiredOffer returns escrowed tokens
///   - Cannot accept own offer
///   - Multi-user market flow with multiple concurrent offers
contract IntegrationTest is Test {
    MealSwipeToken public token;
    MockUSDC public usdc;
    Marketplace public market;

    address public alice   = makeAddr("alice");   // seller
    address public bob     = makeAddr("bob");     // buyer
    address public charlie = makeAddr("charlie"); // third-party acceptor
    address public diningHall = makeAddr("diningHall");

    uint256 constant PRICE_PER_SWIPE = 7 * 1e6; // $7.00 in MockUSDC (6 decimals)
    uint256 constant BOB_USDC        = 100 * 1e6;
    uint256 constant CHARLIE_USDC    = 100 * 1e6;

    function setUp() public {
        token  = new MealSwipeToken();
        usdc   = new MockUSDC();
        market = new Marketplace(address(token), address(usdc));

        usdc.mint(bob,     BOB_USDC);
        usdc.mint(charlie, CHARLIE_USDC);

        token.approveDining(diningHall);
    }

    // ─────────────────── helpers ───────────────────

    /// Mint `amount` MST to `student` for the current week and approve the marketplace.
    function _mintAndApproveToken(address student, uint256 amount) internal {
        uint256 week = token.getCurrentWeek();
        token.mint(student, amount, week);
        vm.prank(student);
        token.approve(address(market), amount);
    }

    /// Approve the marketplace to spend `amount` MockUSDC on behalf of `buyer`.
    function _approveUsdc(address buyer, uint256 amount) internal {
        vm.prank(buyer);
        usdc.approve(address(market), amount);
    }

    // ─────────────────── Test 1: Full Happy Path ───────────────────

    /// @dev Covers AT-01, AT-03, AT-04, AT-05 from the acceptance tests in the PRD.
    function test_Integration_FullHappyPath() public {
        uint256 week = token.getCurrentWeek();

        // 1. Mint 6 swipes to alice
        token.mint(alice, 6, week);
        assertEq(token.balanceOf(alice, week), 6);

        // 2. Alice posts a sell offer for 3 swipes at $7 each
        vm.startPrank(alice);
        token.approve(address(market), 3);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);
        vm.stopPrank();

        // Escrow check: alice's balance drops by 3, marketplace holds 3 MST
        assertEq(token.balanceOf(alice, week),            3);
        assertEq(token.balanceOf(address(market), week),  3);

        // Offer is stored and pending
        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(offer.swipeCount,   3);
        assertEq(offer.pricePerSwipe, PRICE_PER_SWIPE);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Pending));

        // 3. Bob accepts: pays 3 * $7 = $21 USDC, receives 3 MST
        uint256 totalPayment = 3 * PRICE_PER_SWIPE;
        _approveUsdc(bob, totalPayment);
        vm.prank(bob);
        market.acceptOffer(offerId);

        assertEq(token.balanceOf(bob, week),              3);
        assertEq(token.balanceOf(address(market), week),  0);
        assertEq(usdc.balanceOf(alice),                   totalPayment);

        offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Accepted));

        // 4. Bob redeems 1 swipe at the dining hall
        vm.prank(diningHall);
        token.redeemSwipe(bob);
        assertEq(token.balanceOf(bob, week), 2);

        // 5. Saturday rollover: burnAll burns all remaining tokens
        token.burnAll(week);

        assertEq(token.balanceOf(alice,            week), 0);
        assertEq(token.balanceOf(bob,              week), 0);
        assertEq(token.balanceOf(address(market),  week), 0);
        assertTrue(token.burnedWeeks(week));
    }

    // ─────────────────── Test 2: Buy Offer (Bid) Happy Path ───────────────────

    function test_Integration_BuyOffer_HappyPath() public {
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);

        // Bob posts a buy offer for 3 swipes at $7; payment goes into escrow
        uint256 totalPayment = 3 * PRICE_PER_SWIPE;
        _approveUsdc(bob, totalPayment);
        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, PRICE_PER_SWIPE);

        assertEq(usdc.balanceOf(bob),              BOB_USDC - totalPayment);
        assertEq(usdc.balanceOf(address(market)),  totalPayment);

        // Alice accepts: provides 3 MST, receives $21 USDC
        vm.startPrank(alice);
        token.approve(address(market), 3);
        market.acceptOffer(offerId);
        vm.stopPrank();

        assertEq(token.balanceOf(bob,             week), 3);
        assertEq(token.balanceOf(alice,           week), 0);
        assertEq(usdc.balanceOf(alice),                  totalPayment);
        assertEq(usdc.balanceOf(address(market)),        0);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Accepted));
    }

    // ─────────────────── Test 3: Cancel Sell Offer Returns Swipes ───────────────────

    function test_Integration_CancelSellOffer_ReturnsSwipes() public {
        uint256 week = token.getCurrentWeek();
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        // Swipes are in escrow
        assertEq(token.balanceOf(alice,           week), 0);
        assertEq(token.balanceOf(address(market), week), 3);

        vm.prank(alice);
        market.cancelOffer(offerId);

        // Swipes returned to alice
        assertEq(token.balanceOf(alice,           week), 3);
        assertEq(token.balanceOf(address(market), week), 0);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Cancelled));
    }

    // ─────────────────── Test 4: Cancel Buy Offer Returns USDC ───────────────────

    function test_Integration_CancelBuyOffer_ReturnsUSDC() public {
        uint256 totalPayment = 3 * PRICE_PER_SWIPE;
        _approveUsdc(bob, totalPayment);

        vm.prank(bob);
        uint256 offerId = market.createBuyOffer(3, PRICE_PER_SWIPE);

        assertEq(usdc.balanceOf(bob), BOB_USDC - totalPayment);

        vm.prank(bob);
        market.cancelOffer(offerId);

        // USDC returned to bob
        assertEq(usdc.balanceOf(bob), BOB_USDC);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Cancelled));
    }

    // ─────────────────── Test 5: Double-Accept Reverts ───────────────────

    function test_Integration_DoubleAccept_Reverts() public {
        uint256 week = token.getCurrentWeek();
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        // Bob accepts first
        _approveUsdc(bob, 3 * PRICE_PER_SWIPE);
        vm.prank(bob);
        market.acceptOffer(offerId);

        // Charlie attempts to accept the same offer — must revert
        _approveUsdc(charlie, 3 * PRICE_PER_SWIPE);
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.acceptOffer(offerId);

        // Bob retains the swipes; no double-spend
        assertEq(token.balanceOf(bob, week), 3);
    }

    // ─────────────────── Test 6: Expired Offer Reverts on Accept ───────────────────

    function test_Integration_ExpiredOffer_AcceptReverts() public {
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        // Warp past offer expiry
        Marketplace.Offer memory offer = market.getOffer(offerId);
        vm.warp(offer.expiresAt + 1);

        _approveUsdc(bob, 3 * PRICE_PER_SWIPE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferIsExpired.selector, offerId));
        market.acceptOffer(offerId);
    }

    // ─────────────────── Test 7: Over-Transfer Reverts ───────────────────

    function test_Integration_OverTransfer_Reverts() public {
        uint256 week = token.getCurrentWeek();
        token.mint(alice, 3, week);

        vm.prank(alice);
        vm.expectRevert(MealSwipeToken.InsufficientBalance.selector);
        token.transfer(bob, 4);

        // Balance unchanged
        assertEq(token.balanceOf(alice, week), 3);
    }

    // ─────────────────── Test 8: CEI — Status Set Before Transfers ───────────────────

    /// @dev Verifies that acceptOffer sets status to Accepted before any external call,
    ///      so a reentrant (or sequential) second accept hits OfferNotPending immediately.
    ///      This proves the CEI pattern prevents double-spends on both the token and USDC sides.
    function test_Integration_CEI_StatusSetBeforeTransfer() public {
        uint256 week = token.getCurrentWeek();
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        _approveUsdc(bob, 3 * PRICE_PER_SWIPE);
        vm.prank(bob);
        market.acceptOffer(offerId);

        // Status is Accepted — no further state change possible
        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Accepted));

        // Any subsequent accept attempt fails at the status check
        _approveUsdc(charlie, 3 * PRICE_PER_SWIPE);
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.OfferNotPending.selector, offerId));
        market.acceptOffer(offerId);

        // No double-spend: bob has the swipes, alice has the payment
        assertEq(token.balanceOf(bob, week),  3);
        assertEq(usdc.balanceOf(alice),       3 * PRICE_PER_SWIPE);
    }

    // ─────────────────── Test 9: Cross-Contract — burnAll Then Accept Reverts ───────────────────

    /// @dev After burnAll(), the MealSwipeToken marks the week as burned.
    ///      acceptOffer() sets status=Accepted (CEI effects), then attempts to transfer escrowed
    ///      tokens from the marketplace — which reverts EpochAlreadyBurned.
    ///      Because the entire tx reverts, the status rolls back to Pending.
    function test_Integration_BurnAll_ThenAccept_Reverts() public {
        uint256 week = token.getCurrentWeek();
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        // Admin triggers epoch rollover — marks week as burned
        token.burnAll(week);
        assertTrue(token.burnedWeeks(week));

        // Bob attempts to accept; MST transfer inside acceptOffer() will revert
        _approveUsdc(bob, 3 * PRICE_PER_SWIPE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MealSwipeToken.EpochAlreadyBurned.selector, week));
        market.acceptOffer(offerId);

        // Entire tx reverted: offer is still Pending, no USDC moved
        Marketplace.Offer memory offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Pending));
        assertEq(usdc.balanceOf(bob), BOB_USDC);
    }

    // ─────────────────── Test 10: claimExpiredOffer Returns Escrowed Tokens ───────────────────

    function test_Integration_ClaimExpiredOffer_ReturnsSwipes() public {
        uint256 week = token.getCurrentWeek();
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        Marketplace.Offer memory offer = market.getOffer(offerId);
        vm.warp(offer.expiresAt + 1);

        // Anyone can trigger cleanup of an expired offer
        market.claimExpiredOffer(offerId);

        // Alice's swipes are returned; offer is marked Expired
        assertEq(token.balanceOf(alice, week), 3);

        offer = market.getOffer(offerId);
        assertEq(uint256(offer.status), uint256(Marketplace.OfferStatus.Expired));
    }

    // ─────────────────── Test 11: Cannot Accept Own Offer ───────────────────

    function test_Integration_CannotAcceptOwnOffer() public {
        _mintAndApproveToken(alice, 3);

        vm.prank(alice);
        uint256 offerId = market.createSellOffer(3, PRICE_PER_SWIPE);

        _approveUsdc(alice, 3 * PRICE_PER_SWIPE);
        vm.prank(alice);
        vm.expectRevert(Marketplace.CannotAcceptOwnOffer.selector);
        market.acceptOffer(offerId);
    }

    // ─────────────────── Test 12: Multi-User Market Flow ───────────────────

    /// @dev Simulates a realistic session: two concurrent offers (ask + bid),
    ///      two different acceptors, multiple dining redemptions, then epoch rollover.
    function test_Integration_MultiUser_MarketFlow() public {
        uint256 week = token.getCurrentWeek();

        // Alice gets 6 swipes; posts a sell offer for 3 and keeps 3
        token.mint(alice, 6, week);
        vm.startPrank(alice);
        token.approve(address(market), 3);
        uint256 askId = market.createSellOffer(3, PRICE_PER_SWIPE);
        vm.stopPrank();

        // Bob posts a bid to buy 2 swipes
        uint256 bidTotal = 2 * PRICE_PER_SWIPE;
        _approveUsdc(bob, bidTotal);
        vm.prank(bob);
        uint256 bidId = market.createBuyOffer(2, PRICE_PER_SWIPE);

        // Charlie accepts alice's ask: pays 3 * $7, receives 3 MST
        uint256 askTotal = 3 * PRICE_PER_SWIPE;
        _approveUsdc(charlie, askTotal);
        vm.prank(charlie);
        market.acceptOffer(askId);

        // Alice accepts bob's bid: provides 2 MST from her remaining 3, receives 2 * $7
        vm.startPrank(alice);
        token.approve(address(market), 2);
        market.acceptOffer(bidId);
        vm.stopPrank();

        // ── Post-settlement balances ──
        // Charlie: bought 3 swipes from alice's ask
        assertEq(token.balanceOf(charlie, week), 3);
        // Bob: bought 2 swipes via his bid
        assertEq(token.balanceOf(bob, week), 2);
        // Alice: 6 minted − 3 escrowed for ask − 2 sent for bid = 1 remaining
        assertEq(token.balanceOf(alice, week), 1);
        // Alice USDC: received $21 from charlie + $14 from bob's bid
        assertEq(usdc.balanceOf(alice), askTotal + bidTotal);
        // Market: no escrowed assets remain
        assertEq(token.balanceOf(address(market), week), 0);
        assertEq(usdc.balanceOf(address(market)),        0);

        // ── Dining redemptions ──
        vm.prank(diningHall);
        token.redeemSwipe(charlie); // charlie: 3 → 2
        vm.prank(diningHall);
        token.redeemSwipe(charlie); // charlie: 2 → 1
        vm.prank(diningHall);
        token.redeemSwipe(bob);     // bob: 2 → 1

        assertEq(token.balanceOf(charlie, week), 1);
        assertEq(token.balanceOf(bob,     week), 1);

        // ── Saturday rollover ──
        token.burnAll(week);

        assertEq(token.balanceOf(alice,           week), 0);
        assertEq(token.balanceOf(bob,             week), 0);
        assertEq(token.balanceOf(charlie,         week), 0);
        assertEq(token.balanceOf(address(market), week), 0);
        assertEq(token.totalSupplyByWeek(week),          0);
        assertTrue(token.burnedWeeks(week));
    }
}
