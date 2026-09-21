# Fuel, understood

A plain explanation of what this website is and how it works for every kind of user.
Every number here is taken from the code, and the file it comes from is named next to it.

## The idea in one paragraph

Fuel turns what a wallet has done on Robinhood Chain into **credits**, and credits pay
for **AI model calls**. You connect a wallet, the site reads your on-chain history, works
out what you have earned by fixed rules, and you claim it. Then you create an API key and
use it like an OpenAI key: every call takes a few credits off your balance.

**1,000 credits = $1 of AI usage.** (`src/lib/pricing.ts`)

```
wallet activity on chain ──scan──▶ receipt ──claim──▶ credits ──API key / playground──▶ AI answers
                                                        ▲
                       builder royalties, token top-ups ┘
```

## The pages

| Page | Who it is for | What it does |
| --- | --- | --- |
| `/` | Everyone | Explains the product. Once signed in, its button becomes "Open dashboard". |
| `/dashboard` | Signed-in wallets | Overview and balance, with a page each for earning (`/earn`: scan, claim, builder royalties), credits (`/credits`: buy more), API keys (`/keys`), activity (`/activity`) and settings (`/settings`: display name). |
| `/playground` | Signed-in wallets | Chat with any model in the browser, paid from your credits. No key needed. |
| `/docs` | Developers | How to call the API, with copy-paste code and what typical requests cost. |
| `/distribution` | Everyone | Public board: every wallet that earned credits, where they came from, and a live ticker. |
| `/v1/...` | Programs | The API itself (OpenAI-compatible). |

## How it works for each user

### 1. A visitor (no wallet connected)

You can read the landing page, the docs, and the public distribution board. You cannot
earn, spend, or open the dashboard; `/dashboard` sends you back to the home page.

### 2. Signing in (every wallet user)

1. Click **Connect wallet** and pick your wallet: a browser wallet such as MetaMask,
   Coinbase Wallet, or a Base Account smart wallet.
2. The site asks you to **sign a message** ("Sign-In with Ethereum"). This is free: no
   transaction, no gas. It only proves the wallet is yours.
3. The server checks the signature and gives your browser a session that lasts **7 days**.
4. You land on the dashboard. If you signed in from the playground or the docs, you stay there.

Details: the sign-in code (nonce) is valid for 5 minutes and works only once, so a copied
message cannot be replayed. Smart wallets such as Base Account are verified on-chain.
(`src/lib/session.ts`, `src/app/api/auth/verify/route.ts`)

### 3. Earning credits from your on-chain record

On the dashboard, **Scan** reads your wallet history from the chain explorer (up to your
latest 1,000 transactions, on testnet or mainnet) and shows a receipt. **Claim** pays
that receipt into your balance.

Each successful transaction is one "task" (`src/lib/scoring.ts`):

| What you did | Credits |
| --- | --- |
| Deployed a contract | 500 |
| Used a partner protocol | set per partner (the demo partner on testnet pays 250) |
| Called any other contract | 50 |
| Sent a plain transfer | 10 |
| A failed transaction | 0 |

On top of tasks:

- **Milestones**, paid once each: 10 transactions → 100, 50 → 300, 100 → 750, 500 → 2,500.
  Only the first 20 transactions of each day count toward milestones.
- **Gas-Back**: 40% of the gas you spent comes back as credits. Spend $1 on gas, get 400
  credits ($0.40). Fractions of a credit are not lost; they carry over to your next claim.
  If the ETH price cannot be read at that moment, Gas-Back is left out and stays claimable
  later. (`src/lib/gasback.ts`)

The rules that keep it fair:

- **Daily cap**: task rewards are limited to 1,000 credits per wallet per day of activity
  (UTC). Milestones and Gas-Back are not under this cap.
- **Everything pays once**: each transaction and each milestone can be claimed one time
  only. You can scan as often as you like; a second claim only pays for new activity.
- A scan is remembered for 60 seconds, so claiming right after scanning pays exactly what
  the receipt showed.

### 4. A builder (you deployed contracts)

When **other people** use a contract you deployed, **20% of the gas they spend** comes to
you as credits. These are Builder Royalties. (`src/lib/royalties.ts`)

- Your contracts are found automatically when your scan sees a deploy transaction. You can
  also add one by address; the explorer must confirm your wallet deployed it. Contracts
  created through a factory are not supported yet.
- Your own calls do not count. Failed calls do not count. Each call pays once.
- One scan checks up to 60 contracts and up to 500 recent calls per contract. If you have
  more, the rest are checked on the next scan, oldest-checked first.
- It cannot be farmed for profit: calling your own contract from a second wallet returns
  at most 40% (Gas-Back) + 20% (royalty) = 60% of what the gas cost.

### 5. Buying credits with the token (optional)

If the site owner has switched top-ups on, you can buy extra credits with the project's
token (`src/lib/topup.ts`, `src/app/api/topup/route.ts`):

1. From the dashboard, send tokens from your wallet to the treasury address.
2. The site submits the transaction hash to the server.
3. The server reads the transaction on-chain and counts **only** tokens of the right kind
   that went **from your signed-in wallet to the treasury**.
4. Credits are added, rounded down to whole credits. Each payment works once.

Until the owner sets the token, treasury and price, this section says buying is not open.

### 6. Spending credits

There are two ways to spend, and they bill in exactly the same way.

**The playground** (`/playground`): pick a model, type, get an answer. It uses your wallet
session, so you never paste a key into a web page.

**The API** (for your own apps and scripts):

1. On the dashboard create an API key. It starts with `fuel_sk_`. The full key is shown
   once; the server stores only a hash of it. You can have up to **5 active keys** and
   revoke any of them at any time.
2. Point any OpenAI client at this site:

   ```python
   from openai import OpenAI
   client = OpenAI(base_url="https://<this-site>/v1", api_key="fuel_sk_...")
   reply = client.chat.completions.create(
       model="fuel/echo",
       messages=[{"role": "user", "content": "hi"}],
   )
   ```

3. `GET /v1/models` lists the models. `fuel/echo` is a built-in test model that repeats
   your message, so you can test a key before using a real model.

**What a call costs** (`src/lib/pricing.ts`):

```
credits = provider's price in USD × 1.20 (Fuel's 20% margin) × 1,000, rounded up, minimum 1
```

- A call the provider prices at $0.01 costs 12 credits.
- If the provider does not report a price, Fuel uses $3 per million input tokens and $15
  per million output tokens. A normal chat turn (300 tokens in, 500 out) is 11 credits;
  a one-line question is about 2.
- A normal (non-streaming) answer carries two headers: `x-fuel-credits-charged` and
  `x-fuel-balance`. The bill arrives with the answer. Streamed answers from real models
  are charged the same way but do not carry these headers; check the dashboard instead.

**Limits and errors** (`src/lib/gateway.ts`, `src/lib/completions.ts`):

- 60 requests per minute per key (and per wallet in the playground) → `429`.
- Balance at zero or below → `402 insufficient_credits`. A call is allowed whenever the
  balance is above zero, so the very last call can take it slightly below zero.
- Wrong or revoked key → `401`.
- If the AI provider fails or cannot be reached, you are **not charged**.
- Streaming answers are billed when the stream ends, or when you disconnect.

### 7. What everyone can see (the public side)

`/distribution` is public on purpose: credits are handed out by rules, so anyone can check
them. It shows, for every wallet that earned: total credits, their worth in dollars, where
they came from (tasks, milestones, Gas-Back, royalties, bought), tokens paid in, and when
it last earned. You can search by name or address. It refreshes every 20 seconds.

The **ticker** under the totals shows one entry per wallet that has claimed: what it
claimed and how much it has used, with the wallets using the most credits first.

What stays private: **what** you spent credits on. Models, prompts and single calls are
never shown; only one "used" total per wallet.

By default you appear as a short address like `0xf7d0…dca2`. On the dashboard you can set
a **display name** (2–24 letters, digits, spaces, dots, dashes or underscores), or remove
it again.

## For the person running the site

- All balances live in one **ledger** table in SQLite (`data/fuel.db` by default). Your
  balance is simply the sum of your rows: claims, milestones, Gas-Back, royalties and
  top-ups are positive, spending is negative. Nothing is ever edited, only added.
  (`src/lib/db.ts`, `src/lib/ledger.ts`)
- Claims are planned and written in one database transaction, so two claims at the same
  moment cannot both be paid for the same work.
- Settings come from the environment (see `.env.example`):
  - `SESSION_SECRET`: required, 32+ characters.
  - `UPSTREAM_BASE_URL`, `UPSTREAM_API_KEY`: the AI provider behind the API. Any
    OpenAI-compatible service works. Without a key, only `fuel/echo` works.
  - `EXPLORER_API_*`, `BLOCKSCOUT_API_KEY`: where wallet history is read from.
  - `PRICE_FEED_*`: the ETH/USD price used for Gas-Back and royalties (Chainlink).
  - `TOPUP_*`: token, treasury and price. Top-ups stay off until all are set.
- Checks: `npm test` (unit tests for every money rule), `npm run lint`, `npm run build`.

## The rules on one screen

| Rule | Value |
| --- | --- |
| Credit value | 1,000 credits = $1 |
| Deploy / contract call / transfer | 500 / 50 / 10 credits |
| Milestones (10 / 50 / 100 / 500 txs) | 100 / 300 / 750 / 2,500 credits |
| Transactions per day that count toward milestones | 20 |
| Daily cap on task rewards | 1,000 credits per wallet |
| Gas-Back | 40% of gas spent |
| Builder royalty | 20% of gas others spend on your contracts |
| Fuel's margin on AI calls | 20% |
| Minimum charge per call | 1 credit |
| Rate limit | 60 requests per minute per key |
| Active API keys per wallet | 5 |
| Session length | 7 days |
| Scan depth | latest 1,000 transactions |
