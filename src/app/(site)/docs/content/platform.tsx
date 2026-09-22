import Link from "next/link";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { Callout, Doc, Endpoint, H2, Table } from "../ui";

// The signed-in product and the public board, written from src/lib/session.ts,
// the dashboard pages, src/lib/distribution.ts and the playground routes.

export function SignIn() {
  return (
    <Doc slug="platform/sign-in" lede="You prove you own a wallet by signing one message. No transaction, no gas, no approvals, nothing to revoke later.">
      <H2>What happens when you connect</H2>
      <ol>
        <li>
          The browser asks the server for a nonce (<code>GET /api/auth/nonce</code>). It is kept in a signed cookie
          for five minutes and works exactly once, so a copied sign-in message cannot be replayed.
        </li>
        <li>
          Your wallet signs a Sign-In with Ethereum message: <em>Sign in to Kredit. This proves you own this wallet
          and costs no gas.</em> The message names this site&apos;s domain, so it is worthless anywhere else.
        </li>
        <li>
          The server verifies the signature (<code>POST /api/auth/verify</code>). Ordinary wallets verify locally.
          Smart wallets, such as a Coinbase smart wallet, are verified on-chain with ERC-1271 and ERC-6492 on Base
          and Robinhood Chain, whichever answers.
        </li>
        <li>
          You get a session: a signed cookie that names a row in the server&apos;s database. It lasts{" "}
          <strong>seven days</strong>.
        </li>
      </ol>

      <H2>Wallets</H2>
      <p>
        Browser wallets and Coinbase Wallet always work. When the operator has set a WalletConnect project id, the
        list also offers Rainbow, MetaMask, WalletConnect, Trust, Rabby, OKX, Zerion, Uniswap, Omni, imToken, Ledger
        and Safe, including phone wallets by QR code. The app knows Robinhood Chain and Base (the latter only so a
        Coinbase smart wallet can sign in).
      </p>

      <H2>Signing out</H2>
      <p>
        Signing out closes the session row, so the cookie is dead at once even if it was copied. Because the cookie
        only names a row, a server-side revoke ends a session before the cookie expires.{" "}
        <code>POST /api/auth/logout?everywhere=1</code> closes every session of the wallet, in every browser.
      </p>

      <H2>Endpoints</H2>
      <Table
        head={["Route", "What it does"]}
        rows={[
          [<code key="a">GET /api/auth/nonce</code>, "A fresh nonce, in a five-minute cookie."],
          [<code key="a">POST /api/auth/verify</code>, "{ message, signature } → { address }, and the session cookie."],
          [<code key="a">GET /api/auth/me</code>, "{ address } of the signed-in wallet, or null."],
          [<code key="a">POST /api/auth/logout</code>, "Ends this session; ?everywhere=1 ends them all."],
        ]}
        min="26rem"
      />
      <Callout>
        <p>
          Every dashboard route checks the session on the server and sends signed-out visitors to the home page.
        </p>
      </Callout>
    </Doc>
  );
}

export function Dashboard() {
  return (
    <Doc slug="platform/dashboard" lede="Every signed-in page, what it shows, and where its numbers come from.">
      <Table
        head={["Page", "What it is for"]}
        rows={[
          [<Link key="a" href="/dashboard">Overview</Link>, "Your address with a copy button; balance, all-time earned, spent and active keys; the six latest activity rows; next steps; and your live transaction count and ETH balance on Robinhood Chain."],
          [<Link key="a" href="/dashboard/earn">Earn</Link>, "Scan your record on Robinhood Chain, read the receipt, claim. Below it, your invite link and the wallets you invited."],
          [<Link key="a" href="/dashboard/credits">Credits</Link>, "The three pricing rules, a table of what typical requests cost, and the top-up card when buying is open."],
          [<Link key="a" href="/dashboard/keys">Keys</Link>, `Create and revoke API keys, up to ${MAX_ACTIVE_KEYS}. A new key is shown once with a ready-to-run curl.`],
          [<Link key="a" href="/dashboard/activity">Activity</Link>, "Every credit that came in or went out, newest first. Claims paid on-chain link to their receipt on Blockscout."],
          [<Link key="a" href="/dashboard/settings">Settings</Link>, "Your display name on the public distribution board."],
        ]}
        min="32rem"
      />

      <H2>Activity kinds</H2>
      <Table
        head={["Chip", "Meaning"]}
        rows={[
          ["Tasks", "A claim: the task credits for N transactions on a network."],
          ["Milestone", "Reached N transactions."],
          ["Streak", "N streak days paid."],
          ["Referral", "10% of a claim by a wallet you invited."],
          ["Bought", "A token top-up."],
          ["Spent", "An AI call, with the model id. Negative."],
        ]}
        min="24rem"
      />
      <p>
        Times show as <em>2 minutes ago</em> for a week, then as dates. Your balance is always the sum of these rows;
        nothing is ever edited, only added.
      </p>

      <H2>Keyboard</H2>
      <p>
        Press <kbd className="kbd">Cmd</kbd> <kbd className="kbd">K</kbd> or <kbd className="kbd">Ctrl</kbd>{" "}
        <kbd className="kbd">K</kbd> anywhere in the app to jump to a page by name. On the distribution board,{" "}
        <kbd className="kbd">/</kbd> focuses the search.
      </p>
    </Doc>
  );
}

export function Playground() {
  return (
    <Doc slug="platform/playground" lede="Talk to any model in the browser. It uses your wallet session, so you never paste a key into a web page, and it is billed exactly like the API.">
      <ul>
        <li>Pick a model from the same catalog the API offers; text, image and video models each get their own mode.</li>
        <li>Every turn is charged with the same pricing function as the API and appears in your activity as <em>Spent</em>.</li>
        <li>
          Rate limit: 60 requests per minute <strong>per wallet</strong>. In <code>GET /v1/usage</code> playground calls
          show <code>{'"key": "playground"'}</code>.
        </li>
        <li>Image sizes offered: 1024×1024, 1536×1024, 1024×1536. Video: 4, 6 or 8 seconds, 720p or 1080p, 16:9 or 9:16.</li>
      </ul>
      <H2>Endpoints behind it</H2>
      <Endpoint method="POST" path="/api/playground" note="session cookie" />
      <Endpoint method="POST" path="/api/playground/media" note="session cookie" />
      <p>
        Both answer <code>401</code> with code <code>not_signed_in</code> and the message{" "}
        <code>Sign in with your wallet to use the playground.</code> when there is no session. They are for the
        page; scripts should use the <Link href="/docs/api/authentication">API with a key</Link>.
      </p>
    </Doc>
  );
}

export function Distribution() {
  return (
    <Doc slug="platform/distribution" lede="Credits are handed out by rules, not by us, so the full list is public: every wallet that earned, how much, and from what. Spending never appears.">
      <H2>What is shown</H2>
      <Table
        head={["Column", "Meaning"]}
        rows={[
          ["#", "Rank by credits earned."],
          ["Wallet", "Display name if set, otherwise the short address, with an identicon and a copy button."],
          ["Credits earned", "Every credit that ever came in: claims, milestones, streaks, referrals and top-ups."],
          ["Worth", "The same in dollars, at 1,000 credits per $1."],
          ["Share", "Percent of every credit ever handed out."],
          ["Sources", "A bar split into Tasks, Milestones, Streaks, Referrals and Bought."],
          ["Paid in", "Tokens paid for top-ups, per symbol."],
          ["Last earned", "When the wallet last earned."],
        ]}
        min="30rem"
      />
      <ul>
        <li>The board shows the top 100 wallets and refreshes every 20 seconds.</li>
        <li>Your own row is pinned at the top with a <em>You</em> chip when you are signed in.</li>
        <li>
          The ticker under the totals lists at most 12 wallets, one line each, the ones using the most credits
          first: what they claimed and, as a single number, what they have used.
        </li>
        <li>Search matches a display name or any part of an address, up to 64 characters.</li>
      </ul>

      <H2>What stays private</H2>
      <p>
        <strong>What you spent credits on.</strong> Models, prompts, images and individual calls are never shown.
        Spending appears only as one <em>used</em> total per wallet in the ticker, and never on the board.
      </p>

      <H2>Display names</H2>
      <p>
        Set one under <Link href="/dashboard/settings">Settings</Link>: 2 to 24 characters, starting with a letter or
        digit, then letters, digits, spaces, dots, dashes or underscores. Leave it empty to show only your address.
      </p>
      <Endpoint method="GET" path="/api/distribution?q=" note="public" />
      <p>
        The same data the board renders: <code>totals</code>, <code>wallets</code> and <code>active</code>. No sign-in
        needed.
      </p>
    </Doc>
  );
}

export function Security() {
  return (
    <Doc slug="platform/security" lede="Kredit holds no funds, asks for no approvals, and stores as little as it can. Here is exactly what it keeps and how it protects it.">
      <H2>Your wallet</H2>
      <ul>
        <li>Signing in is a signature over a message, never a transaction. It grants no allowance and can be revoked by signing out.</li>
        <li>Nonces are single use and expire in five minutes; a captured sign-in message cannot be replayed.</li>
        <li>Sessions are server-side rows named by a signed, httpOnly, same-site cookie. Signing out kills the row, so a copied cookie is dead too.</li>
        <li>
          Top-ups are plain token transfers from your wallet to the treasury, or one call to the swap contract that
          trades your ETH for the token on Uniswap with the treasury as the recipient. Nothing is approved, nothing
          is held.
        </li>
        <li>On-chain receipts are signed by the server and submitted by you. The contract records them; it never holds tokens.</li>
      </ul>

      <H2>API keys</H2>
      <ul>
        <li>Keys are 24 random bytes behind the <code>kredit_sk_</code> prefix. Only a SHA-256 hash is stored; the key is shown once.</li>
        <li>A key can spend its wallet&apos;s credits and read that wallet&apos;s balance and usage. It cannot see other keys, earnings or the wallet&apos;s record.</li>
        <li>Revocation is immediate. Up to {MAX_ACTIVE_KEYS} keys, so one per tool is practical.</li>
        <li>Provider-routing fields in a request (<code>provider</code>, <code>route</code>, <code>byok</code> and friends) are stripped, so a caller cannot change what they are billed for.</li>
      </ul>

      <H2>Spending guards</H2>
      <ul>
        <li>A call is refused before it goes out when the balance cannot cover the prompt and a minimal answer.</li>
        <li>Long answers are held for in advance and the hold is released when the call settles, so concurrent calls cannot overdraw a wallet.</li>
        <li>Failed calls, unreachable providers and provider errors charge nothing.</li>
      </ul>

      <H2>What is stored</H2>
      <Table
        head={["Data", "Where", "Who can see it"]}
        rows={[
          ["Ledger rows (credits in and out)", "SQLite", "Earnings: public on the board. Spending: you, as totals."],
          ["Claimed transaction hashes, milestones, streak days", "SQLite", "Server only; used to pay once."],
          ["API key hashes, names, last use", "SQLite", "You, on the dashboard."],
          ["Usage rows (model, tokens, credits per call)", "SQLite", "You, through the key that made them or the dashboard."],
          ["Sessions and spent nonces", "SQLite", "Server only."],
          ["Display name", "SQLite", "Public, by your choice."],
          ["Inviter, invited wallets", "SQLite", "You and your inviter."],
          ["Prompts and answers", "Not stored", "Passed to the provider, never written down."],
        ]}
        min="34rem"
      />
      <Callout kind="warn" title="Found a problem?">
        <p>
          Kredit is an independent project. Report security issues privately to the operator of the server you are
          using before disclosing them.
        </p>
      </Callout>
    </Doc>
  );
}
