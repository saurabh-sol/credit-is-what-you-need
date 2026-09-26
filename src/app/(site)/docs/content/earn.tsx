import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { CREDITS_PER_USD } from "@/lib/pricing";
import { REFERRAL_DAILY_CAP, REFERRAL_MIN_ACTIVE_DAYS, REFERRAL_MIN_CLAIM } from "@/lib/fairness";
import { REFERRAL_PERCENT } from "@/lib/referral-rules";
import { DAILY_TASK_CAP, MILESTONE_TXS_PER_DAY, MILESTONES, RULES_VERSION, TASK_CREDITS } from "@/lib/scoring";
import { STREAK_MAX_BONUS, STREAK_MAX_DAY, STREAK_STEP, streakBonus } from "@/lib/streaks";
import { OriginCode } from "../quickstart";
import { Callout, Doc, Endpoint, H2, number, Param, Params, Step, Steps, Table } from "../ui";

// The earning side, written from src/lib/scoring.ts, streaks.ts, referrals.ts,
// receipts.ts and topup.ts. Numbers are imported so they cannot drift.

export function Record() {
  return (
    <Doc slug="earn/record" lede="The scanner reads what your wallet has done on Robinhood Chain and turns it into a receipt. Nothing is guessed: every line traces back to a transaction hash.">
      <H2>What is read</H2>
      <ul>
        <li>
          Transactions your wallet <strong>sent</strong>, read from Robinhood Chain itself through the RPC&apos;s
          transaction index (zero-value calls and deployments included). Incoming transfers and calls other
          people made do not count.
        </li>
        <li>
          Up to the latest <strong>1,000 transactions</strong> (20 pages of 50). Beyond that the receipt says{" "}
          <em>Only your latest 1,000 transactions were read.</em>
        </li>
        <li>Pending transactions are skipped. Failed ones are counted, so you can see them, but pay nothing.</li>
        <li>
          For each transaction: the hash, time, success, the recipient and whether it is a contract, the contract&apos;s
          name and decoded method when the explorer knows them, a created contract if it was a deployment, and the fee.
        </li>
      </ul>

      <H2>Networks</H2>
      <Table
        head={["Network", "Explorer", "Note"]}
        rows={[
          ["Robinhood Chain", <code key="a">robinhoodchain.blockscout.com</code>, "With an Alchemy RPC the scanner reads history from the chain itself; otherwise the public explorer blocks server requests and an operator sets a Blockscout API key or their own indexer."],
        ]}
        min="30rem"
      />
      <p>
        Kredit runs on Robinhood Chain mainnet only. A server that cannot scan it answers with a clear message
        instead of an empty receipt.
      </p>

      <H2>The receipt</H2>
      <p>Lines appear in a fixed order, grouped by kind:</p>
      <ol>
        <li>
          One line per kind of task: <em>Deployed 2 contracts</em>, <em>1 partner protocol use</em>,{" "}
          <em>12 contract interactions</em>, <em>30 transfers</em>.
        </li>
        <li>
          A negative <em>Daily cap ({number(DAILY_TASK_CAP)} per day)</em> line when any day earned more than the
          cap.
        </li>
        <li>
          One <em>Reached N transactions</em> line per milestone you have hit.
        </li>
        <li>
          A <em>Streak bonus (N days in a row)</em> line when you have consecutive active days.
        </li>
      </ol>
      <CodeBlock
        title="Example receipt"
        code={`Deployed 1 contract                 +500
14 contract interactions            +700
30 transfers                        +300
Daily cap (1000 per day)            -120
Reached 10 transactions             +100
Streak bonus (5 days in a row)      +140
────────────────────────────────────────
TOTAL CREDITS                       1,620   ≈ $1.62 of AI usage`}
      />

      <H2>Caching</H2>
      <p>
        A scan costs several explorer requests, so its result is kept for <strong>60 seconds</strong> per wallet and
        network. Claiming inside that minute pays exactly what the receipt showed. Scanning again after it refreshes.
      </p>

      <H2>From your own code</H2>
      <Endpoint method="GET" path="/api/record?network=mainnet" note="session cookie" />
      <p>
        Answers the receipt for the signed-in wallet: <code>lines</code>, <code>total</code>, the 25 latest{" "}
        <code>tasks</code>, <code>successfulTxs</code>, <code>failedTxs</code>, <code>gasSpentWei</code>,{" "}
        <code>truncated</code>, <code>claimable</code> (what a claim would pay right now) and <code>onchain</code>{" "}
        (the receipts contract and chain id when claims on that network are on-chain, otherwise <code>null</code>).
        You can only scan the wallet you signed in with.
      </p>
      <OriginCode title="Terminal" code={`# Scan any address without signing in (prints the receipt)\nnode scripts/scan.ts 0x…`} />
    </Doc>
  );
}

export function Scoring() {
  return (
    <Doc slug="earn/scoring" lede="Each successful transaction is one task. What it pays depends only on what it did, and the rules apply the same way to every wallet.">
      <H2>Tasks</H2>
      <Table
        head={["What you did", "#Credits", "How it is recognised"]}
        rows={[
          ["Deployed a contract", number(TASK_CREDITS.deploy), "The transaction created a contract."],
          ["Used a partner protocol", "set per partner", "The recipient is in the partner registry (none listed yet)."],
          ["Called any other contract", number(TASK_CREDITS.contract_call), "The recipient is a contract. The receipt names the method and contract when the explorer decodes them."],
          ["Sent a plain transfer", number(TASK_CREDITS.transfer), "Anything else that succeeded."],
          ["A failed transaction", "0", "Not a finished task. Still shown in the scan counts."],
        ]}
        min="32rem"
      />
      <p>
        The checks run in that order, so a deployment is never also counted as a transfer, and a partner call is
        never also counted as a plain contract call.
      </p>

      <H2>Milestones</H2>
      <p>One-time bonuses for the number of successful transactions in your record:</p>
      <Table
        head={["Transactions", "#Bonus"]}
        rows={MILESTONES.map((milestone) => [number(milestone.txs), number(milestone.credits)])}
        min="16rem"
      />
      <p>
        Only the first <strong>{MILESTONE_TXS_PER_DAY} transactions of each UTC day</strong> count toward milestone
        progress. A bot cannot buy the big milestones with one afternoon of cheap transactions; a real user reaches
        them by showing up.
      </p>

      <H2>The daily cap</H2>
      <p>
        Task credits are limited to <strong>{number(DAILY_TASK_CAP)} per wallet per UTC day of activity</strong>. The
        day is the day the transaction happened, not the day you claim. Milestones, the streak bonus and referral
        shares sit outside the cap.
      </p>
      <p>
        The cap fills in the order the work was done, oldest first, and it holds across claims: if one day already
        paid 900 and you claim again for that day, at most 100 more is granted.
      </p>

      <H2>Everything pays once</H2>
      <ul>
        <li>A transaction hash is paid one time, ever, on its network, no matter who asks or how often.</li>
        <li>Each milestone is paid once per wallet and network.</li>
        <li>Each streak day is paid once. See <Link href="/docs/earn/streaks">Streaks</Link>.</li>
        <li>Task rewards are sponsor-funded, which is why the cap and the once-only rules exist.</li>
      </ul>
      <Callout>
        <p>
          The rules carry a version, currently <code>{RULES_VERSION}</code>. On-chain receipts record it, so it is always
          clear which rules priced a claim, even after the numbers change.
        </p>
      </Callout>
    </Doc>
  );
}

export function StreaksPage() {
  const days = [2, 3, 5, 7, 10, 30];
  return (
    <Doc slug="earn/streaks" lede="Show up day after day and the bonus grows with you. It cannot be bought in an afternoon, because a streak takes real calendar days.">
      <H2>The rule</H2>
      <ul>
        <li>Every UTC day with at least one successful transaction is an <strong>active day</strong>.</li>
        <li>Consecutive active days form a <strong>streak</strong>. Miss a day and the next streak starts at day one.</li>
        <li>
          From the second day on, each day of a streak pays <strong>{STREAK_STEP} credits × the streak day</strong>,
          levelling off at {STREAK_MAX_BONUS} a day from day {STREAK_MAX_DAY}.
        </li>
        <li>Each calendar day pays its bonus once, on the first claim that includes it.</li>
      </ul>
      <Table
        head={["Streak day", "#Bonus that day", "#Total so far"]}
        rows={days.map((day) => [
          `Day ${day}`,
          number(streakBonus(day)),
          number(Array.from({ length: day }, (_, i) => streakBonus(i + 1)).reduce((sum, bonus) => sum + bonus, 0)),
        ])}
        min="20rem"
      />

      <H2>Read from your whole record</H2>
      <p>
        The streak is computed from every transaction in your scan, not only the unclaimed ones. So a day whose
        transactions you claimed last week still counts toward the streak you are on today; only the bonus for new
        days is paid. Failed transactions do not keep a streak alive.
      </p>
      <p>
        On the receipt it appears as one line, <em>Streak bonus (N days in a row)</em>, showing your longest streak,
        and in your activity as <em>Streak</em> with the number of days paid.
      </p>
      <Callout kind="tip">
        <p>
          The streak bonus sits outside the daily cap, so a busy day that hit the cap still earns its streak day in
          full.
        </p>
      </Callout>
    </Doc>
  );
}

export function ReferralsPage() {
  return (
    <Doc slug="earn/referrals" lede={`Invite a wallet. Every time it claims credits, ${REFERRAL_PERCENT}% of that claim lands in your balance on top. The invited wallet keeps everything it earned.`}>
      <H2>How an invite works</H2>
      <Steps>
        <Step title="Share your link">
          <p>
            Your invite link is <code>/r/&lt;your wallet address&gt;</code>, shown with a copy button on the{" "}
            <Link href="/dashboard/earn#referrals">Earn page</Link>.
          </p>
        </Step>
        <Step title="They open it">
          <p>
            The link remembers you in a cookie (<code>kredit_ref</code>, 30 days) and sends them to the home page. A
            broken link still goes home, without a cookie.
          </p>
        </Step>
        <Step title="They sign in for the first time">
          <p>
            At their first sign-in, the cookie names you as their inviter and is deleted. If they arrived without a
            link, they can paste your address under <em>Did someone invite you?</em> on their Earn page.
          </p>
        </Step>
        <Step title="They claim">
          <p>
            Every claim they make pays you {REFERRAL_PERCENT}% of it, rounded down, in the same database transaction as
            their claim. It shows in your activity as <em>Referral</em>.
          </p>
        </Step>
      </Steps>

      <H2>The rules</H2>
      <ul>
        <li>A wallet names its inviter <strong>once</strong>.</li>
        <li>
          Only <strong>before its first claim</strong>, so the share only ever covers claims made after the invite.
        </li>
        <li>You cannot invite yourself.</li>
        <li>Invites cannot form a loop. The chain is checked up to 20 hops.</li>
        <li>Claims are capped and pay once, so there is nothing to farm: the share is a bonus on real activity.</li>
        <li>
          The share starts once the invited wallet has been active on {REFERRAL_MIN_ACTIVE_DAYS} different days, only
          on claims of {REFERRAL_MIN_CLAIM} credits or more, and never more than {number(REFERRAL_DAILY_CAP)} credits a
          day from all your invitees together. See <Link href="/docs/legal/fairness">fair play</Link>.
        </li>
      </ul>

      <H2>From your own code</H2>
      <Endpoint method="GET" path="/api/referrals" note="session cookie" />
      <CodeBlock
        title="200"
        code={`{
  "percent": ${REFERRAL_PERCENT},
  "code": "0x71C7…976F",
  "referrer": null,
  "invited": [{ "address": "0x3f9a…c21e", "name": "mira", "claimed": 1130, "paid": 113, "joinedAt": "2026-09-20T09:12:44.102Z" }],
  "count": 1,
  "earned": 113
}`}
      />
      <Endpoint method="POST" path="/api/referrals" note="session cookie" />
      <Params>
        <Param name="referrer" type="address" required>
          The inviter&apos;s wallet. Not an address: <code>400</code>. Against a rule above: <code>409</code> with the
          reason, for example <code>An inviter can only be named before your first claim.</code> Success:{" "}
          <code>201</code>.
        </Param>
      </Params>
    </Doc>
  );
}

export function Claims() {
  return (
    <Doc slug="earn/claims" lede="A claim pays the receipt into your balance. On networks with the KreditReceipts contract, your wallet first writes a signed receipt on-chain, so the claim is provable by anyone.">
      <H2>Off-chain claims</H2>
      <p>
        On a network without the receipts contract, pressing <strong>Claim</strong> plans the payout and writes it in
        one database transaction: the claimed hashes, the milestones, the streak days, one ledger row per kind, and
        your inviter&apos;s share if you have one. Two claims racing each other cannot both be paid for the same work.
      </p>
      <Endpoint method="POST" path="/api/claim" note="session cookie" />
      <CodeBlock
        title="Body and answer"
        code={`{ "network": "mainnet" }

{ "granted": 1620, "total": 1620, "tasks": 45, "milestones": 1, "streak": 140, "referral": 0, "txHash": null, "balance": 6620 }`}
      />

      <H2>On-chain receipts</H2>
      <p>
        When an operator has deployed <code>KreditReceipts</code> on a network and set its address and a signer key on
        the server, claims on that network go through the contract:
      </p>
      <Steps>
        <Step title="The server signs a receipt">
          <p>
            <code>POST /api/claim</code> answers <code>{`{ "onchain": true, receipt, signature, receiptId, contract, chainId, credits }`}</code>.
            The receipt is an EIP-712 message (domain <code>Kredit</code>, version <code>1</code>) with your wallet,
            the credits, the number of transactions, a <code>recordRoot</code> (the keccak hash of the sorted claimed
            transaction hashes, so anyone can recompute it from the explorer), the rules version, your inviter, a
            nonce and a deadline <strong>10 minutes</strong> out.
          </p>
        </Step>
        <Step title="Your wallet submits it">
          <p>
            The dashboard switches your wallet to the right chain and calls <code>claim(receipt, signature)</code> on
            the contract. The contract checks that you are the wallet named, the deadline has not passed, the nonce
            is your next one and the signature is the server&apos;s, then records it and emits a{" "}
            <code>Claimed</code> event. No credits or tokens move on-chain; the contract records only what came in.
          </p>
        </Step>
        <Step title="The server confirms and credits">
          <p>
            The dashboard polls <code>POST /api/claim/confirm</code> with the transaction hash every two seconds, up
            to 40 times. The server reads the transaction, finds your <code>Claimed</code> event, matches it to the
            receipt it issued, and writes the stored plan into the ledger, once. Your activity row links to the
            transaction on Blockscout.
          </p>
        </Step>
      </Steps>
      <Endpoint method="POST" path="/api/claim/confirm" note="session cookie" />
      <Params>
        <Param name="network" type="string" required>
          Always <code>mainnet</code>.
        </Param>
        <Param name="hash" type="0x…" required>
          The claim transaction. Not mined yet: <code>404</code> with <code>retry: true</code>. Failed on-chain, no
          Kredit event, or a receipt this server did not issue: <code>400</code> with the reason.
        </Param>
      </Params>
      <Callout title="If the confirmation times out">
        <p>
          Your receipt is on-chain and safe. Keep the transaction hash and try again; the server also reconciles
          on its own the next time you claim, by comparing your on-chain nonce with the receipts it issued.
        </p>
      </Callout>

      <H2>The contract</H2>
      <Table
        head={["Item", "Value"]}
        rows={[
          ["Contract", <code key="a">KreditReceipts</code>],
          ["Robinhood Chain (4663)", <code key="a">0x46C668199e07eDD479A9309B0866cD6900E88bdD</code>],
          ["Compiler", "Solidity 0.8.28, optimizer 2,000 runs, EVM paris"],
          ["Verification", "Sourcify, exact match"],
          ["Signature", "EIP-712, name Kredit, version 1; low-s signatures only"],
          ["Owner controls", "signer, treasury, token for on-chain buying, pause"],
        ]}
        min="26rem"
      />
      <p>
        The same struct hash is computed in Solidity and on the server, and a test in each codebase proves the two
        agree on every run. The Foundry project lives in <code>contracts/</code> of the repository.
      </p>
    </Doc>
  );
}

export function TopUps() {
  return (
    <Doc slug="earn/top-ups" lede="Earning is the main way in and costs nothing. When a job needs more than you earned, you can buy credits at a fixed price, 1,000 credits for $0.80, paid in USDG or in ETH straight from your wallet.">
      <H2>How a top-up works</H2>
      <Steps>
        <Step title="Choose how many credits">
          <p>
            On <Link href="/dashboard/credits">Credits</Link>, pick a preset or type a number of credits. The price
            is fixed in dollars: <em>{number(1000)} credits cost $0.80</em>. Then choose to pay in USDG (a dollar
            stablecoin on Robinhood Chain) or in ETH; for ETH the card asks Uniswap what that many dollars cost
            right now.
          </p>
        </Step>
        <Step title="Pay">
          <p>
            Both ways are a call to the <code>KreditCheckout</code> contract, which pays the treasury and writes a{" "}
            <code>Purchased</code> event: the receipt anyone can read on Blockscout. Paying in USDG is an approval
            for exactly the price, then <code>buyWithUsdg</code>, which moves that USDG from your wallet to the
            treasury. Paying in ETH is one <code>buyWithEth</code> transaction: the contract swaps your ETH for
            USDG on Uniswap v3 with the treasury as the recipient, so the USDG goes from the pool to the treasury
            and nowhere else. The card sends 1% more ETH than the quote so the swap still clears if the price
            moves; the extra buys a few more credits. If the pool gives less than you asked for, or the price
            moves for ten minutes, the whole transaction reverts and your ETH stays with you. Nothing is held.
          </p>
        </Step>
        <Step title="The server checks the receipt">
          <p>
            The dashboard submits the transaction hash. The server reads the transaction receipt and counts{" "}
            <strong>only</strong> a <code>Purchased</code> event from the checkout contract for your signed-in
            wallet. Other contracts, other buyers and other tokens in the same transaction count for nothing.
          </p>
        </Step>
        <Step title="Credits are added">
          <p>
            Credits are <code>USDG received ÷ price per credit</code>, rounded down to whole credits, and never
            more than the contract recorded. Each payment works exactly once; submitting the same hash again
            answers <code>409</code>.
          </p>
        </Step>
      </Steps>

      <H2>From your own code</H2>
      <Endpoint method="GET" path="/api/topup" note="public" />
      <p>
        Answers <code>{`{ "config": null }`}</code> while buying is off, or the checkout contract, the USDG token
        (address, symbol, decimals), the treasury, the price in USDG base units per credit, the Uniswap router and
        quoter, WETH, the pool fee, the per-purchase cap, the network and the chain id when it is on.
      </p>
      <Endpoint method="POST" path="/api/topup" note="session cookie" />
      <Params>
        <Param name="hash" type="0x…" required>
          Your payment transaction. Not confirmed yet: <code>404</code> with <code>retry: true</code>. Failed, or no
          matching payment: <code>400</code>. Already used: <code>409</code>. Success:{" "}
          <code>{`{ "credits", "balance" }`}</code>.
        </Param>
      </Params>
      <Callout>
        <p>
          Buying stays switched off until the operator sets the checkout contract and the treasury. The price
          in ETH floats with the market; the price in dollars does not. {number(CREDITS_PER_USD)} credits are
          worth $1 of AI usage whichever way they arrived.
        </p>
      </Callout>
    </Doc>
  );
}
