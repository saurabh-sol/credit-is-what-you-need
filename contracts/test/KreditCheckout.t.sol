// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20, ISwapRouter02, KreditCheckout} from "../src/KreditCheckout.sol";

/// A six-decimal stand-in for USDG with the usual approve/transferFrom.
contract MockUsdg is IERC20 {
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
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// A stand-in for SwapRouter02: every wei in mints `rate` / 1e12 USDG units to
/// the recipient, i.e. `rate` is the dollar price of one ETH times 1e6.
contract MockRouter is ISwapRouter02 {
    address public constant WETH9 = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    MockUsdg public usdg;
    uint256 public rate;
    ExactInputSingleParams public last;

    constructor(MockUsdg usdg_, uint256 rate_) {
        usdg = usdg_;
        rate = rate_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        require(msg.value == params.amountIn, "value");
        require(params.tokenIn == WETH9, "tokenIn");
        require(params.tokenOut == address(usdg), "tokenOut");
        last = params;
        amountOut = (params.amountIn * rate) / 1e18;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        usdg.mint(params.recipient, amountOut);
    }
}

contract KreditCheckoutTest is Test {
    KreditCheckout kredit;
    MockUsdg usdg;
    MockRouter router;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");

    uint256 constant USDG = 1e6; // one dollar
    uint256 constant ETH_PRICE = 2_500 * USDG; // 1 ETH -> 2,500 USDG
    uint256 constant PRICE = 800; // $0.0008 per credit: 1,000 credits = $0.80

    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);

    function setUp() public {
        usdg = new MockUsdg();
        router = new MockRouter(usdg, ETH_PRICE);
        kredit = new KreditCheckout(owner, treasury, router, usdg, 100, PRICE);
        vm.deal(alice, 10 ether);
        usdg.mint(alice, 10 * USDG);
    }

    function test_pricing() public view {
        assertEq(kredit.costOf(1_000), 800_000); // $0.80
        assertEq(kredit.costOf(1), PRICE);
        assertEq(kredit.creditsFor(800_000), 1_000);
        assertEq(kredit.creditsFor(USDG), 1_250);
        assertEq(kredit.creditsFor(799), 0);
        assertEq(kredit.creditsFor(1_599), 1);
    }

    function test_buyWithUsdgPaysTheTreasuryExactly() public {
        vm.prank(alice);
        usdg.approve(address(kredit), 800_000);

        vm.expectEmit(true, true, true, true);
        emit Purchased(alice, address(usdg), 0, 800_000, 1_000);
        vm.prank(alice);
        uint256 amount = kredit.buyWithUsdg(1_000);

        assertEq(amount, 800_000);
        assertEq(usdg.balanceOf(treasury), 800_000);
        assertEq(usdg.balanceOf(alice), 10 * USDG - 800_000);
        assertEq(usdg.balanceOf(address(kredit)), 0);
        assertEq(kredit.purchased(alice), 1_000);
        assertEq(kredit.totalPurchased(), 1_000);
    }

    function test_buyWithUsdgNeedsAllowanceAndBalance() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC20: insufficient allowance"));
        kredit.buyWithUsdg(1_000);

        vm.prank(alice);
        usdg.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        kredit.buyWithUsdg(99_999); // $79.99, more than the $10 alice holds

        vm.prank(alice);
        vm.expectRevert(KreditCheckout.NothingBought.selector);
        kredit.buyWithUsdg(0);
    }

    function test_buyWithEthSwapsToTheTreasury() public {
        // 0.00032 ETH -> 0.80 USDG -> 1,000 credits.
        vm.expectEmit(true, true, true, true);
        emit Purchased(alice, address(usdg), 0.00032 ether, 800_000, 1_000);
        vm.prank(alice);
        (uint256 amount, uint256 credits) = kredit.buyWithEth{value: 0.00032 ether}(1_000, block.timestamp);

        assertEq(amount, 800_000);
        assertEq(credits, 1_000);
        assertEq(usdg.balanceOf(treasury), 800_000);
        assertEq(address(kredit).balance, 0);
        assertEq(kredit.purchased(alice), 1_000);

        (address tokenIn, address tokenOut, uint24 fee, address recipient,, uint256 minOut,) = router.last();
        assertEq(tokenIn, kredit.weth());
        assertEq(tokenOut, address(usdg));
        assertEq(fee, 100);
        assertEq(recipient, treasury);
        assertEq(minOut, 800_000);
    }

    function test_ethCreditsRoundDown() public {
        // 0.0001 ETH -> 0.25 USDG -> 312.5 -> 312 credits.
        vm.prank(alice);
        (, uint256 credits) = kredit.buyWithEth{value: 0.0001 ether}(0, block.timestamp);
        assertEq(credits, 312);

        // 1 wei -> 0 USDG -> nothing.
        vm.prank(alice);
        vm.expectRevert(KreditCheckout.NothingBought.selector);
        kredit.buyWithEth{value: 1}(0, block.timestamp);
    }

    function test_minCreditsAndDeadlineRefundTheBuyer() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Too little received"));
        kredit.buyWithEth{value: 0.00032 ether}(1_001, block.timestamp);

        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(KreditCheckout.Expired.selector);
        kredit.buyWithEth{value: 0.00032 ether}(0, 999);

        assertEq(alice.balance, 10 ether);
        assertEq(usdg.balanceOf(treasury), 0);
    }

    function test_capOnOnePurchase() public {
        vm.prank(owner);
        kredit.setMaxCreditsPerBuy(500);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KreditCheckout.TooMuch.selector, 1_000, 500));
        kredit.buyWithEth{value: 0.00032 ether}(0, block.timestamp);

        vm.prank(alice);
        usdg.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KreditCheckout.TooMuch.selector, 501, 500));
        kredit.buyWithUsdg(501);
    }

    function test_priceChangeAppliesToBothWays() public {
        vm.prank(owner);
        kredit.setPrice(1_000); // $0.001 per credit
        vm.prank(alice);
        usdg.approve(address(kredit), type(uint256).max);

        vm.prank(alice);
        assertEq(kredit.buyWithUsdg(1_000), USDG);
        vm.prank(alice);
        (, uint256 credits) = kredit.buyWithEth{value: 0.0004 ether}(0, block.timestamp); // 1 USDG
        assertEq(credits, 1_000);
    }

    function test_pausedAndEmpty() public {
        vm.prank(alice);
        vm.expectRevert(KreditCheckout.NothingSent.selector);
        kredit.buyWithEth{value: 0}(0, block.timestamp);

        vm.prank(owner);
        kredit.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(KreditCheckout.Paused.selector);
        kredit.buyWithEth{value: 1 ether}(0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(KreditCheckout.Paused.selector);
        kredit.buyWithUsdg(1);
    }

    function test_adminIsOwnerOnly() public {
        vm.startPrank(alice);
        vm.expectRevert(KreditCheckout.NotOwner.selector);
        kredit.setPrice(1);
        vm.expectRevert(KreditCheckout.NotOwner.selector);
        kredit.setTreasury(alice);
        vm.expectRevert(KreditCheckout.NotOwner.selector);
        kredit.setPaused(true);
        vm.expectRevert(KreditCheckout.NotOwner.selector);
        kredit.setMaxCreditsPerBuy(1);
        vm.expectRevert(KreditCheckout.NotOwner.selector);
        kredit.transferOwnership(alice);
        vm.stopPrank();

        vm.startPrank(owner);
        vm.expectRevert(KreditCheckout.ZeroPrice.selector);
        kredit.setPrice(0);
        vm.expectRevert(KreditCheckout.ZeroAddress.selector);
        kredit.setTreasury(address(0));
        kredit.setTreasury(alice);
        kredit.transferOwnership(alice);
        vm.stopPrank();
        assertEq(kredit.treasury(), alice);
        assertEq(kredit.owner(), alice);
    }

    function test_constructorChecks() public {
        vm.expectRevert(KreditCheckout.ZeroAddress.selector);
        new KreditCheckout(address(0), treasury, router, usdg, 100, PRICE);
        vm.expectRevert(KreditCheckout.ZeroAddress.selector);
        new KreditCheckout(owner, address(0), router, usdg, 100, PRICE);
        vm.expectRevert(KreditCheckout.ZeroAddress.selector);
        new KreditCheckout(owner, treasury, ISwapRouter02(address(0)), usdg, 100, PRICE);
        vm.expectRevert(KreditCheckout.ZeroAddress.selector);
        new KreditCheckout(owner, treasury, router, IERC20(address(0)), 100, PRICE);
        vm.expectRevert(KreditCheckout.BadFee.selector);
        new KreditCheckout(owner, treasury, router, usdg, 1234, PRICE);
        vm.expectRevert(KreditCheckout.ZeroPrice.selector);
        new KreditCheckout(owner, treasury, router, usdg, 100, 0);
    }
}
