// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev The one Uniswap v3 SwapRouter02 call this contract makes. Inlined so
/// the contract verifies as a single file.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function WETH9() external view returns (address);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Kredit checkout
/// @notice Sells Kredit credits for a fixed dollar price, paid in USDG or in
/// ETH. USDG is the unit of account: `usdgPerCredit` base units buy one credit
/// (800 = $0.0008, so 1,000 credits cost $0.80). A USDG payment moves straight
/// from the buyer to the treasury. An ETH payment is swapped for USDG on
/// Uniswap v3 with the treasury as the recipient, inside the same call, and
/// buys whatever whole credits the USDG that came out is worth. Either way the
/// contract writes a `Purchased` event, the receipt anyone can read on
/// Blockscout, and never holds funds: a failed swap or transfer reverts the
/// whole purchase.
///
/// Credits are spent off-chain on AI calls; the server reads `Purchased` from
/// the transaction receipt and writes the credits into its ledger.
contract KreditCheckout {
    // ---------------------------------------------------------------- state

    IERC20 public immutable usdg;
    uint8 public constant USDG_DECIMALS = 6;
    ISwapRouter02 public immutable router;
    address public immutable weth;
    uint24 public immutable poolFee; // the WETH/USDG pool's fee tier

    address public owner;
    address public treasury; // where every payment goes
    uint256 public usdgPerCredit; // USDG base units for one credit
    uint256 public maxCreditsPerBuy; // one purchase never buys more than this
    bool public paused;
    bool private entered;

    mapping(address => uint256) public purchased; // credits bought per wallet
    uint256 public totalPurchased;

    // --------------------------------------------------------------- events

    /// @dev Same shape as KreditSwapBuy's, so one reader serves both. `ethIn`
    /// is zero for a USDG payment; `amount` is the USDG that reached the treasury.
    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);
    event TreasuryChanged(address indexed treasury);
    event PriceChanged(uint256 usdgPerCredit);
    event MaxCreditsPerBuyChanged(uint256 maxCreditsPerBuy);
    event PausedChanged(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error ZeroAddress();
    error ZeroPrice();
    error BadFee();
    error Paused();
    error NothingSent();
    error NothingBought();
    error TooMuch(uint256 credits, uint256 max);
    error Expired();
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

    constructor(
        address owner_,
        address treasury_,
        ISwapRouter02 router_,
        IERC20 usdg_,
        uint24 poolFee_,
        uint256 usdgPerCredit_
    ) {
        if (
            owner_ == address(0) || treasury_ == address(0) || address(router_) == address(0)
                || address(usdg_) == address(0)
        ) revert ZeroAddress();
        if (poolFee_ != 100 && poolFee_ != 500 && poolFee_ != 3000 && poolFee_ != 10000) revert BadFee();
        if (usdgPerCredit_ == 0) revert ZeroPrice();
        owner = owner_;
        treasury = treasury_;
        router = router_;
        weth = router_.WETH9();
        usdg = usdg_;
        poolFee = poolFee_;
        usdgPerCredit = usdgPerCredit_;
        maxCreditsPerBuy = 100_000; // $100 of AI usage
        emit OwnershipTransferred(address(0), owner_);
        emit TreasuryChanged(treasury_);
        emit PriceChanged(usdgPerCredit_);
        emit MaxCreditsPerBuyChanged(maxCreditsPerBuy);
    }

    // ------------------------------------------------------------------ buy

    /// @notice Buys exactly `credits` credits with USDG: `costOf(credits)` moves
    /// from the caller to the treasury. The caller approves that amount first.
    function buyWithUsdg(uint256 credits) external nonReentrant returns (uint256 amount) {
        if (paused) revert Paused();
        if (credits == 0) revert NothingBought();
        if (credits > maxCreditsPerBuy) revert TooMuch(credits, maxCreditsPerBuy);

        amount = costOf(credits);
        if (!usdg.transferFrom(msg.sender, treasury, amount)) revert TransferFailed();

        purchased[msg.sender] += credits;
        totalPurchased += credits;
        emit Purchased(msg.sender, address(usdg), 0, amount, credits);
    }

    /// @notice Swaps the ETH sent for USDG, pays the USDG to the treasury and
    /// records the whole credits it buys. Reverts, refunding the ETH, if that
    /// is fewer than `minCredits` or `deadline` has passed.
    function buyWithEth(uint256 minCredits, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 amount, uint256 credits)
    {
        if (paused) revert Paused();
        if (msg.value == 0) revert NothingSent();
        if (block.timestamp > deadline) revert Expired();

        amount = router.exactInputSingle{value: msg.value}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: address(usdg),
                fee: poolFee,
                recipient: treasury,
                amountIn: msg.value,
                amountOutMinimum: costOf(minCredits),
                sqrtPriceLimitX96: 0
            })
        );
        credits = creditsFor(amount);
        if (credits == 0) revert NothingBought();
        if (credits > maxCreditsPerBuy) revert TooMuch(credits, maxCreditsPerBuy);

        purchased[msg.sender] += credits;
        totalPurchased += credits;
        emit Purchased(msg.sender, address(usdg), msg.value, amount, credits);
    }

    /// @notice Whole credits for `amount` USDG base units, rounded down: a
    /// payment never buys more than it paid for. Mirrors the server's arithmetic.
    function creditsFor(uint256 amount) public view returns (uint256) {
        return amount / usdgPerCredit;
    }

    /// @notice USDG base units that `credits` credits cost.
    function costOf(uint256 credits) public view returns (uint256) {
        return credits * usdgPerCredit;
    }

    // ---------------------------------------------------------------- admin

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @notice Sets the price in USDG base units per credit (800 = $0.0008).
    function setPrice(uint256 usdgPerCredit_) external onlyOwner {
        if (usdgPerCredit_ == 0) revert ZeroPrice();
        usdgPerCredit = usdgPerCredit_;
        emit PriceChanged(usdgPerCredit_);
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
