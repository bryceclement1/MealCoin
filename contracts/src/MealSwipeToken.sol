// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MealSwipeToken
/// @notice A modified ERC-20 token where balances are scoped to weekly epochs.
/// @dev Meal swipes expire at the end of each week via burnAll(). Balances are tracked per (address, weekEpoch) pair.
contract MealSwipeToken {
    // ============ State Variables ============

    /// @notice Deployer address. Has exclusive rights to mint and manage approved dining addresses.
    address public owner;

    /// @notice The current week epoch, computed from block.timestamp / 7 days.
    uint256 public currentWeek;

    /// @notice Maps (walletAddress, weekEpoch) → token balance. Core balance store.
    mapping(address => mapping(uint256 => uint256)) private balances;

    /// @notice Maps (owner, spender) → approved token allowance. Used by transferFrom.
    mapping(address => mapping(address => uint256)) private allowances;

    /// @notice Addresses approved to call redeemSwipe(). Represents dining hall terminals.
    mapping(address => bool) public approvedDining;

    /// @notice Total tokens minted for each week epoch. Used for accounting and burn verification.
    mapping(uint256 => uint256) public totalSupplyByWeek;

    /// @notice Tracks which weeks have been burned. When true, balanceOf returns 0 for that week.
    mapping(uint256 => bool) public burnedWeeks;

    /// @notice Token name: "MealSwipeToken"
    string public name;

    /// @notice Token symbol: "MST"
    string public symbol;

    /// @notice Decimals: 0 — meal swipes are whole units, no fractional swipes
    uint8 public decimals;

    // ============ Events ============

    /// @notice Emitted on any token transfer between addresses
    event Transfer(address indexed from, address indexed to, uint256 amount, uint256 week);

    /// @notice Emitted when tokens are minted to a student's wallet
    event Mint(address indexed to, uint256 amount, uint256 week);

    /// @notice Emitted when one swipe is burned at a dining location
    event SwipeRedeemed(address indexed wallet, uint256 week);

    /// @notice Emitted when all tokens for a week epoch are burned at rollover
    event SwipesBurned(uint256 week, uint256 totalBurned);

    /// @notice Emitted when a spender is approved to transfer tokens on behalf of an owner
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /// @notice Emitted when a new dining address is approved
    event DiningApproved(address indexed diningAddress);

    /// @notice Emitted when a dining address approval is revoked
    event DiningRevoked(address indexed diningAddress);

    // ============ Errors ============

    /// @notice Thrown when caller is not the owner
    error NotOwner();

    /// @notice Thrown when caller is not an approved dining address
    error NotApprovedDining();

    /// @notice Thrown when transfer or redeem would exceed the sender's balance
    error InsufficientBalance();

    /// @notice Thrown when amount is 0 or exceeds 6
    error InvalidAmount();

    /// @notice Thrown when a zero address is passed where a real address is required
    error ZeroAddress();

    /// @notice Thrown when transferFrom caller has insufficient allowance
    error InsufficientAllowance();

    /// @notice Thrown when burnAll() is called for a week that has already been burned
    error EpochAlreadyBurned(uint256 week);

    // ============ Constructor ============

    /// @notice Deploys the MealSwipeToken contract
    /// @dev Sets the owner to msg.sender, initializes token metadata. No tokens are minted on deployment.
    constructor() {
        owner = msg.sender;
        name = "MealSwipeToken";
        symbol = "MST";
        decimals = 0;
        currentWeek = block.timestamp / 7 days;
    }

    // ============ Admin Functions ============

    /// @notice Mints tokens to an address for a given week epoch
    /// @dev Called by the admin at the start of each week to load students with their weekly swipes
    /// @param to The address to mint tokens to
    /// @param amount The number of tokens to mint (1-6)
    /// @param week The week epoch to mint for
    function mint(address to, uint256 amount, uint256 week) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > 6) revert InvalidAmount();

        balances[to][week] += amount;
        totalSupplyByWeek[week] += amount;

        emit Mint(to, amount, week);
    }

    /// @notice Burns all tokens for a given week epoch by marking it burned
    /// @dev Uses burnedWeeks mapping so balanceOf returns 0 for that week without iterating addresses
    /// @param week The week epoch to burn
    function burnAll(uint256 week) external {
        if (msg.sender != owner) revert NotOwner();
        if (burnedWeeks[week]) revert EpochAlreadyBurned(week);

        burnedWeeks[week] = true;

        uint256 total = totalSupplyByWeek[week];
        totalSupplyByWeek[week] = 0;

        emit SwipesBurned(week, total);
    }

    /// @notice Approves an address as an authorized dining terminal
    /// @param diningAddress The address to approve
    function approveDining(address diningAddress) external {
        if (msg.sender != owner) revert NotOwner();
        if (diningAddress == address(0)) revert ZeroAddress();

        approvedDining[diningAddress] = true;

        emit DiningApproved(diningAddress);
    }

    /// @notice Revokes an address's authorization as a dining terminal
    /// @param diningAddress The address to revoke
    function revokeDining(address diningAddress) external {
        if (msg.sender != owner) revert NotOwner();

        approvedDining[diningAddress] = false;

        emit DiningRevoked(diningAddress);
    }

    /// @notice Burns exactly 1 token from wallet for the current week
    /// @dev Called by an approved dining terminal when a student pays for a meal
    /// @param wallet The student's wallet address to burn a swipe from
    function redeemSwipe(address wallet) external {
        if (!approvedDining[msg.sender]) revert NotApprovedDining();
        if (wallet == address(0)) revert ZeroAddress();

        uint256 week = block.timestamp / 7 days;
        if (balances[wallet][week] < 1) revert InsufficientBalance();

        balances[wallet][week] -= 1;
        totalSupplyByWeek[week] -= 1;

        emit SwipeRedeemed(wallet, week);
    }

    // ============ Student Functions ============

    /// @notice Transfers tokens from msg.sender to another address, scoped to the current week
    /// @dev Used for peer-to-peer swipe sending (the "Send Swipe to Friend" feature)
    /// @param to The address to transfer tokens to
    /// @param amount The number of tokens to transfer
    /// @return True on success
    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 week = block.timestamp / 7 days;
        if (balances[msg.sender][week] < amount) revert InsufficientBalance();

        balances[msg.sender][week] -= amount;
        balances[to][week] += amount;

        emit Transfer(msg.sender, to, amount, week);
        return true;
    }

    /// @notice Approves a spender to transfer tokens on behalf of msg.sender
    /// @param spender The address to approve
    /// @param amount The number of tokens the spender may transfer
    /// @return True on success
    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Transfers tokens from one address to another using an allowance
    /// @dev Caller must have been approved by `from` via approve()
    /// @param from The address to transfer tokens from
    /// @param to The address to transfer tokens to
    /// @param amount The number of tokens to transfer
    /// @return True on success
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (allowances[from][msg.sender] < amount) revert InsufficientAllowance();

        uint256 week = block.timestamp / 7 days;
        if (balances[from][week] < amount) revert InsufficientBalance();

        allowances[from][msg.sender] -= amount;
        balances[from][week] -= amount;
        balances[to][week] += amount;

        emit Transfer(from, to, amount, week);
        return true;
    }

    // ============ View Functions ============

    /// @notice Returns the remaining allowance a spender has on behalf of an owner
    /// @param owner_ The address that approved the allowance
    /// @param spender The address approved to spend
    /// @return The remaining allowance
    function allowance(address owner_, address spender) external view returns (uint256) {
        return allowances[owner_][spender];
    }

    /// @notice Returns the current week epoch
    /// @return The current week as block.timestamp / 7 days
    function getCurrentWeek() external view returns (uint256) {
        return block.timestamp / 7 days;
    }

    /// @notice Returns the token balance for a wallet in a given week
    /// @param wallet The address to query the balance of
    /// @param week The week epoch to query
    /// @return The token balance, or 0 if the week has been burned
    function balanceOf(address wallet, uint256 week) external view returns (uint256) {
        if (burnedWeeks[week]) return 0;
        return balances[wallet][week];
    }
}
