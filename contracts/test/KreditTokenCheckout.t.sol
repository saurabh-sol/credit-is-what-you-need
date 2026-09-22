// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20, KreditTokenCheckout} from "../src/KreditTokenCheckout.sol";

/// An 18-decimal stand-in for KRED. `fee` (in basis points) is taken out of
/// every transfer, to stand in for a token that taxes transfers.
contract MockKred is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public fee;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
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
        balanceOf[to] += amount - (amount * fee) / 10_000;
        return true;
    }
}

/// A token whose transferFrom returns nothing, like USDT.
contract SilentKred {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// A token whose transferFrom returns false instead of reverting.
contract LyingKred {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

contract KreditTokenCheckoutTest is Test {
    KreditTokenCheckout kredit;
    MockKred kred;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");

    uint256 constant KRED = 1e18; // one whole token
    uint256 constant PRICE = 125 * KRED; // 125 KRED per credit: 1,000 credits = 125,000 KRED

    event Purchased(address indexed buyer, address indexed token, uint256 ethIn, uint256 amount, uint256 credits);

    function setUp() public {
        kred = new MockKred();
        kredit = new KreditTokenCheckout(owner, treasury, kred, PRICE);
        kred.mint(alice, 1_000_000 * KRED);
    }

    function test_pricing() public view {
        assertEq(kredit.costOf(1_000), 125_000 * KRED);
        assertEq(kredit.costOf(1), PRICE);
        assertEq(kredit.creditsFor(125_000 * KRED), 1_000);
        assertEq(kredit.creditsFor(PRICE - 1), 0);
        assertEq(kredit.creditsFor(2 * PRICE - 1), 1);
        assertEq(kredit.maxCreditsPerBuy(), 100_000);
    }

    function test_buyPaysTheTreasuryExactly() public {
        vm.prank(alice);
        kred.approve(address(kredit), 125_000 * KRED);

        vm.expectEmit(true, true, true, true);
        emit Purchased(alice, address(kred), 0, 125_000 * KRED, 1_000);
        vm.prank(alice);
        (uint256 amount, uint256 bought) = kredit.buyWithToken(1_000);

        assertEq(amount, 125_000 * KRED);
        assertEq(bought, 1_000);
        assertEq(kred.balanceOf(treasury), 125_000 * KRED);
        assertEq(kred.balanceOf(alice), 875_000 * KRED);
        assertEq(kred.balanceOf(address(kredit)), 0);
        assertEq(kredit.purchased(alice), 1_000);
        assertEq(kredit.totalPurchased(), 1_000);
    }

    function test_needsAllowanceAndBalance() public {
        vm.prank(alice);
        vm.expectRevert(bytes("ERC20: insufficient allowance"));
        kredit.buyWithToken(1_000);

        vm.prank(alice);
        kred.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        kredit.buyWithToken(8_001); // 1,000,125 KRED, more than alice holds

        vm.prank(alice);
        vm.expectRevert(KreditTokenCheckout.NothingBought.selector);
        kredit.buyWithToken(0);
    }

    function test_feeOnTransferBuysFewerCredits() public {
        kred.setFee(100); // 1% taken on every transfer
        vm.prank(alice);
        kred.approve(address(kredit), type(uint256).max);

        // 125,000 KRED sent, 123,750 arrive, worth 990 credits.
        vm.expectEmit(true, true, true, true);
        emit Purchased(alice, address(kred), 0, 123_750 * KRED, 990);
        vm.prank(alice);
        (uint256 amount, uint256 bought) = kredit.buyWithToken(1_000);
        assertEq(amount, 123_750 * KRED);
        assertEq(bought, 990);
        assertEq(kredit.purchased(alice), 990);

        // One credit's worth minus the fee is less than one credit: nothing bought, nothing recorded.
        vm.prank(alice);
        vm.expectRevert(KreditTokenCheckout.NothingBought.selector);
        kredit.buyWithToken(1);
    }

    function test_tokensThatReturnNothingOrFalse() public {
        SilentKred silent = new SilentKred();
        KreditTokenCheckout quiet = new KreditTokenCheckout(owner, treasury, IERC20(address(silent)), PRICE);
        silent.mint(alice, PRICE);
        vm.prank(alice);
        (, uint256 bought) = quiet.buyWithToken(1);
        assertEq(bought, 1);
        assertEq(silent.balanceOf(treasury), PRICE);

        LyingKred liar = new LyingKred();
        KreditTokenCheckout lied = new KreditTokenCheckout(owner, treasury, IERC20(address(liar)), PRICE);
        vm.prank(alice);
        vm.expectRevert(KreditTokenCheckout.TransferFailed.selector);
        lied.buyWithToken(1);
    }

    function test_capOnOnePurchase() public {
        vm.prank(owner);
        kredit.setMaxCreditsPerBuy(500);
        vm.prank(alice);
        kred.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KreditTokenCheckout.TooMuch.selector, 501, 500));
        kredit.buyWithToken(501);
        vm.prank(alice);
        (, uint256 bought) = kredit.buyWithToken(500);
        assertEq(bought, 500);
    }

    function test_repricing() public {
        vm.prank(owner);
        kredit.setPrice(100 * KRED);
        vm.prank(alice);
        kred.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        (uint256 amount,) = kredit.buyWithToken(1_000);
        assertEq(amount, 100_000 * KRED);

        vm.prank(owner);
        vm.expectRevert(KreditTokenCheckout.ZeroPrice.selector);
        kredit.setPrice(0);
    }

    function test_paused() public {
        vm.prank(owner);
        kredit.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(KreditTokenCheckout.Paused.selector);
        kredit.buyWithToken(1);

        vm.prank(owner);
        kredit.setPaused(false);
        vm.prank(alice);
        kred.approve(address(kredit), type(uint256).max);
        vm.prank(alice);
        (, uint256 bought) = kredit.buyWithToken(1);
        assertEq(bought, 1);
    }

    function test_onlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert(KreditTokenCheckout.NotOwner.selector);
        kredit.setPrice(1);
        vm.expectRevert(KreditTokenCheckout.NotOwner.selector);
        kredit.setTreasury(alice);
        vm.expectRevert(KreditTokenCheckout.NotOwner.selector);
        kredit.setMaxCreditsPerBuy(1);
        vm.expectRevert(KreditTokenCheckout.NotOwner.selector);
        kredit.setPaused(true);
        vm.expectRevert(KreditTokenCheckout.NotOwner.selector);
        kredit.transferOwnership(alice);
        vm.stopPrank();

        vm.prank(owner);
        kredit.transferOwnership(alice);
        assertEq(kredit.owner(), alice);
        vm.prank(alice);
        kredit.setTreasury(alice);
        assertEq(kredit.treasury(), alice);
    }

    function test_constructorChecks() public {
        vm.expectRevert(KreditTokenCheckout.ZeroAddress.selector);
        new KreditTokenCheckout(address(0), treasury, kred, PRICE);
        vm.expectRevert(KreditTokenCheckout.ZeroAddress.selector);
        new KreditTokenCheckout(owner, address(0), kred, PRICE);
        vm.expectRevert(KreditTokenCheckout.ZeroAddress.selector);
        new KreditTokenCheckout(owner, treasury, IERC20(address(0)), PRICE);
        vm.expectRevert(KreditTokenCheckout.ZeroPrice.selector);
        new KreditTokenCheckout(owner, treasury, kred, 0);
    }
}
