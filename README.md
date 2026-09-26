<p align="center">
  <a href="promo/kredit-promo.mp4"><img src="promo/preview.gif" alt="Kredit" width="100%" /></a>
</p>

<p align="center"><a href="promo/kredit-promo.mp4"><b>▶ Watch the 30-second film with sound</b></a></p>

# Kredit

Kredit turns a wallet's on-chain activity into AI credits.

A person connects their wallet on [usekredit.space](https://usekredit.space). We scan their history on Robinhood Chain, score it, and hand out credits. They spend those credits on AI models (OpenAI, Anthropic, Google and others) through our API, the web playground, or the command line. When credits run out, they can buy more with USDG, ETH or the KRED token.

Live site: https://usekredit.space
Repo: https://github.com/saurabh-sol/credit-is-what-you-need

## How it works, in one pass

1. Wallet signs in (no password, just a signature).
2. Server reads the wallet's transactions from the chain, scores them, and signs a receipt.
3. Wallet submits that receipt to our `KreditReceipts` contract. The claim is recorded on-chain.
4. Server writes the credits into the ledger (Neon Postgres).
5. Person creates an API key on the dashboard and calls `https://usekredit.space/v1/...` exactly like they would call OpenAI. Every call deducts credits at the model's price.

## Folder structure

This is one Next.js project. The frontend and the backend live in the same repo and are deployed together as one service. The split below is by what each folder does, not by separate apps.

```
.
├── src/                      The website and the API (frontend + backend)
│   ├── app/
│   │   ├── (site)/           FRONTEND, public pages: landing, catalog, docs, distribution board, CLI login
│   │   ├── (app)/            FRONTEND, signed-in pages: dashboard (credits, keys, earn, activity, settings), playground
│   │   ├── api/              BACKEND, internal API used by the website (auth, claim, keys, top-up, profile, referrals, workspace)
│   │   ├── v1/               BACKEND, public AI API for customers (chat, completions, embeddings, images, videos, models, usage)
│   │   ├── typesafe/         BACKEND, TypeSafe AI "systemone" endpoint
│   │   └── r/                BACKEND, referral links (/r/<wallet>)
│   ├── components/           FRONTEND, shared UI: header, wallet button, top-up, receipts, landing sections, brand assets
│   └── lib/                  BACKEND, the business logic: ledger, pricing, scoring, receipts, sessions, DB, proxy to AI providers
│
├── contracts/                BLOCKCHAIN, Solidity contracts (Foundry): KreditReceipts, KreditCheckout, KreditTokenCheckout
├── cli/                      CLI, the `kredit` terminal tool published as @kredit/cli
├── scripts/                  TOOLING, deploy contracts, run tests against a live server, backups, chain scan
├── docs/                     Internal notes: CI, plan, plain-language explanation of the product
├── promo/                    The 30-second promo video and the pipeline that renders it
├── public/                   Static files served as-is (provider logos)
├── data/                     Local dev database and backups (git-ignored)
│
├── Dockerfile                Container build
├── docker-compose.yml        Run it locally with Docker
├── render.yaml               Render deployment blueprint (production runs from this)
├── .env.example              Every environment variable, with what it does
└── package.json              Scripts and dependencies
```

### Frontend

Everything a person sees. `src/app/(site)` is the public website. `src/app/(app)` is what you get after connecting a wallet: the dashboard and the playground. `src/components` holds the pieces shared between them. Built with Next.js 16, React 19, Tailwind, RainbowKit and wagmi for wallets.

### Backend

`src/app/api` is what our own website talks to. `src/app/v1` is what customers talk to: it accepts OpenAI-shaped requests, checks the API key and balance, forwards the call to the upstream provider (Vercel AI Gateway by default, OpenRouter as a second source), and charges the credits. `src/lib` is where the rules live: how credits are earned (`scoring.ts`), what each model costs (`pricing.ts`), the ledger (`ledger.ts`), on-chain receipts (`receipts.ts`), buying credits (`topup.ts`, `token-checkout.ts`). Data is in Neon Postgres; tables are created on first run.

### Blockchain

Three contracts on Robinhood Chain mainnet, all in `contracts/src`. `KreditReceipts` records claims. `KreditCheckout` sells credits for USDG or ETH. `KreditTokenCheckout` sells credits for KRED. Addresses and deploy history are in `contracts/README.md`.

### CLI

`cli/` is a separate small Node package. `kredit login`, `kredit chat`, `kredit models`, `kredit usage` and so on. It only talks to the `/v1` API. See `cli/README.md`.

## Running it locally

Needs Node 22 or newer.

```sh
npm install
cp .env.example .env.local        # fill in DATABASE_URL, SESSION_SECRET, UPSTREAM_API_KEY at minimum
npm run dev
```

Open http://localhost:3000. Without `UPSTREAM_API_KEY` only the test model `kredit/echo` answers, which is enough to click through the site.

Or with Docker:

```sh
docker compose --env-file .env.local up -d --build
```

That serves on http://localhost:4000.

## Tests

```sh
npm test                 # unit tests in src/lib
npm run test:contracts   # Foundry tests in contracts/
npm run test:compat      # checks /v1 against OpenAI, Anthropic and Cursor client shapes (needs a running server)
npm run test:gateway     # end-to-end AI call through /v1 (needs a running server and an upstream key)
npm run lint
```

The other `test:*` scripts in `package.json` each hit one feature (auth, referrals, receipts, top-up guard, platform) against a running server.

## Deploying

Production is Render. It watches the `main` branch of this repo and rebuilds on every push, using `render.yaml`. Secrets (database URL, provider keys, WalletConnect ID) are set in the Render dashboard, not in the repo.

Anything starting with `NEXT_PUBLIC_` is baked into the browser bundle at build time, so changing one of those needs a redeploy, not just a restart.

## Backups

The ledger lives in Neon Postgres, which keeps its own point-in-time history. For a copy you hold yourself:

```sh
npm run backup           # writes data/backups/kredit-<time>.json, keeps the newest 14
```

Safe to run while the site is live.

## Where to look for what

| Question | File |
| --- | --- |
| How many credits does an action earn? | `src/lib/scoring.ts`, `src/lib/referral-rules.ts` |
| What does a model cost? | `src/lib/pricing.ts`, `src/lib/catalog.ts` |
| What can a key spend per minute / per day? | `src/lib/limits.ts`, `src/lib/budget.ts` |
| Price of buying credits | `.env.example` (`TOPUP_*`), `src/lib/topup.ts` |
| Which chain and RPC | `src/lib/networks.ts`, `src/lib/chain.ts` |
| Contract addresses | `contracts/README.md` |
| Every env var | `.env.example` |
| Plain-language walkthrough of the whole product | `docs/understood.md` |
