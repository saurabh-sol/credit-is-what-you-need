// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {KreditReceipts} from "../src/KreditReceipts.sol";

/// Deploys KreditReceipts. Reads from the environment:
///   OWNER     the admin (a Safe, or the deployer while there is none)
///   SIGNER    the address of RECEIPT_SIGNER_KEY on the server
///   TREASURY  where token payments go
/// See contracts/README.md for the full commands.
contract Deploy is Script {
    function run() external returns (KreditReceipts kredit) {
        address owner = vm.envOr("OWNER", msg.sender);
        address signer = vm.envAddress("SIGNER");
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast();
        kredit = new KreditReceipts(owner, signer, treasury);
        vm.stopBroadcast();

        console.log("KreditReceipts:", address(kredit));
        console.log("  owner   ", owner);
        console.log("  signer  ", signer);
        console.log("  treasury", treasury);
    }
}
