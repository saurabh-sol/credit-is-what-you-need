import Link from "next/link";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { HISTORY_SENT, MAX_CONVERSATIONS, MAX_CREATIONS, MAX_MESSAGE_CHARS } from "@/lib/workspace-limits";
import { Callout, Doc, Endpoint, H2, number, Table } from "../ui";

// The signed-in product and the public board, written from src/lib/session.ts,
// the dashboard pages and the playground routes.

export function SignIn() {
  return (
    <Doc slug="platform/sign-in" lede="Sign in with an email code, Google, or a wallet you already have. Either way your account is a wallet address, and the sign-in costs nothing.">
      <H2>Three ways in, one kind of account</H2>
      <p>
        The sign-in dialog is run by <a href="https://privy.io">Privy</a>. Pick an email code, Google, or a wallet
        such as MetaMask, Rabby, Coinbase Wallet or any phone wallet by QR code. Every Kredit account is an Ethereum
        address, because credits, keys and claims are all kept against one:
      </p>
      <ul>
        <li>
          <strong>Email or Google.</strong> Privy makes you an embedded wallet at sign-up, in your browser, with a key
          only you hold. That address is your account. It starts with no on-chain history, so it earns nothing from
          the record scan until it is used on Robinhood Chain, but it can buy credits and spend them right away.
        </li>
        <li>
          <strong>Your own wallet.</strong> You sign one free message inside the Privy dialog to prove it is yours.
          No transaction, no gas, no approvals. Its Robinhood Chain history is what the record scan scores.
        </li>
      </ul>

      <H2>What happens after the dialog</H2>
      <ol>
        <li>
          The browser sends Privy&apos;s short-lived access token and the wallet address to{" "}
          <code>POST /api/auth/privy</code>.
        </li>
        <li>
          The server checks the token against Privy&apos;s public keys for this app, then asks Privy which wallets
          belong to that person. The address is accepted only if it is one of them.
        </li>
        <li>
          You get a session: a signed cookie that names a row in the server&apos;s database. It lasts{" "}
          <strong>seven days</strong>. Privy&apos;s own login lasts longer, so a return visit after that just
          refreshes the cookie without asking you anything.
        </li>
      </ol>

      <H2>Transactions</H2>
      <p>
        Claiming on-chain and buying credits send a transaction from the signed-in address. An embedded wallet signs
        it in a Privy prompt; an external wallet signs it in its own window. The app knows Robinhood Chain and Base.
      </p>

      <H2>Signing out</H2>
      <p>
        Signing out closes the session row and the Privy login, so the cookie is dead at once even if it was copied.
        Because the cookie only names a row, a server-side revoke ends a session before the cookie expires.{" "}
        <code>POST /api/auth/logout?everywhere=1</code> closes every session of the wallet, in every browser.
      </p>

      <H2>Endpoints</H2>
      <Table
        head={["Route", "What it does"]}
        rows={[
          [<code key="a">POST /api/auth/privy</code>, "{ token, address } → { address }, and the session cookie."],
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
          [<Link key="a" href="/dashboard/settings">Settings</Link>, "Download everything Kredit holds about the wallet, or clear the workspace."],
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
        <kbd className="kbd">K</kbd> anywhere in the app to jump to a page by name.
      </p>
    </Doc>
  );
}

export function Playground() {
  return (
    <Doc slug="platform/playground" title="Workspace" lede="Talk to any model in the browser, keep the conversation, compare two models on the same question, and make pictures and clips. It uses your wallet session, so you never paste a key into a web page, and it is billed exactly like the API.">
      <H2>What it does</H2>
      <ul>
        <li>
          <strong>Every model, one balance.</strong> Pick from the same catalog the API offers; text, image, video and
          evaluation models each get their own mode. The <Link href="/catalog">catalog</Link> opens the workspace
          on any model with one click.
        </li>
        <li>
          <strong>Conversations are kept.</strong> Each chat is saved to your wallet as you go, with the model that
          answered each message, how long it took and what it cost. They follow you across devices and stay until you
          delete them. A chat remembers its model and its system prompt.
        </li>
        <li>
          <strong>Switch models mid-chat.</strong> Change the model in the panel and the next reply comes from it, with
          the whole conversation as context. Each reply says which model wrote it.
        </li>
        <li>
          <strong>Compare two models.</strong> Turn on <em>Compare with a second model</em> and every message goes to
          both. The replies sit side by side, each with its own cost. Both are billed.
        </li>
        <li>
          <strong>Attach files.</strong> Pictures (up to 4 MB each) go to vision models as images; text files (up to
          200 KB) are pasted into the message. Up to four per message. The bytes go to the model and are not kept; only
          the file names are saved with the message.
        </li>
        <li>
          <strong>Voice.</strong> Dictate with the microphone button and read a reply aloud with the speaker button.
          Both use your browser&apos;s own speech engine; no audio reaches Kredit.
        </li>
        <li>
          <strong>System prompt presets.</strong> Plain (the default), Coder, Reviewer, Translator and Explainer, or
          write your own. It is sent ahead of every request and billed like any other text.
        </li>
        <li>
          <strong>Library.</strong> Every picture and clip you make is kept under{" "}
          <Link href="/playground/library">Library</Link> with its prompt, model and cost, until you delete it.
        </li>
        <li>
          <strong>Every cost shown.</strong> Each reply carries its charge; the top bar sums the chat. The charge is the
          one the gateway reports at the end of the stream, so it is exact.
        </li>
      </ul>

      <H2>Limits</H2>
      <Table
        head={["Limit", "Value"]}
        rows={[
          ["Messages sent to the model per turn", `The last ${HISTORY_SENT}`],
          ["Characters per message", number(MAX_MESSAGE_CHARS)],
          ["Files per message", "4: pictures up to 4 MB, text files up to 200 KB"],
          ["Saved conversations per wallet", `${MAX_CONVERSATIONS}; the oldest is dropped past that`],
          ["Pictures and clips kept per wallet", `${MAX_CREATIONS}; the oldest is dropped past that`],
          ["Rate limit", "60 requests per minute per wallet"],
          ["Image sizes", "1024×1024, 1536×1024, 1024×1536"],
          ["Video", "4, 6 or 8 seconds, 720p or 1080p, 16:9 or 9:16"],
        ]}
      />

      <H2>Endpoints behind it</H2>
      <Endpoint method="POST" path="/api/playground" note="session cookie" />
      <Endpoint method="POST" path="/api/playground/media" note="session cookie" />
      <Endpoint method="GET" path="/api/workspace/conversations" note="session cookie" />
      <Endpoint method="POST" path="/api/workspace/conversations" note="session cookie" />
      <Endpoint method="GET" path="/api/workspace/conversations/:id" note="session cookie" />
      <Endpoint method="POST" path="/api/workspace/conversations/:id/messages" note="session cookie" />
      <Endpoint method="DELETE" path="/api/workspace/conversations/:id" note="session cookie" />
      <Endpoint method="GET" path="/api/workspace/creations" note="session cookie" />
      <Endpoint method="DELETE" path="/api/workspace" note="session cookie" />
      <p>
        All answer <code>401</code> when there is no session. They are for the page; scripts should use the{" "}
        <Link href="/docs/api/authentication">API with a key</Link> or the <Link href="/docs/cli">CLI</Link>. In{" "}
        <code>GET /v1/usage</code> workspace calls show <code>{'"key": "playground"'}</code>.
      </p>
      <Callout kind="note" title="Your data">
        <p>
          Download everything or clear the workspace from <Link href="/dashboard/settings">Settings</Link>. What is
          stored is listed in the <Link href="/docs/legal/privacy">privacy policy</Link>.
        </p>
      </Callout>
    </Doc>
  );
}

export function Security() {
  return (
    <Doc slug="platform/security" lede="Kredit holds no funds, asks for no approvals, and stores as little as it can. Here is exactly what it keeps and how it protects it.">
      <H2>Your wallet</H2>
      <ul>
        <li>Signing in never sends a transaction. A wallet signs one message in Privy&apos;s dialog; an email account gets an embedded wallet. Nothing grants an allowance, and signing out revokes the session.</li>
        <li>Privy&apos;s access tokens last about an hour and are checked against Privy&apos;s public keys on every sign-in; the address is accepted only if Privy lists it as that person&apos;s.</li>
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
        <li>Keys are 24 random bytes behind the <code>kred_sk_</code> prefix. Only a SHA-256 hash is stored; the key is shown once.</li>
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
          ["Ledger rows (credits in and out)", "Postgres (Neon)", "Earnings: public on the board. Spending: you, as totals."],
          ["Claimed transaction hashes, milestones, streak days", "Postgres (Neon)", "Server only; used to pay once."],
          ["API key hashes, names, last use", "Postgres (Neon)", "You, on the dashboard."],
          ["Usage rows (model, tokens, credits per call)", "Postgres (Neon)", "You, through the key that made them or the dashboard."],
          ["Sessions", "Postgres (Neon)", "Server only."],
          ["Display name", "Postgres (Neon)", "Public, by your choice."],
          ["Inviter, invited wallets", "Postgres (Neon)", "You and your inviter."],
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
