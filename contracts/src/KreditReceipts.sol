// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Kredit receipts
/// @notice The on-chain record of what a wallet earned on Kredit. The server
/// scores a wallet's Robinhood Chain history (the rules cannot run on-chain:
/// a contract cannot read a wallet's past) and signs a receipt. The wallet
/// submits it here, which writes the receipt into the chain forever and makes
/// it readable on Blockscout as a `Claimed` event. Credits are spent off-chain
/// on AI calls; this contract records what came in, never what went out.
///
/// Buying credits with the project token goes through `buy`, so a purchase is
/// a receipt too (`Purchased`). The contract never holds funds: tokens move
/// straight to the treasury inside the same call.
contract KreditReceipts {
    // ----------------------------------------------------------------- types

    /// @dev Signed by the server. `recordRoot` is keccak256 of the sorted
    /// transaction hashes the receipt pays for, so anyone can recompute it from
    /// the explorer. `rulesVersion` names the scoring rules it was priced under.
    struct Receipt {
        address wallet;
        uint64 credits; // 1,000 credits = $1 of AI usage
        uint32 txCount;
        bytes32 recordRoot;
        uint32 rulesVersion;
        address referrer; // who invited the wallet, or zero; informational
        uint64 nonce; // must equal nonces[wallet]
        uint64 deadline; // unix seconds; the receipt is void after this
    }

    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "Receipt(address wallet,uint64 credits,uint32 txCount,bytes32 recordRoot,uint32 rulesVersion,address referrer,uint64 nonce,uint64 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant PRICE_SCALE = 1e6; // creditsPerToken is stored times this

    // ---------------------------------------------------------------- state

    address public owner;
    address public signer; // the server key that signs receipts
    address public treasury; // where token payments go
    address public token; // the ERC-20 that buys credits, or zero while buying is off
    uint8 public tokenDecimals;
    uint256 public creditsPerToken; // credits for one whole token, times PRICE_SCALE
    bool public paused;

    mapping(address => uint64) public nonces;
    mapping(address => uint256) public earned; // credits claimed from receipts
    mapping(address => uint256) public purchased; // credits bought with the token
    mapping(bytes32 => bool) public claimed; // receipt id -> already written
    uint256 public totalEarned;
    uint256 public totalPurchased;

    // --------------------------------------------------------------- events

    event Claimed(
        address indexed wallet,
        bytes32 indexed receiptId,
        uint64 credits,
        uint32 txCount,
        bytes32 recordRoot,
        uint32 rulesVersion,
        address referrer,
        uint64 nonce
    );
    event Purchased(address indexed buyer, address indexed token, uint256 amount, uint256 credits);
    event SignerChanged(address indexed signer);
    event TreasuryChanged(address indexed treasury);
    event TokenChanged(address indexed token, uint8 decimals, uint256 creditsPerToken);
    event PausedChanged(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error Paused();
    error ZeroAddress();
    error NotYourReceipt();
    error Expired();
    error BadNonce();
    error BadSignature();
    error BuyingOff();
    error NothingBought();
    error TransferFailed();

    // ------------------------------------------------------------ lifecycle

    constructor(address owner_, address signer_, address treasury_) {
        if (owner_ == address(0) || signer_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        owner = owner_;
        signer = signer_;
        treasury = treasury_;
        emit OwnershipTransferred(address(0), owner_);
        emit SignerChanged(signer_);
        emit TreasuryChanged(treasury_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------- claim

    /// @notice Writes a server-signed receipt into the chain. Only the wallet
    /// named in it can submit it, once, before its deadline.
    function claim(Receipt calldata receipt, bytes calldata signature) external returns (bytes32 receiptId) {
        if (paused) revert Paused();
        if (msg.sender != receipt.wallet) revert NotYourReceipt();
        if (block.timestamp > receipt.deadline) revert Expired();
        if (receipt.nonce != nonces[receipt.wallet]) revert BadNonce();

        receiptId = hashReceipt(receipt);
        if (_recover(_digest(receiptId), signature) != signer) revert BadSignature();

        nonces[receipt.wallet] = receipt.nonce + 1;
        claimed[receiptId] = true;
        earned[receipt.wallet] += receipt.credits;
        totalEarned += receipt.credits;

        emit Claimed(
            receipt.wallet,
            receiptId,
            receipt.credits,
            receipt.txCount,
            receipt.recordRoot,
            receipt.rulesVersion,
            receipt.referrer,
            receipt.nonce
        );
    }

    /// @notice The EIP-712 struct hash of a receipt; also its id in `Claimed`.
    function hashReceipt(Receipt calldata receipt) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RECEIPT_TYPEHASH,
                receipt.wallet,
                receipt.credits,
                receipt.txCount,
                receipt.recordRoot,
                receipt.rulesVersion,
                receipt.referrer,
                receipt.nonce,
                receipt.deadline
            )
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Kredit"), keccak256("1"), block.chainid, address(this))
        );
    }

    // ------------------------------------------------------------------ buy

    /// @notice Pays `amount` base units of the project token to the treasury
    /// and records the credits it buys. Approve this contract first.
    function buy(uint256 amount) external returns (uint256 credits) {
        if (paused) revert Paused();
        if (token == address(0)) revert BuyingOff();
        credits = creditsFor(amount);
        if (credits == 0) revert NothingBought();

        _pull(token, msg.sender, treasury, amount);
        purchased[msg.sender] += credits;
        totalPurchased += credits;
        emit Purchased(msg.sender, token, amount, credits);
    }

    /// @notice Whole credits for `amount` base units, rounded down: a payment
    /// never buys more than it paid for. Mirrors the server's arithmetic.
    function creditsFor(uint256 amount) public view returns (uint256) {
        return (amount * creditsPerToken) / (10 ** uint256(tokenDecimals) * PRICE_SCALE);
    }

    // ---------------------------------------------------------------- admin

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        emit SignerChanged(signer_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    /// @notice Sets the token that buys credits. `creditsPerToken_` is credits
    /// per whole token times 1e6 (2.5 credits per token = 2_500_000). A zero
    /// token switches buying off.
    function setToken(address token_, uint8 decimals_, uint256 creditsPerToken_) external onlyOwner {
        token = token_;
        tokenDecimals = decimals_;
        creditsPerToken = creditsPerToken_;
        emit TokenChanged(token_, decimals_, creditsPerToken_);
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

    // ------------------------------------------------------------- internal

    function _digest(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        // Reject the high-s twin of every signature, so each receipt has one signature.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    /// @dev transferFrom that accepts tokens returning nothing as well as true.
    function _pull(address token_, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token_.call(abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom(address,address,uint256)
        if (!ok || (data.length != 0 && !abi.decode(data, (bool))) || token_.code.length == 0) revert TransferFailed();
    }
}
