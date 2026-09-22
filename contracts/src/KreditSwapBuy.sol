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

/// @title Kredit swap-and-buy
/// @notice Buys Kredit credits with ETH. The ETH is swapped for the project
/// token on Uniswap v3 and the tokens land in the treasury inside the same
/// call; the credits bought are written here as a `Purchased` event, which is
/// the receipt anyone can read on Blockscout. The contract never holds funds:
/// a failed swap reverts the whole purchase and the ETH stays with the buyer.
///
/// Credits are spent off-chain on AI calls; the server reads `Purchased` from
/// the transaction receipt and writes the credits into its ledger.
contract KreditSwapBuy {
    uint256 private constant PRICE_SCALE = 1e6; // creditsPerToken is stored times this

    // ---------------------------------------------------------------- state

    ISwapRouter02 public immutable router;
    address public immutable weth;

    address public owner;
    address public treasury; // where the swapped tokens go
    address public token; // the ERC-20 that buys credits, or zero while buying is off
    uint8 public tokenDecimals;
    uint24 public poolFee; // the WETH/token pool's fee tier (500, 3000 or 10000)
    uint256 public creditsPerToken; // credits for one whole token, times PRICE_SCALE
    uint256 public maxCreditsPerBuy; // one purchase never buys more than this
    bool public paused;
    bool private entered;

    mapping(address => uint256) public purchased; // credits bought per wallet
    uint256 public totalPurchased;

    // --------------------------------------------------------------- events

    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);
    event TreasuryChanged(address indexed treasury);
    event TokenChanged(address indexed token, uint8 decimals, uint24 poolFee, uint256 creditsPerToken);
    event MaxCreditsPerBuyChanged(uint256 maxCreditsPerBuy);
    event PausedChanged(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error ZeroAddress();
    error Paused();
    error BuyingOff();
    error NothingSent();
    error NothingBought();
    error TooMuch(uint256 credits, uint256 max);
    error Expired();
    error Reentered();
    error BadFee();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address treasury_, ISwapRouter02 router_) {
        if (owner_ == address(0) || treasury_ == address(0) || address(router_) == address(0)) revert ZeroAddress();
        owner = owner_;
        treasury = treasury_;
        router = router_;
        weth = router_.WETH9();
        maxCreditsPerBuy = 100_000; // $100 of AI usage
        emit OwnershipTransferred(address(0), owner_);
        emit TreasuryChanged(treasury_);
        emit MaxCreditsPerBuyChanged(maxCreditsPerBuy);
    }

    // ------------------------------------------------------------------ buy

    /// @notice Swaps the ETH sent for the project token, pays the tokens to the
    /// treasury and records the credits they buy. Reverts, refunding the ETH,
    /// if fewer than `minTokens` come out of the pool or `deadline` has passed.
    function buyWithEth(uint256 minTokens, uint256 deadline)
        external
        payable
        returns (uint256 amount, uint256 credits)
    {
        if (entered) revert Reentered();
        entered = true;
        if (paused) revert Paused();
        if (token == address(0)) revert BuyingOff();
        if (msg.value == 0) revert NothingSent();
        if (block.timestamp > deadline) revert Expired();

        amount = router.exactInputSingle{value: msg.value}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: token,
                fee: poolFee,
                recipient: treasury,
                amountIn: msg.value,
                amountOutMinimum: minTokens,
                sqrtPriceLimitX96: 0
            })
        );
        credits = creditsFor(amount);
        if (credits == 0) revert NothingBought();
        if (credits > maxCreditsPerBuy) revert TooMuch(credits, maxCreditsPerBuy);

        purchased[msg.sender] += credits;
        totalPurchased += credits;
        emit Purchased(msg.sender, token, msg.value, amount, credits);
        entered = false;
    }

    /// @notice Whole credits for `amount` base units, rounded down: a payment
    /// never buys more than it paid for. Mirrors the server's arithmetic.
    function creditsFor(uint256 amount) public view returns (uint256) {
        return (amount * creditsPerToken) / (10 ** uint256(tokenDecimals) * PRICE_SCALE);
    }

    // ---------------------------------------------------------------- admin

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @notice Sets the token that buys credits, the WETH/token pool fee tier and
    /// the price: credits per whole token times 1e6 (0.01 credits per token, i.e.
    /// 100 tokens per credit, = 10_000). A zero token switches buying off.
    function setToken(address token_, uint8 decimals_, uint24 poolFee_, uint256 creditsPerToken_) external onlyOwner {
        if (token_ != address(0) && poolFee_ != 100 && poolFee_ != 500 && poolFee_ != 3000 && poolFee_ != 10000) {
            revert BadFee();
        }
        token = token_;
        tokenDecimals = decimals_;
        poolFee = poolFee_;
        creditsPerToken = creditsPerToken_;
        emit TokenChanged(token_, decimals_, poolFee_, creditsPerToken_);
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
