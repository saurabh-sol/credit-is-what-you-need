import Link from "next/link";
import {
  CALLS_FULL_PER_TARGET_PER_DAY,
  CALLS_HALF_PER_TARGET_PER_DAY,
  CLAIMS_PER_MINUTE,
  DAILY_EMISSIONS_BUDGET,
  DEPLOYS_PAID_PER_DAY,
  HOLD_CONCENTRATION,
  HOLD_HOURS,
  HOLD_THRESHOLD,
  HOLD_WALLET_AGE_DAYS,
  REFERRAL_DAILY_CAP,
  REFERRAL_MIN_ACTIVE_DAYS,
  REFERRAL_MIN_CLAIM,
  SCANS_PER_MINUTE,
  WALLET_MIN_AGE_DAYS,
} from "@/lib/fairness";
import { MAX_ACTIVE_KEYS } from "@/lib/limits";
import { CREDITS_PER_USD, MARGIN } from "@/lib/pricing";
import { REFERRAL_COOKIE_TTL } from "@/lib/referral-rules";
import { DAILY_TASK_CAP, MILESTONE_TXS_PER_DAY, RULES_VERSION } from "@/lib/scoring";
import { SITE_URL } from "@/lib/site";
import { Callout, Doc, H2, Table, number } from "../ui";

// The privacy policy and the terms. Written from the code, not from a template:
// every retention period and every number here is the one the server uses.
// CHECKED is the date someone last read these against the code; bump it when
// the code changes what they describe.
const CHECKED = "22 September 2026";
const referralDays = Math.round(REFERRAL_COOKIE_TTL / 86_400);

function Checked() {
  return (
    <p className="font-mono text-xs text-mist">
      Checked against the code on {CHECKED}. Site: <code>{SITE_URL}</code>.
    </p>
  );
}

export function Privacy() {
  return (
    <Doc
      slug="legal/privacy"
      lede="Kredit stores as little as it can, keeps your prompts out of its database, and publishes the little it does store here."
    >
      <Checked />

      <H2>The short version</H2>
      <ul>
        <li>Your identity here is a wallet address. There is no email, no password and no account form.</li>
        <li>What you send to a model through the API is forwarded and dropped. It is never written to our database.</li>
        <li>Conversations you have in the workspace are stored for you, in your account, until you delete them.</li>
        <li>Nothing you send trains a model, ours or anyone else&apos;s.</li>
        <li>Claims are public as receipts on Robinhood Chain. What you spent is never shown as prompts.</li>
        <li>No analytics scripts, no advertising pixels, no data brokers.</li>
      </ul>

      <H2>What we store, and for how long</H2>
      <Table
        head={["Data", "Why", "Kept"]}
        rows={[
          ["Wallet address", "It is your account", "As long as the account has any row"],
          ["Ledger rows: every credit in and out", "Your balance is the sum of them", "Forever. It is the money."],
          ["Claimed transaction hashes, milestones, streak days", "So each pays once", "Forever"],
          ["Referral: who invited you, invited wallets, shares paid", "To pay the inviter's share", "Forever"],
          [`API keys (up to ${MAX_ACTIVE_KEYS}): SHA-256 hash, name, first characters, last use`, "To authenticate calls", "Until revoked; the hash stays so a revoked key can never come back"],
          ["Usage rows: model, token counts, credits, time, which key", "So you can see what a call cost", "Forever, as totals on your dashboard"],
          ["Sessions", "To keep you signed in", "7 days, or until you sign out"],
          ["Spent sign-in nonces", "So a sign-in message cannot be replayed", "5 minutes"],
          [`Referral cookie`, "Remembers the invite link that brought you here", `${referralDays} days, or until you sign in`],
          ["CLI device codes", "To finish a CLI login", "10 minutes"],
          ["Workspace conversations and messages", "So your chats survive a reload and follow you across devices", "Until you delete them"],
          ["Workspace creations: images and clips, with prompt, model and cost", "Your library", "Until you delete them"],
          ["Signed on-chain receipts and their plan", "To write a claim once the chain has it", "Forever"],
          ["Top-up transaction hashes and amounts", "So a payment buys credits once", "Forever"],
        ]}
        min="40rem"
      />

      <H2>What we never store</H2>
      <ul>
        <li>
          <strong>API prompts and answers.</strong> A request to <code>/v1</code> goes to the model&apos;s provider
          and the answer comes back to you. We keep the token counts and the price, nothing else.
        </li>
        <li>
          <strong>Voice.</strong> Dictation and read-aloud in the workspace use your browser&apos;s own speech
          engine. No audio reaches our servers.
        </li>
        <li>
          <strong>Private keys or approvals.</strong> Signing in is a signature over a message. We never ask for a
          transaction, an allowance or a seed phrase.
        </li>
      </ul>

      <H2>What is public</H2>
      <p>
        Credits are handed out by rules, so claims are public: each one is written as a receipt on Robinhood
        Chain, which anyone can read. Nothing else is published. Prompts, individual calls and amounts per call are
        never shown to anyone.
      </p>

      <H2>Who else sees your data</H2>
      <Table
        head={["Service", "What it sees", "Why"]}
        rows={[
          ["The model provider (through Vercel AI Gateway)", "Your prompt and the answer. Not your wallet, not your key.", "It runs the model"],
          ["Neon", "The database above", "It hosts the database"],
          ["Render", "Web traffic: IP address, user agent, URL, in rotating logs", "It hosts the site"],
          ["The chain RPC and Blockscout", "The address you scan", "To read your on-chain record"],
          ["Chainlink", "Nothing about you", "The ETH price used in top-ups"],
          ["Uniswap and the USDG contract", "Your wallet's on-chain payment", "Buying credits is an on-chain transaction"],
          ["Your wallet app", "The sign-in message", "You sign it there"],
        ]}
        min="36rem"
      />
      <p>
        We do not sell data, share it for advertising, or hand it to anyone not on this list, except when the law
        leaves us no choice.
      </p>

      <H2>Cookies</H2>
      <p>
        Three, all first-party and all needed to work: the signed session cookie, the five-minute sign-in nonce,
        and the referral cookie set by an invite link. There is no consent banner because there is nothing to
        consent to; the cookies do no tracking.
      </p>

      <H2>Your controls</H2>
      <ul>
        <li>Sign out here, or everywhere, from the dashboard settings.</li>
        <li>Revoke any API key at any time. Revocation is immediate.</li>
        <li>Delete any workspace conversation or creation. It is a hard delete.</li>
        <li>Remove your display name. The board falls back to the shortened address.</li>
        <li>Download your ledger, usage and keys list as JSON from the dashboard settings.</li>
        <li>
          Ask for deletion of everything except the ledger, claimed hashes and receipts, which have to stay so a
          credit cannot be paid twice. Open an issue on the repository or contact us on the channels listed on the
          site.
        </li>
      </ul>

      <H2>Children</H2>
      <p>Kredit is not for anyone under 18. If you are, please do not use it.</p>

      <H2>Changes</H2>
      <p>
        When the code changes what this page describes, this page changes with it and the date at the top moves.
        The full history is in the repository.
      </p>

      <Callout kind="note" title="Security">
        <p>
          How keys, sessions and spending are protected is on the{" "}
          <Link href="/docs/platform/security">privacy and security</Link> page.
        </p>
      </Callout>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc slug="legal/terms" lede="What a credit is, what you can do with one, what earns one and what forfeits one. Plain words, no surprises.">
      <Checked />

      <H2>1. What Kredit is</H2>
      <p>
        Kredit is a website, an API and a command-line tool that let a wallet on Robinhood Chain earn and buy{" "}
        <strong>credits</strong>, and spend those credits on calls to AI models run by third-party providers.
        Kredit is an independent project. It is not affiliated with Robinhood, with the model providers, or with
        any chain.
      </p>

      <H2>2. Credits</H2>
      <ul>
        <li>
          {number(CREDITS_PER_USD)} credits pay for $1 of model usage at the provider&apos;s published price, with a{" "}
          {Math.round(MARGIN * 100)}% fee on top, rounded up to a whole credit per call.
        </li>
        <li>
          Credits are prepaid access to model usage. They are <strong>not money</strong>, not a token, not a
          security, not a deposit and not a claim on Kredit or anyone else. They cannot be withdrawn, transferred
          between wallets, sold or converted back to crypto or cash.
        </li>
        <li>Credits do not expire.</li>
        <li>Purchases are final. A top-up is an on-chain transaction; once the credits are written, there are no refunds.</li>
        <li>Failed calls are free. A provider error, an unreachable provider or a refused request charges nothing.</li>
        <li>The price of a model is the provider&apos;s price on the day of the call, and providers change prices.</li>
      </ul>

      <H2>3. Earning</H2>
      <ul>
        <li>
          Earned credits are a sponsored rewards programme. The rules are published on{" "}
          <Link href="/docs/rules">Rules at a glance</Link> and <Link href="/docs/legal/fairness">Fair play</Link>, and
          the code that applies them is public.
        </li>
        <li>
          We may change the rates, caps and rules for <em>future</em> activity at any time. Credits already claimed
          are never taken back because a rule changed.
        </li>
        <li>
          Activity designed to extract rewards rather than to use the chain, such as many wallets under one hand,
          referring yourself, transactions whose only purpose is to count, or scripted volume against your own
          contracts, breaks these terms. Unclaimed rewards from it are forfeited, held claims may be cancelled, and
          the wallets may be excluded. The <Link href="/docs/legal/fairness">fair play</Link> page says what the
          software checks for.
        </li>
        <li>The programme can be paused or ended. If it is, credits already claimed stay spendable.</li>
      </ul>

      <H2>4. Your wallet and your keys</H2>
      <ul>
        <li>You are responsible for the wallet you sign in with and for every API key you create.</li>
        <li>
          Spend by a key is spend by you, including spend by a key that leaked. Revoke a key the moment you think it
          might have.
        </li>
        <li>You may hold up to {MAX_ACTIVE_KEYS} active keys. Rate limits are as documented and may change.</li>
        <li>One person, one wallet for earning. Spending from many wallets is fine.</li>
      </ul>

      <H2>5. Acceptable use</H2>
      <ul>
        <li>
          Calls go to third-party models. Their providers&apos; usage policies apply to what you send, and a
          provider may refuse a request. We pass their refusal on and charge nothing for it.
        </li>
        <li>Do not use Kredit to break the law, to harm people, or to attack the service, the chain or the providers.</li>
        <li>Do not resell access to your key or share one wallet&apos;s credits as a service to others without telling us.</li>
      </ul>

      <H2>6. The service</H2>
      <ul>
        <li>
          Kredit is provided as is. It runs on shared hosting, depends on providers we do not control, and has no
          uptime promise. A call that fails is free; a call that is slow is not a fault.
        </li>
        <li>
          We may change, pause or shut down any part of the service. If the whole service closes, we will say so on
          the site at least 30 days ahead, and credits can be spent until then.
        </li>
        <li>Model answers are generated by machines and can be wrong. Check anything that matters.</li>
      </ul>

      <H2>7. Liability</H2>
      <p>
        To the extent the law allows, Kredit&apos;s total liability to you for anything arising from the service is
        limited to the amount you paid for credits in the 30 days before the claim. We are not liable for lost
        profits, lost data, or anything a model said. Nothing here limits liability that cannot be limited by law.
      </p>

      <H2>8. Termination</H2>
      <p>
        You can stop at any time: sign out, revoke your keys, delete your workspace data. We can close a wallet&apos;s
        access for breaking these terms; unspent purchased credits are then honoured for 30 days by request,
        unless the purchase itself was part of the breach.
      </p>

      <H2>9. Changes to these terms</H2>
      <p>
        These terms change when the product changes. The date at the top is the date of the last check, and the
        repository holds every previous version. Using the service after a change accepts the change.
      </p>

      <H2>10. Contact and governing law</H2>
      <p>
        Questions, problems and deletion requests go through the channels listed on the site and the repository.
        A governing law and a formal contact address will be added here when the project has an operating entity;
        until then, the law of the place where the operator lives applies.
      </p>
    </Doc>
  );
}

export function Fairness() {
  return (
    <Doc
      slug="legal/fairness"
      title="Fair play"
      lede="Earned credits are paid for by sponsors, so they have to reach people who use the chain, not scripts that farm it. These are the rules the software applies, with the numbers it uses. Nothing here is hidden or judged by hand."
    >
      <Checked />

      <H2>Already true before these rules</H2>
      <ul>
        <li>Every transaction, milestone and streak day pays once, ever, no matter who asks or how often.</li>
        <li>Task credits are capped at {number(DAILY_TASK_CAP)} per wallet per UTC day of activity.</li>
        <li>Only {MILESTONE_TXS_PER_DAY} transactions a day count toward milestones, so a burst cannot buy them.</li>
        <li>A streak takes real calendar days; each day&apos;s bonus is paid once.</li>
        <li>Calls to Kredit&apos;s own receipts contract are not work and earn nothing.</li>
        <li>Mainnet only. Testnet activity earns nothing.</li>
        <li>Every claim is written to Robinhood Chain as a receipt carrying the rules version that priced it.</li>
      </ul>

      <H2>The rules, numbered</H2>
      <Table
        head={["#", "Rule", "Number", "What it stops"]}
        rows={[
          ["1", "Wallet age", `${WALLET_MIN_AGE_DAYS} days since the wallet's first transaction before its first claim`, "Wallets made this morning to farm one day"],
          ["2", "Dust filter", "A transfer counts only if it moves at least 0.0001 ETH", "Sending nothing to yourself in a loop"],
          [
            "3",
            "Diversity",
            `Per UTC day and target: the first ${CALLS_FULL_PER_TARGET_PER_DAY} calls pay in full, the next ${CALLS_HALF_PER_TARGET_PER_DAY} pay half, the rest pay nothing. Deploys: ${DEPLOYS_PAID_PER_DAY} paid per day.`,
            "Hammering one contract, or deploying the same bytecode all day",
          ],
          [
            "4",
            "Referral gates",
            `The inviter is paid only once the invitee has been active on ${REFERRAL_MIN_ACTIVE_DAYS} days, only on claims of ${REFERRAL_MIN_CLAIM}+ credits, and at most ${number(REFERRAL_DAILY_CAP)} a day. You cannot invite yourself and invites cannot loop.`,
            "Inviting a hundred wallets you also own",
          ],
          [
            "5",
            "Daily pool",
            `${number(DAILY_EMISSIONS_BUDGET)} task credits a day for everyone. When it is spent, transactions stay unclaimed and are paid from the next day's pool. Milestones and streaks are outside the pool.`,
            "One day of chaos draining the sponsor budget",
          ],
          [
            "6",
            "Hold",
            `A claim over ${number(HOLD_THRESHOLD)} credits from a wallet under ${HOLD_WALLET_AGE_DAYS} days old, or where ${Math.round(HOLD_CONCENTRATION * 100)}% of its activity is against one target, waits ${HOLD_HOURS} hours. It is then paid unless the record changed.`,
            "Cash-and-run",
          ],
          ["7", "Endpoint limits", `${SCANS_PER_MINUTE} scans and ${CLAIMS_PER_MINUTE} claims a minute per wallet`, "Scripts hammering the scanner"],
        ]}
        min="46rem"
      />

      <H2>What you see</H2>
      <ul>
        <li>
          The receipt on your Earn page shows a line, <em>Repeat calls to the same contract</em>, with what rule 3 took
          off, next to the daily cap line.
        </li>
        <li>
          When rule 1 or 6 applies, the claim button says so and gives the time from which you can claim, and the
          claim endpoint answers <code>403 wallet_age</code> or <code>423 held</code> with the same time.
        </li>
        <li>When rule 5 applies, the page shows how many credits are waiting for tomorrow&apos;s pool. They stay yours.</li>
        <li>
          Rule 3 is applied over your whole record, in time order, so a transaction is priced the same whether you
          claim it today or next month.
        </li>
      </ul>

      <H2>What is not checked</H2>
      <p>
        Kredit does not fingerprint browsers, log IP addresses against wallets, or ask for identity. The rules above
        work on the chain record alone. If you find a way through them that the rules did not foresee, tell us: a
        fixed rule helps everyone, a quiet exploit ends the programme for everyone.
      </p>

      <Callout kind="note" title="Rules version">
        <p>
          These rules are version {RULES_VERSION}. Every on-chain receipt carries the version that priced it, so a
          claim can always be checked against the rules of its day.
        </p>
      </Callout>
    </Doc>
  );
}
