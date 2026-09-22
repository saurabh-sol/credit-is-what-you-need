// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20, KreditTokenCheckout} from "../src/KreditTokenCheckout.sol";

/// Deploys KreditTokenCheckout. Reads from the environment:
///   OWNER              the admin (defaults to the deployer)
///   TREASURY           the wallet that receives every payment
///   TOKEN              the token to accept (defaults to KRED on Robinhood Chain)
///   TOKENS_PER_CREDIT  price in token base units per credit (defaults to 125 KRED)
contract DeployTokenCheckout is Script {
    address constant ROBINHOOD_KRED = 0x1b69Ba93b8DA9CF4cbc8f9C40e7ED25347F86Dd1;

    function run() external returns (KreditTokenCheckout kredit) {
        address owner = vm.envOr("OWNER", msg.sender);
        address treasury = vm.envAddress("TREASURY");
        address token = vm.envOr("TOKEN", ROBINHOOD_KRED);
        uint256 tokensPerCredit = vm.envOr("TOKENS_PER_CREDIT", uint256(125 ether));

        vm.startBroadcast();
        kredit = new KreditTokenCheckout(owner, treasury, IERC20(token), tokensPerCredit);
        vm.stopBroadcast();

        console.log("KreditTokenCheckout:", address(kredit));
        console.log("  owner    ", owner);
        console.log("  treasury ", treasury);
        console.log("  token    ", token);
        console.log("  price    ", tokensPerCredit);
    }
}
