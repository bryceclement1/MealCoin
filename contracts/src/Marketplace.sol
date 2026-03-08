// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMealSwipeToken} from "./IMealSwipeToken.sol";

/// @title Marketplace
/// @notice Escrow contract for peer-to-peer buying and selling of meal swipes.
/// @dev Assets (tokens or USDC) are locked in this contract when an offer is created,
///      and released atomically when accepted, or returned on cancellation.
contract Marketplace {
    // ============ Enums ============

    /// @notice Whether the offer is a sell (Ask) or buy (Bid)
    enum OfferType {
        Ask, // Seller posting swipes for sale
        Bid  // Buyer requesting to purchase swipes
    }

    /// @notice Lifecycle state of an offer
    enum OfferStatus {
        Pending,   // Active, can be accepted
        Accepted,  // Completed — swap executed
        Cancelled, // Cancelled by creator — assets returned
        Expired    // Past expiresAt — no longer executable
    }

    // ============ Structs ============

    struct Offer {
        uint256 offerId;
        OfferType offerType;     // Ask (sell) or Bid (buy)
        address creator;         // Student who posted the offer
        uint256 swipeCount;      // Number of swipes in the offer (1–6)
        uint256 pricePerSwipe;   // Price in MockUSDC per swipe (max 12 * 1e6)
        uint256 expiresAt;       // Unix timestamp — next Saturday 11:59pm
        OfferStatus status;      // Current state of the offer
    }

    // ============ State Variables ============

    /// @notice Deployer address. Admin for emergency functions.
    address public owner;

    /// @notice Reference to the MealSwipeToken contract
    IMealSwipeToken public mealSwipeToken;

    /// @notice Reference to the MockUSDC payment token
    IERC20 public paymentToken;

    /// @notice Maps offerId → Offer struct
    mapping(uint256 => Offer) public offers;

    /// @notice Auto-incrementing counter used to generate offer IDs
    uint256 public offerCount;

    /// @notice Maximum price per swipe in MockUSDC (6 decimals) — $12.00
    uint256 public constant MAX_PRICE = 12 * 1e6;

    /// @notice Maximum swipes per offer
    uint256 public constant MAX_SWIPES = 6;

    // ============ Events ============

    /// @notice Emitted when a new offer is posted
    event OfferCreated(
        uint256 indexed offerId,
        address indexed creator,
        OfferType offerType,
        uint256 swipeCount,
        uint256 pricePerSwipe,
        uint256 expiresAt
    );

    /// @notice Emitted when an offer is successfully accepted
    event OfferAccepted(uint256 indexed offerId, address indexed acceptor);

    /// @notice Emitted when an offer is cancelled by its creator
    event OfferCancelled(uint256 indexed offerId, address indexed creator);

    /// @notice Emitted when an attempt to accept an expired offer is made
    event OfferExpired(uint256 indexed offerId);

    // ============ Errors ============

    /// @notice Caller is not owner
    error NotOwner();

    /// @notice offerId does not exist in the offers mapping
    error OfferNotFound(uint256 offerId);

    /// @notice Offer status is not Pending
    error OfferNotPending(uint256 offerId);

    /// @notice block.timestamp >= offer.expiresAt
    error OfferIsExpired(uint256 offerId);

    /// @notice Caller is not the offer's creator (for cancel)
    error NotOfferCreator(uint256 offerId);

    /// @notice swipeCount is 0 or > MAX_SWIPES
    error InvalidSwipeCount();

    /// @notice pricePerSwipe > MAX_PRICE
    error PriceExceedsMax();

    /// @notice pricePerSwipe is 0
    error InvalidPrice();

    /// @notice Token allowance for this contract is insufficient before escrow
    error InsufficientTokenAllowance();

    /// @notice A student attempts to accept their own offer
    error CannotAcceptOwnOffer();

    /// @notice claimExpiredOffer called on an offer that hasn't expired yet
    error OfferNotYetExpired(uint256 offerId);

    /// @notice createSellOffer/createBuyOffer called when computed expiresAt is already in the past
    /// @dev Happens between 23:55:00 and midnight on Saturday — the 5-minute burnAll buffer window
    error OfferAlreadyExpired();

    // ============ Constructor ============

    /// @notice Deploys the Marketplace contract
    /// @param _mealSwipeToken Address of the MealSwipeToken contract
    /// @param _paymentToken Address of the MockUSDC payment token contract
    constructor(address _mealSwipeToken, address _paymentToken) {
        owner = msg.sender;
        mealSwipeToken = IMealSwipeToken(_mealSwipeToken);
        paymentToken = IERC20(_paymentToken);
        offerCount = 0;
    }

    // ============ Offer Functions ============

    /// @notice Lists meal swipes for sale, transferring them into escrow immediately
    /// @param swipeCount Number of swipes to sell (1–6)
    /// @param pricePerSwipe Price in MockUSDC per swipe (max $12.00 = 12_000_000)
    /// @return offerId The ID of the newly created offer
    function createSellOffer(uint256 swipeCount, uint256 pricePerSwipe) external returns (uint256) {
        if (swipeCount == 0 || swipeCount > MAX_SWIPES) revert InvalidSwipeCount();
        if (pricePerSwipe == 0) revert InvalidPrice();
        if (pricePerSwipe > MAX_PRICE) revert PriceExceedsMax();
        if (mealSwipeToken.allowance(msg.sender, address(this)) < swipeCount) revert InsufficientTokenAllowance();

        mealSwipeToken.transferFrom(msg.sender, address(this), swipeCount);

        uint256 expiresAt = _getNextSaturdayMidnight();
        if (expiresAt <= block.timestamp) revert OfferAlreadyExpired();

        uint256 offerId = ++offerCount;

        offers[offerId] = Offer({
            offerId: offerId,
            offerType: OfferType.Ask,
            creator: msg.sender,
            swipeCount: swipeCount,
            pricePerSwipe: pricePerSwipe,
            expiresAt: expiresAt,
            status: OfferStatus.Pending
        });

        emit OfferCreated(offerId, msg.sender, OfferType.Ask, swipeCount, pricePerSwipe, expiresAt);
        return offerId;
    }

    /// @notice Posts a bid to buy meal swipes, transferring payment into escrow immediately
    /// @param swipeCount Number of swipes to buy (1–6)
    /// @param pricePerSwipe Price in MockUSDC per swipe (max $12.00 = 12_000_000)
    /// @return offerId The ID of the newly created offer
    function createBuyOffer(uint256 swipeCount, uint256 pricePerSwipe) external returns (uint256) {
        if (swipeCount == 0 || swipeCount > MAX_SWIPES) revert InvalidSwipeCount();
        if (pricePerSwipe == 0) revert InvalidPrice();
        if (pricePerSwipe > MAX_PRICE) revert PriceExceedsMax();

        uint256 totalPayment = swipeCount * pricePerSwipe;
        if (paymentToken.allowance(msg.sender, address(this)) < totalPayment) revert InsufficientTokenAllowance();

        paymentToken.transferFrom(msg.sender, address(this), totalPayment);

        uint256 expiresAt = _getNextSaturdayMidnight();
        if (expiresAt <= block.timestamp) revert OfferAlreadyExpired();

        uint256 offerId = ++offerCount;

        offers[offerId] = Offer({
            offerId: offerId,
            offerType: OfferType.Bid,
            creator: msg.sender,
            swipeCount: swipeCount,
            pricePerSwipe: pricePerSwipe,
            expiresAt: expiresAt,
            status: OfferStatus.Pending
        });

        emit OfferCreated(offerId, msg.sender, OfferType.Bid, swipeCount, pricePerSwipe, expiresAt);
        return offerId;
    }

    /// @notice Accepts a pending offer and executes the swap atomically
    /// @dev Follows CEI: status is set to Accepted before any external token transfers.
    ///      Ask: buyer pays seller directly, market releases escrowed tokens to buyer.
    ///      Bid: seller provides tokens to buyer, market releases escrowed payment to seller.
    /// @param offerId The ID of the offer to accept
    function acceptOffer(uint256 offerId) external {
        if (offerId == 0 || offerId > offerCount) revert OfferNotFound(offerId);

        Offer storage offer = offers[offerId];

        if (offer.status != OfferStatus.Pending) revert OfferNotPending(offerId);
        if (block.timestamp >= offer.expiresAt) revert OfferIsExpired(offerId);
        if (msg.sender == offer.creator) revert CannotAcceptOwnOffer();

        // Effects before interactions (CEI)
        offer.status = OfferStatus.Accepted;

        if (offer.offerType == OfferType.Ask) {
            uint256 totalPayment = offer.swipeCount * offer.pricePerSwipe;
            if (paymentToken.allowance(msg.sender, address(this)) < totalPayment) revert InsufficientTokenAllowance();

            paymentToken.transferFrom(msg.sender, offer.creator, totalPayment); // seller gets paid
            mealSwipeToken.transfer(msg.sender, offer.swipeCount);              // buyer gets swipes
        } else {
            if (mealSwipeToken.allowance(msg.sender, address(this)) < offer.swipeCount) revert InsufficientTokenAllowance();

            mealSwipeToken.transferFrom(msg.sender, offer.creator, offer.swipeCount); // buyer gets swipes
            uint256 totalPayment = offer.swipeCount * offer.pricePerSwipe;
            paymentToken.transfer(msg.sender, totalPayment);                          // seller gets paid
        }

        emit OfferAccepted(offerId, msg.sender);
    }

    /// @notice Cancels a pending offer and returns escrowed assets to the creator
    /// @dev Follows checks-effects-interactions: status is set before any external transfer
    /// @param offerId The ID of the offer to cancel
    function cancelOffer(uint256 offerId) external {
        if (offerId == 0 || offerId > offerCount) revert OfferNotFound(offerId);

        Offer storage offer = offers[offerId];

        if (offer.status != OfferStatus.Pending) revert OfferNotPending(offerId);
        if (msg.sender != offer.creator) revert NotOfferCreator(offerId);

        // Effects before interactions (CEI)
        offer.status = OfferStatus.Cancelled;

        if (offer.offerType == OfferType.Ask) {
            mealSwipeToken.transfer(offer.creator, offer.swipeCount);
        } else {
            uint256 totalPayment = offer.swipeCount * offer.pricePerSwipe;
            paymentToken.transfer(offer.creator, totalPayment);
        }

        emit OfferCancelled(offerId, msg.sender);
    }

    /// @notice Returns escrowed assets to the creator of an expired offer. Callable by anyone.
    /// @dev Allows an admin keeper (or any caller) to automatically process expired offers
    ///      before burnAll fires, so creators recover their tokens without being online.
    ///      Sets status to Expired (distinct from Cancelled) and emits OfferExpired.
    ///      Follows CEI: status is updated before any external transfer.
    /// @param offerId The ID of the expired offer to process
    function claimExpiredOffer(uint256 offerId) external {
        if (offerId == 0 || offerId > offerCount) revert OfferNotFound(offerId);

        Offer storage offer = offers[offerId];

        if (offer.status != OfferStatus.Pending) revert OfferNotPending(offerId);
        if (block.timestamp < offer.expiresAt) revert OfferNotYetExpired(offerId);

        // Effects before interactions (CEI)
        offer.status = OfferStatus.Expired;

        if (offer.offerType == OfferType.Ask) {
            mealSwipeToken.transfer(offer.creator, offer.swipeCount);
        } else {
            uint256 totalPayment = offer.swipeCount * offer.pricePerSwipe;
            paymentToken.transfer(offer.creator, totalPayment);
        }

        emit OfferExpired(offerId);
    }

    /// @notice Returns the full Offer struct for a given offerId
    /// @param offerId The ID of the offer to retrieve
    /// @return The Offer struct
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        if (offerId == 0 || offerId > offerCount) revert OfferNotFound(offerId);
        return offers[offerId];
    }

    // ============ Internal Helpers ============

    /// @notice Computes the Unix timestamp of the upcoming Saturday at 23:59:59
    /// @dev Unix epoch started on a Thursday, so (days + 4) % 7 gives 0=Sun … 6=Sat.
    ///      If called on Saturday, returns tonight's 23:59:59 (daysUntilSaturday = 0).
    /// @return The Unix timestamp of the next Saturday at 23:59:59
    function _getNextSaturdayMidnight() internal view returns (uint256) {
        uint256 estTimestamp = block.timestamp - 18000; // EST = UTC - 5 h
        uint256 dayOfWeek = (estTimestamp / 1 days + 4) % 7;
        uint256 daysUntilSaturday = (6 - dayOfWeek) % 7;
        uint256 startOfSaturday = (estTimestamp / 1 days + daysUntilSaturday) * 1 days;
        return startOfSaturday + 104100; // 04:55:00 UTC Sunday = 11:55 PM EST Saturday
    }
}
