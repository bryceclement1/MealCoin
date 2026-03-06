export const MARKETPLACE_ABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_mealSwipeToken", "type": "address", "internalType": "address" },
      { "name": "_paymentToken", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_PRICE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SWIPES",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOffer",
    "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelOffer",
    "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimExpiredOffer",
    "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createBuyOffer",
    "inputs": [
      { "name": "swipeCount", "type": "uint256", "internalType": "uint256" },
      { "name": "pricePerSwipe", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createSellOffer",
    "inputs": [
      { "name": "swipeCount", "type": "uint256", "internalType": "uint256" },
      { "name": "pricePerSwipe", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getOffer",
    "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Marketplace.Offer",
        "components": [
          { "name": "offerId", "type": "uint256", "internalType": "uint256" },
          { "name": "offerType", "type": "uint8", "internalType": "enum Marketplace.OfferType" },
          { "name": "creator", "type": "address", "internalType": "address" },
          { "name": "swipeCount", "type": "uint256", "internalType": "uint256" },
          { "name": "pricePerSwipe", "type": "uint256", "internalType": "uint256" },
          { "name": "expiresAt", "type": "uint256", "internalType": "uint256" },
          { "name": "status", "type": "uint8", "internalType": "enum Marketplace.OfferStatus" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mealSwipeToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IMealSwipeToken" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "offerCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "offers",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      { "name": "offerId", "type": "uint256", "internalType": "uint256" },
      { "name": "offerType", "type": "uint8", "internalType": "enum Marketplace.OfferType" },
      { "name": "creator", "type": "address", "internalType": "address" },
      { "name": "swipeCount", "type": "uint256", "internalType": "uint256" },
      { "name": "pricePerSwipe", "type": "uint256", "internalType": "uint256" },
      { "name": "expiresAt", "type": "uint256", "internalType": "uint256" },
      { "name": "status", "type": "uint8", "internalType": "enum Marketplace.OfferStatus" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paymentToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "OfferAccepted",
    "inputs": [
      { "name": "offerId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "acceptor", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferCancelled",
    "inputs": [
      { "name": "offerId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferCreated",
    "inputs": [
      { "name": "offerId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "offerType", "type": "uint8", "indexed": false, "internalType": "enum Marketplace.OfferType" },
      { "name": "swipeCount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "pricePerSwipe", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "expiresAt", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferExpired",
    "inputs": [
      { "name": "offerId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  { "type": "error", "name": "CannotAcceptOwnOffer", "inputs": [] },
  { "type": "error", "name": "InsufficientTokenAllowance", "inputs": [] },
  { "type": "error", "name": "InvalidPrice", "inputs": [] },
  { "type": "error", "name": "InvalidSwipeCount", "inputs": [] },
  { "type": "error", "name": "NotOfferCreator", "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }] },
  { "type": "error", "name": "NotOwner", "inputs": [] },
  { "type": "error", "name": "OfferAlreadyExpired", "inputs": [] },
  { "type": "error", "name": "OfferIsExpired", "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }] },
  { "type": "error", "name": "OfferNotFound", "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }] },
  { "type": "error", "name": "OfferNotPending", "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }] },
  { "type": "error", "name": "OfferNotYetExpired", "inputs": [{ "name": "offerId", "type": "uint256", "internalType": "uint256" }] },
  { "type": "error", "name": "PriceExceedsMax", "inputs": [] }
] as const
