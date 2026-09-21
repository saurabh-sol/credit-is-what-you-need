"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SendIcon, StopIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { CountUp } from "@/components/motion/count-up";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { ACCOUNT_KEY, api, type AccountResponse } from "@/lib/use-fuel-account";
import { useSession } from "@/lib/use-session";
import { ModelPicker } from "./model-picker";

type Message = { role: "user" | "assistant"; content: string; model?: string; cost?: number };

const starters = [
  "Explain gas fees to someone who has never used a blockchain.",
  "Write a Solidity function that splits a payment between three addresses.",
  "Summarize what an ERC-20 approval does, in two sentences.",
];

// Reads an OpenAI-style event stream and hands each piece of text to `onText`.
async function readStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) continue;
      try {
        onText(JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? "");
      } catch {
        // a keep-alive comment, not JSON
      }
    }
  }
}

export function Playground() {
  const session = useSession();
  const queryClient = useQueryClient();
  const signedIn = Boolean(session.address);
  const account = useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: () => api<AccountResponse>("/api/account"),
    enabled: signedIn,
  });

  const [model, setModel] = useState("fuel/echo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !signedIn) return;

    const history = [...messages, { role: "user" as const, content }];
    setMessages([...history, { role: "assistant", content: "", model }]);
    setDraft("");
    setError(null);
    setBusy(true);
    const before = account.data?.balance;
    abort.current = new AbortController();

    const append = (piece: string) =>
      setMessages((current) => {
        const last = current[current.length - 1];
        return [...current.slice(0, -1), { ...last, content: last.content + piece }];
      });

    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true, messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: abort.current.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw Object.assign(new Error(data?.error?.message ?? "The request failed. Try again."), { code: data?.error?.code });
      }
      await readStream(response.body, append);
    } catch (caught) {
      const failure = caught as Error & { code?: string };
      if (failure.name !== "AbortError") {
        setError({ message: failure.message, code: failure.code });
        // Drop the empty reply bubble; keep whatever did arrive.
        setMessages((current) => (current[current.length - 1]?.content ? current : current.slice(0, -1)));
      }
    } finally {
      setBusy(false);
      // The charge settles when the stream ends; show what this reply cost.
      const after = (await queryClient.fetchQuery({ queryKey: ACCOUNT_KEY, queryFn: () => api<AccountResponse>("/api/account") }).catch(() => null))?.balance;
      if (before !== undefined && after !== undefined && before > after) {
        setMessages((current) => {
          const last = current[current.length - 1];
          return last?.role === "assistant" ? [...current.slice(0, -1), { ...last, cost: before - after }] : current;
        });
      }
    }
  }

  const outOfCredits = error?.code === "insufficient_credits" || (account.data && account.data.balance <= 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-10 pb-16 lg:grid-cols-[1fr_19rem]">
      <section className="card flex min-h-[70dvh] flex-col overflow-hidden lg:h-[calc(100dvh-9rem)] lg:min-h-0">
        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
          {messages.length === 0 && (
            <div className="flex h-full flex-col justify-center py-10">
              <p className="eyebrow animate-rise">Playground</p>
              <h1 style={{ animationDelay: "80ms" }} className="mt-3 max-w-lg animate-rise text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Spend a few credits and see what comes back.
              </h1>
              <p style={{ animationDelay: "160ms" }} className="mt-4 max-w-md animate-rise leading-relaxed text-mist">
                The same gateway your API key uses, paid from the same balance. Pick a model, ask
                something, and watch the cost of every reply.
              </p>
              <ul className="mt-8 grid max-w-xl gap-2">
                {starters.map((starter, index) => (
                  <li key={starter} style={{ animationDelay: `${240 + index * 70}ms` }} className="animate-rise">
                    <button
                      type="button"
                      disabled={!signedIn || busy}
                      onClick={() => send(starter)}
                      className="btn-ghost w-full rounded-xl px-4 py-3 text-left text-sm text-mist hover:text-fog"
                    >
                      {starter}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="flex animate-rise justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-lime px-4 py-2.5 leading-relaxed whitespace-pre-wrap text-ink">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={index} className="flex animate-rise gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-raised text-fog">
                  <ModelLogo model={message.model ?? model} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed whitespace-pre-wrap text-fog">
                    {message.content}
                    {busy && index === messages.length - 1 && <span className="caret" />}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    <span className="chip">{message.model}</span>
                    {message.cost !== undefined && (
                      <span className="chip pop-in text-lime">−{formatCredits(message.cost)} credits</span>
                    )}
                  </p>
                </div>
              </div>
            ),
          )}
          <div ref={end} />
        </div>

        {error && (
          <p role="alert" className="mx-5 mb-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger sm:mx-7">
            {error.message}{" "}
            {error.code === "insufficient_credits" && (
              <Link href="/dashboard" className="underline underline-offset-4">
                Earn or buy more
              </Link>
            )}
          </p>
        )}

        <form
          className="border-t border-line bg-ink/40 p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="prompt">
              Message
            </label>
            <textarea
              id="prompt"
              rows={1}
              value={draft}
              disabled={!signedIn}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder={signedIn ? "Ask something. Enter sends, Shift+Enter adds a line." : "Connect your wallet to start"}
              className="field max-h-40 min-h-11 flex-1 resize-none [field-sizing:content]"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="btn-ghost grid size-11 shrink-0 place-items-center">
                <StopIcon className="size-5" />
              </button>
            ) : (
              <button type="submit" disabled={!signedIn || !draft.trim()} aria-label="Send" className="btn-primary grid size-11 shrink-0 place-items-center">
                <SendIcon className="size-5" />
              </button>
            )}
          </div>
        </form>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm text-mist">
            <span className="live-dot" /> Balance
          </h2>
          {signedIn ? (
            <>
              <p className="mt-2 font-mono text-3xl font-semibold text-lime">
                {account.data ? <CountUp value={account.data.balance} duration={900} /> : <span className="skeleton" aria-hidden>0,000</span>}
              </p>
              <p className="mt-1 text-xs text-mist">
                {account.data ? `≈ $${(account.data.balance / 1000).toFixed(2)} of AI usage` : "Loading your balance"}
              </p>
              {outOfCredits && (
                <Link href="/dashboard" className="btn-ghost mt-4 w-full justify-center px-4 py-2 text-sm">
                  Earn or buy credits
                </Link>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                The playground spends your own credits, so it needs to know whose they are.
              </p>
              <div className="mt-4">
                <WalletButton label="Connect wallet" />
              </div>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm text-mist">Model</h2>
          <div className="mt-3">
            <ModelPicker value={model} onChange={setModel} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-mist">
            <span className="font-mono text-fog">fuel/echo</span> repeats your message for the minimum charge. It is the
            cheapest way to see the whole loop work.
          </p>
        </section>

        {messages.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="btn-ghost w-full justify-center px-4 py-2 text-sm"
          >
            New conversation
          </button>
        )}
      </aside>
    </div>
  );
}
