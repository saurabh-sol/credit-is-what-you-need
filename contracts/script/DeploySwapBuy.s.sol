// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ISwapRouter02, KreditSwapBuy} from "../src/KreditSwapBuy.sol";

/// Deploys KreditSwapBuy. Reads from the environment:
///   OWNER     the admin (defaults to the deployer)
///   TREASURY  the wallet that receives the swapped tokens
///   ROUTER    Uniswap v3 SwapRouter02 (defaults to the Robinhood Chain one)
/// Buying stays off until the owner calls setToken. See contracts/README.md.
contract DeploySwapBuy is Script {
    address constant ROBINHOOD_SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;

    function run() external returns (KreditSwapBuy kredit) {
        address owner = vm.envOr("OWNER", msg.sender);
        address treasury = vm.envAddress("TREASURY");
        address router = vm.envOr("ROUTER", ROBINHOOD_SWAP_ROUTER_02);

        vm.startBroadcast();
        kredit = new KreditSwapBuy(owner, treasury, ISwapRouter02(router));
        vm.stopBroadcast();

        console.log("KreditSwapBuy:", address(kredit));
        console.log("  owner   ", owner);
        console.log("  treasury", treasury);
        console.log("  router  ", router);
        console.log("  weth    ", kredit.weth());
    }
}
