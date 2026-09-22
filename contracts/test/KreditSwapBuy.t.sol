// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ISwapRouter02, KreditSwapBuy} from "../src/KreditSwapBuy.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

/// A stand-in for SwapRouter02: every wei in mints `rate` token units to the recipient.
contract MockRouter is ISwapRouter02 {
    address public constant WETH9 = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    MockToken public tokenOut;
    uint256 public rate;
    ExactInputSingleParams public last;

    constructor(MockToken tokenOut_, uint256 rate_) {
        tokenOut = tokenOut_;
        rate = rate_;
    }

    function setRate(uint256 rate_) external {
        rate = rate_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        require(msg.value == params.amountIn, "value");
        require(params.tokenIn == WETH9, "tokenIn");
        require(params.tokenOut == address(tokenOut), "tokenOut");
        last = params;
        amountOut = params.amountIn * rate;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        tokenOut.mint(params.recipient, amountOut);
    }
}

contract KreditSwapBuyTest is Test {
    KreditSwapBuy kredit;
    MockToken token;
    MockRouter router;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");

    uint256 constant ONE = 1e18;
    uint256 constant RATE = 100_000; // 1 ETH -> 100,000 tokens (1 wei -> 100,000 base units)
    uint256 constant CREDITS_PER_TOKEN = 10_000; // 0.01 credits per token, times 1e6

    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);

    function setUp() public {
        token = new MockToken();
        router = new MockRouter(token, RATE);
        kredit = new KreditSwapBuy(owner, treasury, router);
        vm.prank(owner);
        kredit.setToken(address(token), 18, 3000, CREDITS_PER_TOKEN);
        vm.deal(alice, 10 ether);
    }

    function test_buysCreditsAndPaysTheTreasury() public {
        // 2 ETH -> 200,000 tokens -> 2,000 credits.
        vm.expectEmit(true, true, true, true);
        emit Purchased(alice, address(token), 2 ether, 200_000 * ONE, 2_000);
        vm.prank(alice);
        (uint256 amount, uint256 credits) = kredit.buyWithEth{value: 2 ether}(0, block.timestamp);

        assertEq(amount, 200_000 * ONE);
        assertEq(credits, 2_000);
        assertEq(token.balanceOf(treasury), 200_000 * ONE);
        assertEq(token.balanceOf(address(kredit)), 0);
        assertEq(address(kredit).balance, 0);
        assertEq(kredit.purchased(alice), 2_000);
        assertEq(kredit.totalPurchased(), 2_000);

        (address tokenIn, address tokenOut, uint24 fee, address recipient,,,) = router.last();
        assertEq(tokenIn, kredit.weth());
        assertEq(tokenOut, address(token));
        assertEq(fee, 3000);
        assertEq(recipient, treasury);
    }

    function test_creditsRoundDown() public {
        // 0.00015 ETH -> 15 tokens -> 0.15 credits -> nothing.
        vm.prank(alice);
        vm.expectRevert(KreditSwapBuy.NothingBought.selector);
        kredit.buyWithEth{value: 0.00015 ether}(0, block.timestamp);

        // 0.0015 ETH -> 150 tokens -> 1 credit.
        vm.prank(alice);
        (, uint256 credits) = kredit.buyWithEth{value: 0.0015 ether}(0, block.timestamp);
        assertEq(credits, 1);
        assertEq(kredit.creditsFor(150 * ONE), 1);
        assertEq(kredit.creditsFor(199 * ONE), 1);
        assertEq(kredit.creditsFor(200 * ONE), 2);
    }

    function test_slippageAndDeadlineRefundTheBuyer() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Too little received"));
        kredit.buyWithEth{value: 1 ether}(200_000 * ONE, block.timestamp);

        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(KreditSwapBuy.Expired.selector);
        kredit.buyWithEth{value: 1 ether}(0, 999);

        assertEq(alice.balance, 10 ether);
        assertEq(token.balanceOf(treasury), 0);
    }

    function test_capOnOnePurchase() public {
        vm.prank(owner);
        kredit.setMaxCreditsPerBuy(1_500);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KreditSwapBuy.TooMuch.selector, 2_000, 1_500));
        kredit.buyWithEth{value: 2 ether}(0, block.timestamp);
    }

    function test_offPausedAndEmpty() public {
        vm.prank(alice);
        vm.expectRevert(KreditSwapBuy.NothingSent.selector);
        kredit.buyWithEth{value: 0}(0, block.timestamp);

        vm.prank(owner);
        kredit.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(KreditSwapBuy.Paused.selector);
        kredit.buyWithEth{value: 1 ether}(0, block.timestamp);

        vm.prank(owner);
        kredit.setPaused(false);
        vm.prank(owner);
        kredit.setToken(address(0), 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(KreditSwapBuy.BuyingOff.selector);
        kredit.buyWithEth{value: 1 ether}(0, block.timestamp);
    }

    function test_adminIsOwnerOnly() public {
        vm.startPrank(alice);
        vm.expectRevert(KreditSwapBuy.NotOwner.selector);
        kredit.setToken(address(token), 18, 3000, 1);
        vm.expectRevert(KreditSwapBuy.NotOwner.selector);
        kredit.setTreasury(alice);
        vm.expectRevert(KreditSwapBuy.NotOwner.selector);
        kredit.setPaused(true);
        vm.expectRevert(KreditSwapBuy.NotOwner.selector);
        kredit.setMaxCreditsPerBuy(1);
        vm.expectRevert(KreditSwapBuy.NotOwner.selector);
        kredit.transferOwnership(alice);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(KreditSwapBuy.BadFee.selector);
        kredit.setToken(address(token), 18, 1234, 1);
        vm.expectRevert(KreditSwapBuy.ZeroAddress.selector);
        kredit.setTreasury(address(0));
        kredit.setTreasury(alice);
        kredit.transferOwnership(alice);
        vm.stopPrank();
        assertEq(kredit.treasury(), alice);
        assertEq(kredit.owner(), alice);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(KreditSwapBuy.ZeroAddress.selector);
        new KreditSwapBuy(address(0), treasury, router);
        vm.expectRevert(KreditSwapBuy.ZeroAddress.selector);
        new KreditSwapBuy(owner, address(0), router);
        vm.expectRevert(KreditSwapBuy.ZeroAddress.selector);
        new KreditSwapBuy(owner, treasury, ISwapRouter02(address(0)));
    }
}
