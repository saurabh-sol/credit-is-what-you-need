// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20, ISwapRouter02, KreditCheckout} from "../src/KreditCheckout.sol";

/// Deploys KreditCheckout. Reads from the environment:
///   OWNER            the admin (defaults to the deployer)
///   TREASURY         the wallet that receives every payment
///   ROUTER           Uniswap v3 SwapRouter02 (defaults to the Robinhood Chain one)
///   USDG             the USDG token (defaults to the Robinhood Chain one)
///   POOL_FEE         the WETH/USDG pool fee tier (defaults to 100 = 0.01%)
///   USDG_PER_CREDIT  price in USDG base units per credit (defaults to 800 = $0.0008)
contract DeployCheckout is Script {
    address constant ROBINHOOD_SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant ROBINHOOD_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    function run() external returns (KreditCheckout kredit) {
        address owner = vm.envOr("OWNER", msg.sender);
        address treasury = vm.envAddress("TREASURY");
        address router = vm.envOr("ROUTER", ROBINHOOD_SWAP_ROUTER_02);
        address usdg = vm.envOr("USDG", ROBINHOOD_USDG);
        uint24 poolFee = uint24(vm.envOr("POOL_FEE", uint256(100)));
        uint256 usdgPerCredit = vm.envOr("USDG_PER_CREDIT", uint256(800));

        vm.startBroadcast();
        kredit = new KreditCheckout(owner, treasury, ISwapRouter02(router), IERC20(usdg), poolFee, usdgPerCredit);
        vm.stopBroadcast();

        console.log("KreditCheckout:", address(kredit));
        console.log("  owner    ", owner);
        console.log("  treasury ", treasury);
        console.log("  router   ", router);
        console.log("  usdg     ", usdg);
        console.log("  weth     ", kredit.weth());
        console.log("  poolFee  ", poolFee);
        console.log("  price    ", usdgPerCredit);
    }
}
