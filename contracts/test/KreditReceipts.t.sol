// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KreditReceipts} from "../src/KreditReceipts.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KreditReceiptsTest is Test {
    KreditReceipts kredit;
    MockToken token;

    uint256 signerKey = 0xA11CE;
    address signer = vm.addr(signerKey);
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

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

    function setUp() public {
        kredit = new KreditReceipts(owner, signer, treasury);
        token = new MockToken();
        vm.warp(1_760_000_000);
    }

    function receiptFor(address wallet, uint64 credits, uint64 nonce) internal view returns (KreditReceipts.Receipt memory) {
        return KreditReceipts.Receipt({
            wallet: wallet,
            credits: credits,
            txCount: 3,
            recordRoot: keccak256("txs"),
            rulesVersion: 1,
            referrer: bob,
            nonce: nonce,
            deadline: uint64(block.timestamp + 600)
        });
    }

    function sign(KreditReceipts.Receipt memory receipt, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                kredit.RECEIPT_TYPEHASH(),
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
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", kredit.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // ---------------------------------------------------------------- claim

    function test_claim_writes_the_receipt() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 650, 0);
        bytes memory signature = sign(receipt, signerKey);

        vm.expectEmit(true, false, false, true);
        emit Claimed(alice, bytes32(0), 650, 3, keccak256("txs"), 1, bob, 0);
        vm.prank(alice);
        bytes32 id = kredit.claim(receipt, signature);

        assertEq(kredit.earned(alice), 650);
        assertEq(kredit.totalEarned(), 650);
        assertEq(kredit.nonces(alice), 1);
        assertTrue(kredit.claimed(id));
    }

    function test_claim_rejects_a_replay() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 650, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.prank(alice);
        kredit.claim(receipt, signature);

        vm.expectRevert(KreditReceipts.BadNonce.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_claim_needs_the_next_nonce() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 1);
        bytes memory signature = sign(receipt, signerKey);
        vm.expectRevert(KreditReceipts.BadNonce.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_two_receipts_with_one_nonce_only_one_lands() public {
        KreditReceipts.Receipt memory first = receiptFor(alice, 100, 0);
        KreditReceipts.Receipt memory second = receiptFor(alice, 200, 0);
        bytes memory firstSig = sign(first, signerKey);
        bytes memory secondSig = sign(second, signerKey);

        vm.prank(alice);
        kredit.claim(second, secondSig);
        vm.expectRevert(KreditReceipts.BadNonce.selector);
        vm.prank(alice);
        kredit.claim(first, firstSig);
        assertEq(kredit.earned(alice), 200);
    }

    function test_claim_rejects_the_wrong_signer() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory forged = sign(receipt, 0xBAD);
        vm.expectRevert(KreditReceipts.BadSignature.selector);
        vm.prank(alice);
        kredit.claim(receipt, forged);
    }

    function test_claim_rejects_a_changed_receipt() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        receipt.credits = 100_000;
        vm.expectRevert(KreditReceipts.BadSignature.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_claim_only_by_the_named_wallet() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.expectRevert(KreditReceipts.NotYourReceipt.selector);
        vm.prank(bob);
        kredit.claim(receipt, signature);
    }

    function test_claim_expires() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.warp(receipt.deadline + 1);
        vm.expectRevert(KreditReceipts.Expired.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_claim_stops_while_paused() public {
        vm.prank(owner);
        kredit.setPaused(true);
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.expectRevert(KreditReceipts.Paused.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_receipt_signed_for_another_chain_fails() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.chainId(4663);
        vm.expectRevert(KreditReceipts.BadSignature.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
    }

    function test_rotating_the_signer_voids_old_receipts() public {
        KreditReceipts.Receipt memory receipt = receiptFor(alice, 100, 0);
        bytes memory signature = sign(receipt, signerKey);
        vm.prank(owner);
        kredit.setSigner(vm.addr(0xB0B));
        vm.expectRevert(KreditReceipts.BadSignature.selector);
        vm.prank(alice);
        kredit.claim(receipt, signature);
        bytes memory fresh = sign(receipt, 0xB0B);
        vm.prank(alice);
        kredit.claim(receipt, fresh);
        assertEq(kredit.earned(alice), 100);
    }

    // ------------------------------------------------------------------ buy

    function enableBuying() internal {
        vm.prank(owner);
        kredit.setToken(address(token), 18, 100 * 1e6); // 1 token = 100 credits
        token.mint(alice, 1000 ether);
        vm.prank(alice);
        token.approve(address(kredit), type(uint256).max);
    }

    function test_buy_pays_the_treasury_and_records_credits() public {
        enableBuying();
        vm.expectEmit(true, true, false, true);
        emit Purchased(alice, address(token), 12.5 ether, 1250);
        vm.prank(alice);
        uint256 credits = kredit.buy(12.5 ether);

        assertEq(credits, 1250);
        assertEq(token.balanceOf(treasury), 12.5 ether);
        assertEq(token.balanceOf(address(kredit)), 0);
        assertEq(kredit.purchased(alice), 1250);
        assertEq(kredit.totalPurchased(), 1250);
    }

    function test_buy_rounds_down_and_refuses_dust() public {
        enableBuying();
        assertEq(kredit.creditsFor(0.019 ether), 1);
        vm.expectRevert(KreditReceipts.NothingBought.selector);
        vm.prank(alice);
        kredit.buy(0.009 ether);
    }

    function test_buy_with_a_fractional_price() public {
        enableBuying();
        vm.prank(owner);
        kredit.setToken(address(token), 6, 2_500_000); // 2.5 credits per token, 6 decimals
        assertEq(kredit.creditsFor(3_000_000), 7);
    }

    function test_buy_is_off_until_a_token_is_set() public {
        vm.expectRevert(KreditReceipts.BuyingOff.selector);
        vm.prank(alice);
        kredit.buy(1 ether);
    }

    function test_buy_fails_without_allowance() public {
        vm.prank(owner);
        kredit.setToken(address(token), 18, 100 * 1e6);
        token.mint(alice, 1 ether);
        vm.expectRevert(KreditReceipts.TransferFailed.selector);
        vm.prank(alice);
        kredit.buy(1 ether);
    }

    // ---------------------------------------------------------------- admin

    function test_only_the_owner_administers() public {
        vm.startPrank(alice);
        vm.expectRevert(KreditReceipts.NotOwner.selector);
        kredit.setSigner(alice);
        vm.expectRevert(KreditReceipts.NotOwner.selector);
        kredit.setTreasury(alice);
        vm.expectRevert(KreditReceipts.NotOwner.selector);
        kredit.setToken(address(token), 18, 1);
        vm.expectRevert(KreditReceipts.NotOwner.selector);
        kredit.setPaused(true);
        vm.expectRevert(KreditReceipts.NotOwner.selector);
        kredit.transferOwnership(alice);
        vm.stopPrank();
    }

    function test_ownership_moves() public {
        vm.prank(owner);
        kredit.transferOwnership(bob);
        assertEq(kredit.owner(), bob);
        vm.prank(bob);
        kredit.setPaused(true);
        assertTrue(kredit.paused());
    }

    function test_no_zero_addresses() public {
        vm.expectRevert(KreditReceipts.ZeroAddress.selector);
        new KreditReceipts(address(0), signer, treasury);
        vm.startPrank(owner);
        vm.expectRevert(KreditReceipts.ZeroAddress.selector);
        kredit.setSigner(address(0));
        vm.expectRevert(KreditReceipts.ZeroAddress.selector);
        kredit.setTreasury(address(0));
        vm.stopPrank();
    }
}
