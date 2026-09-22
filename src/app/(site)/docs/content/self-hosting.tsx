import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { ECHO_MODEL } from "@/lib/gateway";
import { Callout, Doc, H2, H3, Param, Params, Step, Steps, Table } from "../ui";

// Running your own Kredit, written from .env.example, Dockerfile,
// docker-compose.yml, render.yaml, scripts/backup.mjs and package.json.

export function Configuration() {
  return (
    <Doc slug="self-hosting/configuration" lede="Kredit is one Next.js server and one SQLite file. Everything else is configured with environment variables; copy .env.example to .env.local and fill in what you use.">
      <H2>Required</H2>
      <Params>
        <Param name="SESSION_SECRET" type="string" required>
          Signs session and nonce cookies. At least 32 characters; the server refuses to start sessions otherwise.{" "}
          <code>openssl rand -hex 32</code> makes a good one.
        </Param>
      </Params>

      <H2>The AI provider</H2>
      <Params>
        <Param name="UPSTREAM_BASE_URL" type="url">
          Where <code>/v1</code> calls and the model list go. Defaults to <code>https://ai-gateway.vercel.sh/v1</code>{" "}
          (Vercel AI Gateway): one key reaches every maker, and its public model list carries the prices calls are
          billed from. OpenRouter works too; images and video need the Vercel gateway.
        </Param>
        <Param name="UPSTREAM_API_KEY" type="string">
          The provider key. Without it only <code>{ECHO_MODEL}</code> answers and real models return{" "}
          <code>503 provider_not_configured</code>.
        </Param>
      </Params>

      <H2>Wallets and chains</H2>
      <Params>
        <Param name="NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" type="string · build time">
          Free from cloud.reown.com. With it the wallet list offers MetaMask, Rainbow, WalletConnect, Rabby, Trust,
          OKX, Ledger and more, including phone wallets by QR code. Without it, browser wallets and Coinbase only.
          Read when the site is built, so rebuild after changing it.
        </Param>
        <Param name="NEXT_PUBLIC_RPC_MAINNET" type="url · build time">
          Optional private RPC (for example Alchemy) for Robinhood Chain. Used in the browser, so restrict the key to
          your domain.
        </Param>
        <Param name="EXPLORER_API_MAINNET" type="url">
          Where the scanner reads wallet history (Blockscout API v2). Defaults to the public Robinhood Chain
          explorer.
        </Param>
        <Param name="BLOCKSCOUT_API_KEY" type="string">
          Sent as <code>apikey</code> on explorer requests. The public mainnet explorer blocks anonymous server
          requests, so set this or point the explorer variable at your own indexer.
        </Param>
      </Params>

      <H2>On-chain receipts</H2>
      <Params>
        <Param name="RECEIPTS_ADDRESS_MAINNET" type="address">
          The deployed <code>KreditReceipts</code> contract. Empty means claims on that network stay off-chain. The
          reference deployment on Robinhood Chain is <code>0x46C668199e07eDD479A9309B0866cD6900E88bdD</code>.
        </Param>
        <Param name="RECEIPT_SIGNER_KEY" type="0x… private key">
          A 32-byte key whose address is the contract&apos;s <code>signer</code>. It signs receipts and nothing else;
          it holds no funds.
        </Param>
        <Param name="RECEIPTS_FROM_BLOCK_MAINNET" type="integer">
          Where to start searching for <code>Claimed</code> events when reconciling. Use the deployment block
          (69528429 for the reference deployment) to keep the search short.
        </Param>
      </Params>

      <H2>Buying credits</H2>
      <Params>
        <Param name="TOPUP_NETWORK" type="string">
          Defaults to <code>mainnet</code>.
        </Param>
        <Param name="TOPUP_TOKEN_ADDRESS · TOPUP_TOKEN_SYMBOL · TOPUP_TOKEN_DECIMALS" type="address · string · integer">
          The ERC-20 that buys credits. Symbol defaults to <code>TOKEN</code>, decimals to 18 (0 to 36 allowed).
        </Param>
        <Param name="TOPUP_TREASURY_ADDRESS" type="address">
          Where payments go. The server credits only transfers of that token, from the signed-in wallet, to this
          address.
        </Param>
        <Param name="TOPUP_CREDITS_PER_TOKEN" type="number">
          For example <code>100</code>: one token buys 100 credits, $0.10 of AI usage. Buying stays off until the
          token, treasury and price are all set.
        </Param>
      </Params>

      <H2>Data</H2>
      <Params>
        <Param name="DATABASE_PATH" type="path">
          The SQLite file. Defaults to <code>data/kredit.db</code>; the directory is created. A legacy{" "}
          <code>fuel.db</code> beside it is moved over on first open. <code>:memory:</code> works for tests.
        </Param>
        <Param name="BACKUP_DIR · BACKUP_KEEP" type="path · integer">
          For the backup script: destination (default <code>backups</code> next to the database) and how many to
          keep (default 14).
        </Param>
      </Params>
      <Callout>
        <p>
          The ledger is one SQLite file, and rate limits and credit holds live in memory, so run{" "}
          <strong>one server process</strong>. Scale the AI provider, not Kredit.
        </p>
      </Callout>
    </Doc>
  );
}

export function Docker() {
  return (
    <Doc slug="self-hosting/docker" lede="One image, one container, one volume for the ledger. Secrets stay in .env.local and never enter the image.">
      <Steps>
        <Step title="Configure">
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> and set at least <code>SESSION_SECRET</code>{" "}
            and <code>UPSTREAM_API_KEY</code>. See <Link href="/docs/self-hosting/configuration">Configuration</Link>.
          </p>
        </Step>
        <Step title="Build and start">
          <CodeBlock title="Shell" code={`docker compose --env-file .env.local up -d --build\n\n# then open http://localhost:4000`} />
          <p>
            Set <code>KREDIT_PORT</code> to publish a different port. The container restarts on its own unless you
            stop it.
          </p>
        </Step>
        <Step title="Check it">
          <CodeBlock title="Shell" code={`curl http://localhost:4000/api/health\n# {"ok":true}`} />
        </Step>
      </Steps>

      <H2>What the image does</H2>
      <Table
        head={["Item", "Value"]}
        rows={[
          ["Base", "node:24-slim, three stages: deps, build, run"],
          ["Build arguments", "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and NEXT_PUBLIC_RPC_MAINNET are baked into the browser bundle at build time"],
          ["Runtime", "Next standalone output, running as the unprivileged node user"],
          ["Port", "3000 inside the container; compose publishes 4000 by default"],
          ["Data", "DATABASE_PATH=/app/data/kredit.db on the named volume kredit-data"],
          ["Health check", "GET /api/health every 30 s, 5 s timeout, 20 s start period, 3 retries"],
          ["Secrets", ".env.local is read at run time through env_file and is never copied into the image"],
        ]}
        min="28rem"
      />
      <p>
        The dependency stage carries a compiler only because two small native modules behind the wallet SDKs have
        no prebuilt binary for this Node version. Nothing of it reaches the runtime image.
      </p>

      <H2>Everyday commands</H2>
      <CodeBlock
        title="Shell"
        code={`# rebuild after pulling new code
docker compose --env-file .env.local up -d --build

# back up the ledger from inside the container
docker compose exec kredit node scripts/backup.mjs

# logs
docker compose logs -f kredit

# stop (keeps the data)
docker compose down

# stop and DELETE the ledger volume
docker compose down -v`}
      />
      <Callout kind="warn">
        <p>
          <code>docker compose down -v</code> deletes every credit ever earned on this server. Back up first; see{" "}
          <Link href="/docs/self-hosting/data">Data and backups</Link>.
        </p>
      </Callout>
    </Doc>
  );
}

export function Render() {
  return (
    <Doc slug="self-hosting/render" lede="The repository ships a Render Blueprint. It gives the server a persistent disk, so the ledger survives deploys.">
      <Steps>
        <Step title="Create the service">
          <p>
            In Render, choose <em>New → Blueprint</em>, point it at the repository, and accept{" "}
            <code>render.yaml</code>. It defines one web service named <code>kredit</code> on the starter plan, Node
            24, a single instance, and a 1 GB disk mounted at <code>/var/data</code>.
          </p>
        </Step>
        <Step title="Fill in the secrets">
          <p>
            The blueprint generates <code>SESSION_SECRET</code> for you and sets <code>DATABASE_PATH</code> to{" "}
            <code>/var/data/kredit.db</code>. Set <code>UPSTREAM_API_KEY</code>, and optionally{" "}
            <code>UPSTREAM_BASE_URL</code>, <code>BLOCKSCOUT_API_KEY</code> and{" "}
            <code>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code>, in the Render dashboard.
          </p>
        </Step>
        <Step title="Deploy">
          <p>
            Render runs <code>npm ci && npm run build</code>, starts with <code>npm run start</code>, and checks{" "}
            <code>/api/health</code>. Pushes to the configured branch deploy automatically.
          </p>
        </Step>
      </Steps>
      <Callout kind="warn" title="Free plan">
        <p>
          Render&apos;s free plan has no disk, so on it the SQLite file is lost on every restart and deploy. Use the
          blueprint&apos;s plan with a disk once real credits are at stake.
        </p>
      </Callout>
      <p>
        Any host that runs Node 22.13 or newer and keeps one directory on persistent storage works the same way:
        build, start, point <code>DATABASE_PATH</code> at that directory.
      </p>
    </Doc>
  );
}

export function Data() {
  return (
    <Doc slug="self-hosting/data" lede="All state is one SQLite file. Back it up, and you have backed up every credit, key and claim.">
      <H2>The database</H2>
      <ul>
        <li>Node&apos;s built-in <code>node:sqlite</code>, in WAL mode with foreign keys on. One connection per process.</li>
        <li>
          Writes that must not race (claims, key creation, spending, top-ups) run in <code>BEGIN IMMEDIATE</code>{" "}
          transactions, which also lock out other processes.
        </li>
        <li>Schema is created on first open and migrated in place; there is nothing to run by hand.</li>
      </ul>
      <Table
        head={["Table", "Holds"]}
        rows={[
          [<code key="a">ledger</code>, "Every credit movement. A balance is the sum of a wallet's rows."],
          [<code key="a">claimed_txs · claimed_milestones · claimed_streak_days</code>, "What has been paid, so it is never paid twice."],
          [<code key="a">referrals</code>, "Who invited whom, with running totals."],
          [<code key="a">pending_claims</code>, "Signed on-chain receipts waiting to be confirmed."],
          [<code key="a">api_keys · usage</code>, "Key hashes and every billed call."],
          [<code key="a">topups</code>, "Token payments, once each."],
          [<code key="a">sessions · spent_nonces</code>, "Sign-in state."],
          [<code key="a">profiles</code>, "Display names."],
        ]}
        min="30rem"
      />

      <H2>Backups</H2>
      <CodeBlock
        title="Shell"
        code={`npm run backup
# or, in Docker
docker compose exec kredit node scripts/backup.mjs

# backups/kredit-2026-09-22T101500Z.db  (VACUUM INTO: a consistent copy without stopping writers)`}
      />
      <ul>
        <li>Each copy is checked with <code>PRAGMA integrity_check</code> and its ledger rows counted; a bad copy is deleted and the script exits 1.</li>
        <li>The newest 14 copies are kept (<code>BACKUP_KEEP</code>); the destination is <code>BACKUP_DIR</code> or a <code>backups</code> folder beside the database.</li>
        <li>Run it from cron and copy the folder off the server. A backup on the same disk does not survive losing that disk.</li>
      </ul>
      <H2>Restoring</H2>
      <p>
        Stop the server, replace the database file with a backup, start the server. Because nothing outside the
        file is authoritative, that is the whole procedure. Holds and rate-limit windows live in memory and simply
        start empty.
      </p>
    </Doc>
  );
}

export function Testing() {
  return (
    <Doc slug="self-hosting/testing" lede="Every money rule has a unit test, and the flows that touch a wallet, a chain or a provider have end-to-end scripts.">
      <H2>Unit tests</H2>
      <CodeBlock title="Shell" code={`npm test          # node --test src/lib/*.test.ts\nnpm run lint\nnpx tsc --noEmit`} />
      <p>
        Cover scoring, streaks, the ledger (claims, caps, milestones, keys, spending), referrals, pricing, the spend
        budget, distribution, sessions, top-ups and receipt hashing. They need no network and no secrets.
      </p>

      <H2>End-to-end scripts</H2>
      <p>
        Each talks to a running server at <code>BASE_URL</code> (default <code>http://localhost:3000</code>). The
        ones that sign in forge a session cookie locally, so the script and the server must share{" "}
        <code>SESSION_SECRET</code> and <code>DATABASE_PATH</code>. Local testing only: real users sign with their
        wallet.
      </p>
      <Table
        head={["Script", "Checks", "Needs"]}
        rows={[
          [<code key="a">npm run test:auth</code>, "Real SIWE sign-in with throwaway keys, nonce replay refused, sign out everywhere.", "A server"],
          [<code key="a">npm run test:gateway</code>, "Scan → claim → key → echo call → headers → revoke, with a real active wallet.", "Shared secret and database; off-chain claims"],
          [<code key="a">npm run test:referrals</code>, "Invite link cookie, naming an inviter once, the rules.", "Shared secret and database"],
          [<code key="a">npm run test:platform</code>, "Every page renders, redirects, display names, playground, board, top-up gating.", "Shared secret and database"],
          [<code key="a">npm run test:guard</code>, "The spend guard under concurrent calls, against a fake provider the script runs itself.", "Server pointed at the mock provider"],
          [<code key="a">npm run test:receipts</code>, "Signed receipt → on-chain claim → confirm → replay → recovery.", "anvil, the mock explorer, a deployed contract"],
          [<code key="a">npm run test:contracts</code>, "The Solidity tests, including the hash that must match the server's.", "Foundry"],
          [<code key="a">npm run demo</code>, "Streams text, saves an image and a video through a real provider. Spends real money, well under $1.", "A real provider key"],
        ]}
        min="36rem"
      />
      <H3>Running a test server</H3>
      <CodeBlock
        title="Shell"
        code={`DATABASE_PATH=/tmp/kredit-test.db npx next dev -p 3461
DATABASE_PATH=/tmp/kredit-test.db BASE_URL=http://localhost:3461 npm run test:gateway`}
      />
      <Callout>
        <p>
          Continuous integration runs lint, typecheck, unit tests and a production build on every pull request and
          every push to the main branch. It needs no secrets.
        </p>
      </Callout>
    </Doc>
  );
}
