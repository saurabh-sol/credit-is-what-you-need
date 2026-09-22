# KreditReceipts

The on-chain record of what a wallet earned on Kredit. One contract, no proxy,
built with [Foundry](https://getfoundry.sh).

The server scores a wallet's Robinhood Chain history from Blockscout, plans
the claim, and signs it as an EIP-712 receipt (`src/lib/receipts.ts`). The
wallet submits that receipt to `claim()`. The contract checks the signature,
the nonce and the deadline, records the credits, and emits `Claimed`, which
is the receipt anyone can read on Blockscout. Only then does the server write
the credits into its ledger (`POST /api/claim/confirm`).

- Credits are spent off-chain on AI calls; the contract records what came in,
  never what went out.
- `recordRoot` is keccak256 of the sorted transaction hashes the receipt pays
  for, packed, so anyone can recompute it from the explorer.
- `rulesVersion` names the scoring rules (`RULES_VERSION` in `src/lib/scoring.ts`).
- `buy(amount)` pays the project token to the treasury and emits `Purchased`.
  The contract never holds funds.
- Owner-only: `setSigner`, `setTreasury`, `setToken`, `setPaused`, `transferOwnership`.

## Deployments

| Network | Address | Deployed | Source |
| --- | --- | --- | --- |
| Robinhood Chain mainnet (4663) | [`0x46C668199e07eDD479A9309B0866cD6900E88bdD`](https://robinhoodchain.blockscout.com/address/0x46C668199e07eDD479A9309B0866cD6900E88bdD) | block 69528429, tx `0x89aecbc105559f535714b578125e7885b2dcca46e39aa781b636bead819db48a` | verified on Blockscout (partial match, flattened source) and an exact match on [Sourcify](https://sourcify.dev/server/v2/contract/4663/0x46C668199e07eDD479A9309B0866cD6900E88bdD) |

| KreditSwapBuy, Robinhood Chain mainnet (4663) | [`0x5965ab9b7FE7119d909f1e63B6Ad0e72a62715FA`](https://robinhoodchain.blockscout.com/address/0x5965ab9b7FE7119d909f1e63B6Ad0e72a62715FA) | block 69564721, tx `0xbc2139480f5fc01239f89704ba25687a4f2cf33185c3311c405977462b68bf9f` | [Sourcify](https://sourcify.dev/server/v2/contract/4663/0x5965ab9b7FE7119d909f1e63B6Ad0e72a62715FA) |

Owner and treasury are the deployer wallet `0xBeed…3323`; the signer is `0x59B5…7764`.
KreditSwapBuy is superseded by KreditCheckout (below) and has no token set.
Set `RECEIPTS_ADDRESS_MAINNET=0x46C668199e07eDD479A9309B0866cD6900E88bdD` and
`RECEIPTS_FROM_BLOCK_MAINNET=69528429` next to the signer key.

Mainnet Blockscout puts a Cloudflare challenge in front of its API, so
`forge verify-contract --verifier blockscout` cannot reach it from a server,
and the Sourcify widget on its verification page does not list chain 4663.
What works: `--verifier sourcify` from the terminal (exact match, and Sourcify
forwards to Etherscan), then Blockscout's own "Verify & publish" page in a
browser with the "Solidity (Single file)" method: compiler v0.8.28, EVM
version paris, optimization on with 2000 runs, and the contents of
`src/KreditReceipts.sol` pasted in (it has no imports).

## Test

```sh
cd contracts
forge test
```

`test/Hash.t.sol` and `src/lib/receipts.test.ts` share two constants, so the
Solidity hash and the server's hash are proven equal on every run.

## Deploy

Robinhood Chain mainnet is chain 4663 (`foundry.toml`). Kredit runs on mainnet only.

```sh
cd contracts
# The server's signer: openssl rand -hex 32, with 0x in front, goes into RECEIPT_SIGNER_KEY.
SIGNER=$(cast wallet address --private-key $RECEIPT_SIGNER_KEY)
OWNER=<a Safe, or your deployer while there is none>
TREASURY=<where token payments go>

SIGNER=$SIGNER OWNER=$OWNER TREASURY=$TREASURY \
  forge script script/Deploy.s.sol --rpc-url mainnet --private-key $DEPLOYER_KEY --broadcast
```

Then put the printed address into `RECEIPTS_ADDRESS_MAINNET`
next to `RECEIPT_SIGNER_KEY` in the server's environment. With no address set,
claims stay off-chain, exactly as before.

## Verify on Blockscout

Verified source is what makes `Claimed` readable on the explorer.

```sh
forge verify-contract <address> src/KreditReceipts.sol:KreditReceipts \
  --chain 4663 --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" $OWNER $SIGNER $TREASURY)
```

## Switching on buying

```sh
cast send <address> "setToken(address,uint8,uint256)" $TOKEN 18 100000000 --rpc-url mainnet --private-key $OWNER_KEY
# 100000000 = 100 credits per whole token (credits × 1e6)
```

## KreditCheckout: buying credits with USDG or ETH

`src/KreditCheckout.sol` sells credits at a fixed dollar price. USDG (Global
Dollar, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals) is the unit
of account: `usdgPerCredit` base units buy one credit, 800 = $0.0008, so 1,000
credits cost $0.80.

- `buyWithUsdg(credits)` moves exactly `costOf(credits)` USDG from the buyer to
  the treasury (`transferFrom`, so the buyer approves that amount first).
- `buyWithEth(minCredits, deadline)` sends the ETH to Uniswap v3's SwapRouter02
  (`0xCaf681a66D020601342297493863E78C959E5cb2`), swaps it for USDG through the
  WETH/USDG pool (fee tier 100 = 0.01%) with the treasury as the recipient, and
  credits whatever whole credits the USDG that came out buys. Fewer than
  `minCredits`, or a block after `deadline`, reverts the whole purchase.

Both emit `Purchased(buyer, USDG, ethIn, usdgAmount, credits)` (the same event
KreditSwapBuy wrote, `ethIn` zero for USDG). The contract never holds funds.
One purchase is capped at `maxCreditsPerBuy` (100,000 credits by default).
Owner-only: `setPrice`, `setTreasury`, `setMaxCreditsPerBuy`, `setPaused`,
`transferOwnership`.

Deploy (buying is on as soon as the server has `TOPUP_CHECKOUT_ADDRESS`):

```sh
cd contracts && forge build
node --env-file=.env.local scripts/deploy-checkout.mjs     # DEPLOYER_KEY, TOPUP_TREASURY_ADDRESS
# or: TREASURY=$TREASURY forge script script/DeployCheckout.s.sol --rpc-url mainnet --private-key $DEPLOYER_KEY --broadcast
```

Verify: `forge verify-contract <address> src/KreditCheckout.sol:KreditCheckout --chain 4663 --verifier sourcify --constructor-args $(cast abi-encode "constructor(address,address,address,address,uint24,uint256)" $OWNER $TREASURY 0xCaf681a66D020601342297493863E78C959E5cb2 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 100 800)`,
then Blockscout's "Verify & publish" page as for KreditReceipts (single file,
0.8.28, paris, optimizer 2000 runs; the file inlines its interfaces).

Operate it:

```sh
node --env-file=.env.local scripts/checkout-admin.mjs status            # price, cap, pool, an ETH quote for 1,000 credits
node --env-file=.env.local scripts/checkout-admin.mjs set-price 800     # $0.0008 per credit
node --env-file=.env.local scripts/checkout-admin.mjs pause | unpause
```

Then run `scripts/checkout-test.mjs` for a real purchase each way (the ETH leg
pays USDG to the treasury, which can then pay the USDG leg).

## KreditSwapBuy (superseded)

`src/KreditSwapBuy.sol` was the first take: ETH swapped for a project token.
It is still deployed (table above) with no token set, so it does nothing, and
the app no longer reads it. KreditCheckout replaced it.
