// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KreditReceipts} from "../src/KreditReceipts.sol";

// The server computes receipt ids and record roots itself (src/lib/receipts.ts);
// these constants are shared with src/lib/receipts.test.ts so both agree.
contract HashTest is Test {
    function test_hashes_match_the_server() public {
        KreditReceipts kredit = new KreditReceipts(address(1), address(2), address(3));
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111));
        hashes[1] = bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222));
        bytes32 root = keccak256(abi.encodePacked(hashes));
        KreditReceipts.Receipt memory receipt = KreditReceipts.Receipt({
            wallet: 0x1111111111111111111111111111111111111111,
            credits: 650,
            txCount: 2,
            recordRoot: root,
            rulesVersion: 1,
            referrer: 0x2222222222222222222222222222222222222222,
            nonce: 0,
            deadline: 1760000600
        });
        assertEq(root, 0x3e92e0db88d6afea9edc4eedf62fffa4d92bcdfc310dccbe943747fe8302e871);
        assertEq(this.hashOf(kredit, receipt), 0x1fae44557446427248a4bdfa7304b6efeee822f94d7427dfaf206a2a230a1d6b);
    }

    function hashOf(KreditReceipts kredit, KreditReceipts.Receipt calldata receipt) external pure returns (bytes32) {
        return kredit.hashReceipt(receipt);
    }
}
