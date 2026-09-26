import Link from "next/link";
import { ArrowRightIcon, PlayIcon } from "@/components/icons";
import { catalog } from "@/lib/catalog";
import { ECHO_MODEL } from "@/lib/gateway";
import { CREDITS_PER_USD, MARGIN } from "@/lib/pricing";
import { REFERRAL_PERCENT } from "@/lib/referral-rules";
import { DAILY_TASK_CAP, TASK_CREDITS } from "@/lib/scoring";
import { STREAK_MAX_BONUS } from "@/lib/streaks";
import { KeyPanel } from "./key-panel";
import { Quickstart } from "./quickstart";
import { Card, Cards, Doc, H2, number, Table } from "./ui";

export const metadata = {
  title: "Docs — Kredit",
  description: "Everything about Kredit: earning AI credits from on-chain activity on Robinhood Chain, and spending them through one OpenAI-compatible API.",
};
// The model count depends on how this server is configured, so it is read per request.
export const dynamic = "force-dynamic";

const marginPercent = Math.round(MARGIN * 100);

export default async function Introduction() {
  const { live, models } = await catalog();

  return (
    <Doc
      slug=""
      title="Kredit documentation"
      lede="Kredit is an on-chain OpenRouter: one key, every model, the bill in the response headers. Your wallet's record on Robinhood Chain earns the credits, and you can top up on-chain when you need more."
    >
      <div className="not-prose flex flex-wrap items-center gap-2">
        <Link href="/docs/quickstart" className="btn-sm btn-sm-primary">
          Quickstart <ArrowRightIcon className="size-3.5" />
        </Link>
        <Link href="/playground" className="btn-sm">
          <PlayIcon className="size-3.5 text-mist" /> Open playground
        </Link>
        <span className="chip">
          <span className={`live-dot ${live ? "" : "opacity-50"}`} />
          {live ? `Provider connected · ${number(models.length - 1)} models` : `Test mode · ${ECHO_MODEL} only`}
        </span>
      </div>

      <H2>What Kredit is</H2>
      <p>
        A wallet signs in with one free message. Kredit reads its record on Robinhood Chain, prices it with public
        rules, and pays the result into a balance of credits. {number(CREDITS_PER_USD)} credits buy $1 of AI usage
        through an API that speaks the OpenAI and Anthropic formats, so Cursor, Claude Code, the SDKs and every
        tool you already use work by changing the base URL.
      </p>
      <Table
        head={["You do", "Kredit does"]}
        rows={[
          ["Deploy, call contracts, send transfers", `Pays ${TASK_CREDITS.deploy} / ${TASK_CREDITS.contract_call} / ${TASK_CREDITS.transfer} credits per task, up to ${number(DAILY_TASK_CAP)} a day, plus milestones`],
          ["Show up day after day", `Adds a streak bonus, up to ${STREAK_MAX_BONUS} credits a day`],
          ["Invite a friend", `Sends you ${REFERRAL_PERCENT}% of every claim they make`],
          ["Call a model with your key", `Charges the provider's price with a ${marginPercent}% fee, and tells you in two headers`],
        ]}
        min="28rem"
      />

      <H2>Start here</H2>
      <Cards>
        <Card href="/docs/quickstart" title="Quickstart">
          Wallet to working API call in five minutes.
        </Card>
        <Card href="/docs/how-it-works" title="How it works">
          The earn, claim, spend loop and the rules behind it.
        </Card>
        <Card href="/docs/earn/scoring" title="Earn credits">
          Tasks, milestones, the daily cap, streaks, referrals, on-chain receipts.
        </Card>
        <Card href="/docs/api/chat-completions" title="API reference">
          Every endpoint, parameter, header and error, with runnable examples.
        </Card>
        <Card href="/docs/integrations" title="Integrations">
          OpenAI and Anthropic SDKs, Claude Code, the AI SDK, Cursor, LangChain.
        </Card>
      </Cards>

      <H2>Your first request</H2>
      <p>
        Create a key, then send this. <code>{ECHO_MODEL}</code> repeats your message, works on every server, and is
        billed by length like a real model, so the headers you get back are real.
      </p>
      <KeyPanel />
      <Quickstart />

      <H2>Principles</H2>
      <ul>
        <li>
          <strong>Rules, not discretion.</strong> Every number on this site is read from the code that does the
          scoring and billing, and the <Link href="/docs/rules">rules page</Link> lists all of them.
        </li>
        <li>
          <strong>Everything pays once.</strong> A transaction, a milestone, a streak day, a payment: each is paid
          exactly one time, enforced in a single database transaction.
        </li>
        <li>
          <strong>Claims are public, spending is private.</strong> Every claim is a receipt on Robinhood Chain;
          nobody sees what you spent the credits on.
        </li>
        <li>
          <strong>No custody.</strong> Signing in costs no gas and grants nothing. Kredit never holds your tokens.
        </li>
      </ul>
    </Doc>
  );
}
