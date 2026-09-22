// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Kredit token checkout
/// @notice Sells Kredit credits for the Kredit token (KRED). The owner sets
/// the price as `tokensPerCredit` base units of the token for one credit; the
/// token is still on its launch curve with no Uniswap pool, so there is no
/// on-chain dollar price to read and the rate is repriced by hand instead.
/// A purchase moves the tokens straight from the buyer to the treasury and
/// writes a `Purchased` event, the receipt the server reads to add credits.
/// The contract never holds tokens. Credits are counted from what actually
/// reached the treasury, so a token that takes a fee on transfer buys fewer
/// credits rather than more.
///
/// Same event shape as KreditCheckout, so one reader serves both.
contract KreditTokenCheckout {
    // ---------------------------------------------------------------- state

    IERC20 public immutable token;

    address public owner;
    address public treasury; // where every payment goes
    uint256 public tokensPerCredit; // token base units for one credit
    uint256 public maxCreditsPerBuy; // one purchase never buys more than this
    bool public paused;
    bool private entered;

    mapping(address => uint256) public purchased; // credits bought per wallet
    uint256 public totalPurchased;

    // --------------------------------------------------------------- events

    /// @dev `ethIn` is always zero here; `amount` is the tokens that reached the treasury.
    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);
    event TreasuryChanged(address indexed treasury);
    event PriceChanged(uint256 tokensPerCredit);
    event MaxCreditsPerBuyChanged(uint256 maxCreditsPerBuy);
    event PausedChanged(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error ZeroAddress();
    error ZeroPrice();
    error Paused();
    error NothingBought();
    error TooMuch(uint256 credits, uint256 max);
    error Reentered();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (entered) revert Reentered();
        entered = true;
        _;
        entered = false;
    }

    constructor(address owner_, address treasury_, IERC20 token_, uint256 tokensPerCredit_) {
        if (owner_ == address(0) || treasury_ == address(0) || address(token_) == address(0)) revert ZeroAddress();
        if (tokensPerCredit_ == 0) revert ZeroPrice();
        owner = owner_;
        treasury = treasury_;
        token = token_;
        tokensPerCredit = tokensPerCredit_;
        maxCreditsPerBuy = 100_000; // $100 of AI usage
        emit OwnershipTransferred(address(0), owner_);
        emit TreasuryChanged(treasury_);
        emit PriceChanged(tokensPerCredit_);
        emit MaxCreditsPerBuyChanged(maxCreditsPerBuy);
    }

    // ------------------------------------------------------------------ buy

    /// @notice Buys `credits` credits: `costOf(credits)` tokens move from the
    /// caller to the treasury. The caller approves that amount first. Records
    /// the whole credits the tokens that arrived are worth, which is `credits`
    /// unless the token takes a fee on transfer.
    function buyWithToken(uint256 credits) external nonReentrant returns (uint256 amount, uint256 bought) {
        if (paused) revert Paused();
        if (credits == 0) revert NothingBought();
        if (credits > maxCreditsPerBuy) revert TooMuch(credits, maxCreditsPerBuy);

        uint256 before = token.balanceOf(treasury);
        _transferFrom(msg.sender, treasury, costOf(credits));
        amount = token.balanceOf(treasury) - before;
        bought = creditsFor(amount);
        if (bought == 0) revert NothingBought();

        purchased[msg.sender] += bought;
        totalPurchased += bought;
        emit Purchased(msg.sender, address(token), 0, amount, bought);
    }

    /// @notice Whole credits for `amount` token base units, rounded down: a
    /// payment never buys more than it paid for. Mirrors the server's arithmetic.
    function creditsFor(uint256 amount) public view returns (uint256) {
        return amount / tokensPerCredit;
    }

    /// @notice Token base units that `credits` credits cost.
    function costOf(uint256 credits) public view returns (uint256) {
        return credits * tokensPerCredit;
    }

    /// @dev transferFrom that accepts tokens returning nothing as well as
    /// `true`, and passes the token's own revert reason through.
    function _transferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!ok) {
            if (data.length == 0) revert TransferFailed();
            assembly {
                revert(add(data, 32), mload(data))
            }
        }
        if (data.length != 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }

    // ---------------------------------------------------------------- admin

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @notice Sets the price in token base units per credit.
    function setPrice(uint256 tokensPerCredit_) external onlyOwner {
        if (tokensPerCredit_ == 0) revert ZeroPrice();
        tokensPerCredit = tokensPerCredit_;
        emit PriceChanged(tokensPerCredit_);
    }

    function setMaxCreditsPerBuy(uint256 maxCreditsPerBuy_) external onlyOwner {
        maxCreditsPerBuy = maxCreditsPerBuy_;
        emit MaxCreditsPerBuyChanged(maxCreditsPerBuy_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedChanged(paused_);
    }

    function transferOwnership(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, owner_);
        owner = owner_;
    }
}
