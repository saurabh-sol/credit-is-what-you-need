import Link from "next/link";
import { ECHO_MODEL } from "@/lib/gateway";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD, MARGIN, MIN_CREDITS_PER_REQUEST } from "@/lib/pricing";
import { REFERRAL_PERCENT } from "@/lib/referral-rules";
import { DAILY_TASK_CAP, MILESTONE_TXS_PER_DAY, MILESTONES, RULES_VERSION, TASK_CREDITS } from "@/lib/scoring";
import { STREAK_MAX_BONUS, STREAK_MAX_DAY, STREAK_STEP, streakBonus } from "@/lib/streaks";
import { KeyPanel } from "../key-panel";
import { OriginCode, Quickstart } from "../quickstart";
import { Callout, Card, Cards, Doc, H2, number, Step, Steps, Table } from "../ui";

const marginPercent = Math.round(MARGIN * 100);

export function QuickstartPage() {
  return (
    <Doc slug="quickstart" lede="A wallet, a signature, a key, a request. Five minutes from nothing to a model answering on your credits.">
      <Steps>
        <Step title="Connect your wallet">
          <p>
            Open <Link href="/dashboard">the dashboard</Link> and connect the wallet you use on Robinhood Chain.
            Browser wallets, Coinbase Wallet and, with WalletConnect enabled, phone wallets by QR code all work.
          </p>
        </Step>
        <Step title="Sign one message">
          <p>
            You sign a Sign-In with Ethereum message that reads <em>Sign in to Kredit. This proves you own this
            wallet and costs no gas.</em> No transaction, no gas, no approval. The session lasts seven days.
          </p>
        </Step>
        <Step title="Scan and claim">
          <p>
            On <Link href="/dashboard/earn">Earn</Link>, press <strong>Scan my record</strong>.
            You get a receipt: every task your wallet has done, what it pays, milestones and streak bonus. Press{" "}
            <strong>Claim</strong> and the credits land in your balance. On networks with on-chain receipts, your
            wallet confirms one transaction first.
          </p>
        </Step>
        <Step title="Create an API key">
          <p>
            Under <Link href="/dashboard/keys">Keys</Link>, name a key and create it. Copy it now: it is shown once.
            You can have {MAX_ACTIVE_KEYS} active keys, so make one per tool.
          </p>
          <KeyPanel />
        </Step>
        <Step title="Make a request">
          <p>
            Point any OpenAI client at this host&apos;s <code>/v1</code> and use the key. Start with{" "}
            <code>{ECHO_MODEL}</code>, a built-in model that repeats your message, works on every server and is billed
            by length like a real one.
          </p>
          <Quickstart />
        </Step>
        <Step title="Read the bill">
          <p>
            Every non-streamed response carries <code>x-kredit-credits-charged</code> and{" "}
            <code>x-kredit-balance</code>. That is the whole billing model: no invoices, no surprises, the cost arrives
            with the answer.
          </p>
          <OriginCode
            title="Response headers"
            code={`HTTP/1.1 200 OK
content-type: application/json
x-kredit-credits-charged: 1
x-kredit-balance: 4999`}
          />
        </Step>
      </Steps>

      <H2>Where next</H2>
      <Cards>
        <Card href="/docs/api/models" title="Pick a real model">
          List every model your key can call, with prices in credits.
        </Card>
        <Card href="/docs/integrations" title="Plug it into your tools">
          Cursor, Claude Code, the OpenAI and Anthropic SDKs, the AI SDK, LangChain.
        </Card>
        <Card href="/docs/earn/scoring" title="Earn more">
          What each transaction pays, and the bonuses on top.
        </Card>
        <Card href="/docs/api/billing" title="Understand the price">
          The formula, worked examples, and what happens when a balance runs thin.
        </Card>
      </Cards>
    </Doc>
  );
}

export function HowItWorks() {
  return (
    <Doc slug="how-it-works" lede="Kredit is a loop: activity on Robinhood Chain becomes credits, credits pay for AI, and every step is checked by rules anyone can read.">
      <OriginCode
        title="The loop"
        code={`wallet activity on chain ──scan──▶ receipt ──claim──▶ credits ──API key / playground──▶ AI answers
                                                       ▲
                       streak bonus, referral shares, token top-ups ┘`}
      />

      <H2>1. Your record is read from the chain</H2>
      <p>
        When you scan, the server asks the Robinhood Chain explorer for the transactions your wallet <em>sent</em>,
        up to the latest 1,000. Only transactions you signed count; incoming transfers and other people&apos;s calls
        do not. Pending transactions are skipped. The scan is remembered for 60 seconds so that claiming right after
        scanning pays exactly what the receipt showed. See <Link href="/docs/earn/record">Your on-chain record</Link>.
      </p>

      <H2>2. Fixed rules turn transactions into credits</H2>
      <p>
        Each successful transaction is a task: a deployment pays {TASK_CREDITS.deploy}, a contract call{" "}
        {TASK_CREDITS.contract_call}, a plain transfer {TASK_CREDITS.transfer}. Failed transactions pay nothing. On top
        come one-time milestones, a daily streak bonus, and a cap of {number(DAILY_TASK_CAP)} task credits per wallet
        per day. The rules are versioned (<code>RULES_VERSION = {RULES_VERSION}</code>) and every number on this site is
        read from the same code that does the scoring. See <Link href="/docs/earn/scoring">Tasks and milestones</Link>.
      </p>

      <H2>3. Everything pays once</H2>
      <p>
        A transaction hash can be claimed one time, ever, by anyone, on that network. Milestones and streak days pay
        once each. The daily cap holds across claims. Scan as often as you like; a second claim only pays for new
        activity. Claims are planned and written in one database transaction, so two claims racing each other cannot
        both be paid for the same work. See <Link href="/docs/earn/claims">Claims and receipts</Link>.
      </p>

      <H2>4. Credits are a ledger</H2>
      <p>
        Your balance is the sum of your ledger rows: claims, milestones, streak bonuses, referral shares and top-ups
        are positive, spending is negative. Nothing is ever edited, only added. What you earn is public on the{" "}
        <Link href="/docs/platform/distribution">distribution board</Link>; what you spend it on is not.
      </p>

      <H2>5. Credits pay for AI</H2>
      <p>
        {number(CREDITS_PER_USD)} credits buy $1 of AI usage. A key or the playground calls any model the server
        offers; the call costs what the provider charged plus a {marginPercent}% service fee, at least{" "}
        {MIN_CREDITS_PER_REQUEST} credit, and the bill arrives in the response headers. Kredit never lets an answer
        die halfway because credits ran out: a thin balance shortens the answer before the call goes out. See{" "}
        <Link href="/docs/api/billing">Pricing and billing</Link>.
      </p>

      <H2>What Kredit is not</H2>
      <ul>
        <li>Not a token. Credits are an off-chain ledger you spend on AI; they are not transferable.</li>
        <li>Not custodial. Signing in costs no gas and grants no approvals. Top-ups go from your wallet straight to the treasury.</li>
        <li>Not affiliated with Robinhood. Kredit is an independent project built on Robinhood Chain.</li>
      </ul>
    </Doc>
  );
}

export function Rules() {
  return (
    <Doc slug="rules" lede="Every number the platform runs on, read from the code at render time. If a rule changes, this page changes with it.">
      <H2>Credits</H2>
      <Table
        head={["Rule", "Value"]}
        rows={[
          ["Credit value", `${number(CREDITS_PER_USD)} credits = $1 of AI usage`],
          ["Service fee on AI calls", `${marginPercent}% on top of the provider's price`],
          ["Minimum charge per call", `${MIN_CREDITS_PER_REQUEST} credit`],
          ["Rounding", "Up to the next whole credit"],
          ["Failed calls", "Free"],
        ]}
      />
      <H2>Earning</H2>
      <Table
        head={["Rule", "Value"]}
        rows={[
          ["Deploy a contract", `${TASK_CREDITS.deploy} credits`],
          ["Call a contract", `${TASK_CREDITS.contract_call} credits`],
          ["Send a transfer", `${TASK_CREDITS.transfer} credits`],
          ["Use a partner protocol", "Set per partner (none listed yet)"],
          ["Failed transaction", "0 credits"],
          ["Milestones", MILESTONES.map((m) => `${m.txs} txs → ${number(m.credits)}`).join(" · ")],
          ["Transactions per day counted toward milestones", `${MILESTONE_TXS_PER_DAY}`],
          ["Daily cap on task credits", `${number(DAILY_TASK_CAP)} per wallet per UTC day`],
          ["Streak bonus", `${STREAK_STEP} × streak day from day 2, at most ${STREAK_MAX_BONUS} a day (day ${STREAK_MAX_DAY}+); day 2 = ${streakBonus(2)}, day 5 = ${streakBonus(5)}`],
          ["Referral share", `${REFERRAL_PERCENT}% of every claim by a wallet you invited, rounded down`],
          ["Scan depth", "Latest 1,000 transactions your wallet sent"],
          ["Scan cache", "60 seconds"],
          ["Rules version on receipts", `${RULES_VERSION}`],
        ]}
      />
      <H2>Spending</H2>
      <Table
        head={["Rule", "Value"]}
        rows={[
          ["Rate limit", "60 requests per minute per key; 60 per minute per wallet in the playground"],
          ["Active API keys", `${MAX_ACTIVE_KEYS} per wallet`],
          ["Smallest answer before a call is refused", "16 output tokens"],
          ["Images per request", "1 to 4"],
          ["Video length", "1 to 20 seconds"],
        ]}
      />
      <H2>Accounts</H2>
      <Table
        head={["Rule", "Value"]}
        rows={[
          ["Session length", "7 days"],
          ["Sign-in nonce", "5 minutes, single use"],
          ["Invite link cookie", "30 days"],
          ["Signed on-chain receipt", "Good for 10 minutes"],
          ["Display name", "2 to 24 letters, digits, spaces, dots, dashes or underscores"],
        ]}
      />
      <Callout kind="tip">
        <p>
          Want to see the rules applied to an imagined history? The{" "}
          <Link href="/#estimate">estimator on the home page</Link> runs the real scoring function on the sliders you
          set.
        </p>
      </Callout>
    </Doc>
  );
}
