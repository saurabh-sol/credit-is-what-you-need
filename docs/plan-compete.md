# Kredit: the plan to compete with Askr

Written 2026-09-22 against `main` at 531d865. Askr (heyaskr.ai) was read the same day.
This is a plan, not a build. Nothing below is implemented until it is ticked off here.

## Where we stand

| Area | Askr | Kredit today (main) | Gap |
| --- | --- | --- | --- |
| Get credits | Buy only (NOWPayments) | Earn from the chain record, streaks, referrals; buy with USDG/ETH via KreditCheckout | None. This is our edge. |
| API | `/v1/chat/completions` only, no CORS | Chat, Responses, Messages, Embeddings, Images, Videos, Evaluations, OpenAPI, CORS on | Ahead |
| Key prefix | `askr_live_` | `kredit_sk_` | Rename to `kred_sk_` |
| Workspace | Persistent chats, model switch keeps context, voice, media library | Playground: text, image, video, evaluate; nothing persists past a reload | Behind |
| CLI | Yes | No | Behind |
| Model catalog | Public `/models`, counts, per-turn price | Catalog inside `/docs/api/models` only | Promote to `/models` |
| Legal | Privacy policy + trust page | "Privacy and security" doc page only, no terms | Behind |
| Farm-proofing | Not needed, nothing is earned | Daily cap, milestones 20 tx/day, once-only, streaks, spend guard | Good; sybil and referral loops still open |
| Margin | 0% today | 20% | Decision, see open questions |

## Phase 1: key prefix `kred_sk_`

- `src/lib/ledger.ts`: `KEY_PREFIX = "kred_sk_"`. Lookup is by SHA-256 hash, so every existing `kredit_sk_` key keeps working; only new keys get the short prefix.
- Display prefix stays `first 12 chars … last 4`.
- Replace the string in docs (`api-core`, `api-more`, `integrations`, `platform`), `openapi.json`, `loop-beam.tsx`, `ledger.test.ts`, `scripts/*-test.mjs`.
- Test: `createKey` output starts with `kred_sk_`; a stored `kredit_sk_` hash still authenticates.

## Phase 2: public model catalog at `/models`

- New route `src/app/(site)/models/page.tsx`, reusing `src/lib/catalog.ts` and the existing `model-catalog.tsx` component. Header link "Models" between Docs and Distribution.
- Hero counts computed live: "N chat, N image, N video, N embedding models from M makers", with the date the list was last fetched.
- Table: maker logo, id (click to copy), type, context, price per million in and out, **price per typical turn** (1,000 in / 500 out, same basis Askr uses), image per picture, video per clip at cheapest rate. Filters: maker, type, "cheapest first". Search by id. Badge "not routable" for models the gateway lists without a price.
- "Try in playground" opens `/playground?model=<id>` with the model preselected (playground reads the query param).
- Landing "Model orbit" section shows the live counts, not a fixed list.
- `GET /v1/models` unchanged.

## Phase 3: workspace (playground grows into a real workspace)

Keep the route `/playground`. Add what Askr has, then what it does not.

**Persistence (Postgres, wallet-scoped)**
- Tables `conversations(id, address, title, model, mode, created_at, updated_at, deleted_at)` and `messages(id, conversation_id, role, content jsonb, model, credits, tokens_in, tokens_out, created_at)`. Creations (images, videos) become rows in `creations(id, address, conversation_id, kind, url, prompt, model, credits, created_at)`.
- Left sidebar: conversation list, search, rename, delete, "new chat". Delete is hard delete of messages, and the privacy policy says so.
- Only the last 20 messages go to the model (same as Askr). Message cap 48,000 chars. Reply cap 8,192 tokens. 20 turns per minute per wallet (`/api/playground` already rate-limits per wallet; expose the number).

**Model switching and compare**
- Switching model mid-conversation keeps the transcript. Each message records the model that answered it.
- Compare mode: one prompt to two models side by side, both billed, cost shown under each. Askr does not have this.

**Input**
- Attach images to vision models and text files (`.txt .md .csv .json`, 200 KB) to any model. Reuse `estimateInputTokens` flat-cost accounting from `budget.ts`.
- Voice: dictation with the browser Web Speech API and read-aloud with `speechSynthesis`. Nothing leaves the browser, and the privacy page says so.
- System prompt presets (Plain, Coder, Reviewer, Translator) plus a custom one, stored per conversation.

**Cost**
- Per-turn credits chip on every assistant message, session total in the header, balance in the corner. Already partly there via `x-kredit-credits-charged`.

**Library**
- `/playground/library`: grid of every image and video the wallet made, with prompt, model, credits, download, delete.

**Docs**: rewrite `platform/playground` as "Workspace" and add a "Limits" table.

## Phase 4: CLI

- Folder `cli/` in this repo, own `package.json`, published to npm as `kredit` (check the name is free; fallback `kredit-cli`). Bin name `kredit`. Node 22+, ESM, **zero dependencies** (fetch, readline, and `node:crypto` are enough).
- Config at `~/.kredit/config.json`, mode 0600: `{ baseUrl, key, address }`.

**Login (device flow, wallet stays in the browser)**
1. `kredit login` calls `POST /api/cli/device` and gets `{ code, verifyUrl, expiresAt }` (8-char code, 10 minutes).
2. It prints the URL and opens it. `/cli/verify?code=` asks the wallet to sign in (existing SIWE flow) and to approve "CLI on <hostname>".
3. Approval creates a normal `kred_sk_` key named "CLI on <hostname>" and stores it against the code for one pickup.
4. The CLI polls `GET /api/cli/device/<code>` every 3 s; on success it stores the key and prints the balance.
5. `kredit login --key kred_sk_…` for people who already have a key.
- New tables `cli_device_codes(code, address, key_id, approved_at, claimed_at, expires_at)`.

**Commands**
| Command | Does |
| --- | --- |
| `kredit login` / `logout` | Above |
| `kredit whoami` | Address, key name, balance from `GET /v1/account` |
| `kredit models [--type image] [--maker openai] [--cheap]` | Table from `GET /v1/models` |
| `kredit chat [-m model]` | Interactive streaming chat, `/model` to switch, `/cost` to see the running total |
| `kredit ask "prompt" [-m model]` | One shot, also reads stdin, so `cat file \| kredit ask "summarise"` works |
| `kredit image "prompt" [--size]` | Saves the file, prints path and credits |
| `kredit keys list / create <name> / revoke <id>` | Hits `/api/keys` with the session or key |
| `kredit usage [--days 7]` | From `GET /v1/usage` |
| `kredit config set base-url <url>` | For self-hosted or local dev |
- Every command prints `credits charged` and `balance` from the response headers.
- Docs page `integrations/cli`. Landing gets three doors like Askr: Workspace, CLI, API.
- Tests: a script in `scripts/cli-test.mjs` that runs the CLI against a local `next start` with the echo model.

## Phase 5: privacy policy and terms of service

Routes `/privacy` and `/terms` under `(site)`, footer links on every page, a "Legal" group in the docs sidebar, and a line "Checked against the code on <date>" at the top of each, updated whenever the code changes what they describe.

**Privacy policy covers**
- What we store: wallet address, optional display name, hashed API keys, server-side sessions, the ledger (every credit in and out), usage rows (model, tokens, credits, never the prompt), workspace conversations and creations (only if you use the workspace, delete any time), referral cookie (30 days), CLI device codes (10 minutes).
- What we never store: API prompts and answers. They are forwarded and dropped. Voice never leaves the browser.
- What is public: the distribution board (address or display name, totals, source breakdown, a single "used" total), on-chain receipts. What is not: models used, prompts, individual calls.
- Third parties, named: Vercel AI Gateway and the model makers behind it (receive the prompt, not the wallet), Neon (database), Render (hosting), Blockscout and the RPC (read the chain record), Chainlink (price feed), Uniswap and USDG contracts (top-ups). No analytics, no ads.
- Training: nothing you send trains a model, ours or anyone's, and our upstream agreement says the same.
- Retention: sessions 7 days, logs rotate, ledger forever (it is money), conversations until you delete them.
- Your rights: export (`npm run backup` shape as JSON from the settings page), delete workspace data, delete display name, revoke keys, sign out everywhere. Contact address.

**Terms of service covers**
- Credits are prepaid access to model usage, not money, not a token, not a security. 1,000 credits = $1 of usage at the published rate. No withdrawal, no refund, no expiry.
- Earning is a sponsored rewards programme with published rules (`/docs/rules`, `/docs/fairness`). We may change rates for future activity, never for credits already claimed. Manipulation (sybil wallets, self-referral, wash transactions) forfeits unclaimed rewards and may close the account.
- Acceptable use follows the upstream model makers' policies. Rate limits are as documented. Keys are yours to protect; spend by a leaked key is spend.
- Availability: best effort, free plan hosting, no SLA. Liability capped at credits bought in the last 30 days.
- Governing law: see open questions.

## Phase 6: farm-proof by design

Everything below is a pure rule in `src/lib/` with a unit test, documented on a new `/docs/fairness` page, and bumps `RULES_VERSION` to 2 so old receipts stay valid.

Already in place: daily task cap 1,000, only 20 tx/day count toward milestones, every tx and milestone pays once, streaks need calendar days, mainnet only, spend guard and holds on the API side, on-chain receipts.

New rules:
1. **Wallet age**: first claim needs the wallet's first mainnet transaction to be at least 3 days old.
2. **Dust filter**: a transfer pays only if it moves at least $0.01 of value or costs at least 100,000 gas. A contract call pays only if it costs at least 21,000 gas beyond a plain transfer.
3. **Diversity decay**: on one UTC day, calls to the same contract pay in full for the first 5, half for the next 5, nothing after 10. Deploys are limited to 2 paid per day.
4. **Referral integrity**: the referrer earns only after the referred wallet has 3 active days and a first claim of at least 100 credits; the same address, session cookie or IP hash cannot refer itself; referral earnings cap at 2,000 credits per referrer per day.
5. **Emissions budget**: a published global cap of 250,000 task credits per UTC day. If claims exceed it, every claim that day scales pro rata and the distribution board shows the day's fill. Milestones, streaks and top-ups are outside the budget.
6. **Risk hold**: a claim over 2,000 credits from a wallet under 7 days old, or whose transactions are 90%+ against one contract, is held 24 hours and shown as "under review" on the dashboard. Holds are released automatically unless flagged.
7. **Endpoint limits**: scan 6/min, claim 3/min per wallet, both per IP too.
8. **Public proof**: every rule with its number on `/docs/fairness`, every claim as an on-chain receipt, the distribution board unchanged.

## Phase 7: wrap end to end

- README rewritten as a product README: what Kredit is, the three doors (workspace, CLI, API), earn rules link, env table, run locally, run with Docker, tests, backup.
- Docs nav gains: Models, Workspace, CLI, Fairness, Legal. `docs/understood.md` refreshed to match.
- `openapi.json` updated for the prefix and the CLI device endpoints.
- `npm test` green, `npm run lint` green, `npm run build` green, `scripts/platform-test.mjs` extended for the new rules, `scripts/cli-test.mjs` added.
- Render: switch is already on `main`; the user adds `DATABASE_URL` and the mainnet variables listed in `.env.example`.
- Launch checklist: `/models`, `/playground`, `/privacy`, `/terms`, `/docs/fairness`, `npx kredit login` all work on https://usekredit.space.

## Order and what "done" means

1. Prefix (half a day). Done when a new key starts with `kred_sk_` and old keys still call the API.
2. Legal pages (one day). Done when the footer links resolve and the docs sidebar shows Legal.
3. Farm-proof rules (two days). Done when every rule has a test and `/docs/fairness` lists it.
4. `/models` (one day). Done when counts are live and "Try in playground" preselects the model.
5. Workspace (three to four days). Done when a reload keeps the chat, compare mode bills both models, and the library shows creations.
6. CLI (two days). Done when `npx kredit login` completes the device flow on usekredit.space and `kredit ask` streams.
7. Wrap (one day). Done when the launch checklist passes.

Every step lands on `main` directly, one commit per step, build and tests green before the push.

## Open questions

1. **Margin**: Askr charges 0% today. Ours is 20%. Keep 20% (earned credits are sponsored, so the margin funds them) or drop to 10% and say so on the pricing page. Recommendation: keep 20%, publish it, and show the per-turn price on `/models` so nobody is surprised.
2. **Governing law** for the terms. Needs a country and a contact email.
3. **npm name**: `kredit` may be taken. Fallback `kredit-cli`.
