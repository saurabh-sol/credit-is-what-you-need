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
KreditSwapBuy trades through SwapRouter02 with WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`;
its token is unset (buying off) until `scripts/swap-buy-admin.mjs set-token`.
Set `TOPUP_SWAP_ADDRESS=0x5965ab9b7FE7119d909f1e63B6Ad0e72a62715FA` next to the `TOPUP_TOKEN_*` values.
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

## KreditSwapBuy: buying credits with ETH

`src/KreditSwapBuy.sol` lets a wallet buy credits with ETH in one transaction.
`buyWithEth(minTokens, deadline)` sends the ETH to Uniswap v3's SwapRouter02
(`0xCaf681a66D020601342297493863E78C959E5cb2` on Robinhood Chain), swaps it
for the project token with the treasury as the recipient, and emits
`Purchased(buyer, token, ethIn, amount, credits)`. The contract never holds
funds: a swap that returns less than `minTokens`, or lands after `deadline`,
reverts the whole purchase. One purchase is capped at `maxCreditsPerBuy`
(100,000 credits by default). Owner-only: `setToken` (token, decimals, pool
fee tier, credits per token × 1e6), `setTreasury`, `setMaxCreditsPerBuy`,
`setPaused`, `transferOwnership`.

Deploy (buying stays off until `setToken`):

```sh
cd contracts && forge build
node --env-file=.env.local scripts/deploy-swap-buy.mjs     # DEPLOYER_KEY, TOPUP_TREASURY_ADDRESS
# or: TREASURY=$TREASURY forge script script/DeploySwapBuy.s.sol --rpc-url mainnet --private-key $DEPLOYER_KEY --broadcast
```

Verify: `forge verify-contract <address> src/KreditSwapBuy.sol:KreditSwapBuy --chain 4663 --verifier sourcify --constructor-args $(cast abi-encode "constructor(address,address,address)" $OWNER $TREASURY 0xCaf681a66D020601342297493863E78C959E5cb2)`,
then Blockscout's "Verify & publish" page as for KreditReceipts (single file,
0.8.28, paris, optimizer 2000 runs; the file inlines its router interface).

Switch a token on, with the on-chain checks first:

```sh
node --env-file=.env.local scripts/swap-buy-admin.mjs check <token>          # symbol, decimals, WETH pools, a quote
node --env-file=.env.local scripts/swap-buy-admin.mjs set-token <token> 3000  # 0.01 credits per token = 100 tokens per credit
node --env-file=.env.local scripts/swap-buy-admin.mjs status
```

`set-token` also calls `setToken` on KreditReceipts so both contracts price
the token the same way. Then put `TOPUP_SWAP_ADDRESS`, `TOPUP_POOL_FEE` and
the `TOPUP_TOKEN_*` values it prints into the server's environment, and run
`scripts/swap-buy-test.mjs` for a real purchase.

## Testing end to end

`scripts/receipts-test.mjs` runs the whole flow against a local chain: scan,
signed receipt, on-chain claim, confirmation, replay, and recovery of a claim
the browser never confirmed. It needs four things running:

```sh
anvil --port 8547 --chain-id 4663
node scripts/lib/mock-explorer.mjs 8548              # a fake Blockscout with a fake record
cd contracts && SIGNER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC TREASURY=0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
# prints 0x5FbDB2315678afecb367f032d93F642f64180aa3 on a fresh anvil

SESSION_SECRET=<32+ chars> DATABASE_URL=<a scratch Postgres> \
NEXT_PUBLIC_RPC_MAINNET=http://127.0.0.1:8547 EXPLORER_API_MAINNET=http://127.0.0.1:8548 \
RECEIPTS_ADDRESS_MAINNET=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
RECEIPT_SIGNER_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  npx next dev -p 3471

BASE_URL=http://localhost:3471 SESSION_SECRET=<same> DATABASE_URL=<same> \
WALLET_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  npm run test:receipts
```

The keys above are anvil's well-known test keys; never use them anywhere real.
