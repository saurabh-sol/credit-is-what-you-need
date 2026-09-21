"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/format";
import { ACCOUNT_KEY, api, type AccountResponse } from "@/lib/use-fuel-account";
import { useSession } from "@/lib/use-session";
import { Composer } from "./composer";
import { Settings } from "./settings";
import { Transcript } from "./transcript";
import type { Failure, Turn } from "./types";

const fetchAccount = () => api<AccountResponse>("/api/account");

const link = "text-fog underline decoration-line underline-offset-4 transition-colors hover:decoration-lime";

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
  const account = useQuery({ queryKey: ACCOUNT_KEY, queryFn: fetchAccount, enabled: signedIn });

  const [model, setModel] = useState("kredit/echo");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const systemPrompt = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);
  // The balance check that prices the last reply. The next send waits for it,
  // or that reply's charge would be counted into the new one.
  const settling = useRef<Promise<void>>(Promise.resolve());

  // Leaving the page mid-reply stops the request rather than paying for text nobody reads.
  useEffect(() => () => abort.current?.abort(), []);

  const balance = account.data?.balance;
  // The balance alone decides this, so topping up in another tab unblocks the composer on return.
  const outOfCredits = balance !== undefined && balance <= 0;
  const blocked = !signedIn ? (
    session.isLoading ? (
      "Checking whether you are signed in."
    ) : (
      "Connect your wallet to send a message. Replies are paid from your own credits."
    )
  ) : outOfCredits ? (
    <>
      You are out of credits.{" "}
      <Link href="/dashboard/earn" className={link}>
        Earn credits
      </Link>{" "}
      or{" "}
      <Link href="/dashboard/credits" className={link}>
        buy credits
      </Link>{" "}
      to keep going.
    </>
  ) : null;

  const patch = (id: number, change: (turn: Turn) => Turn) =>
    setTurns((current) => current.map((turn) => (turn.id === id ? change(turn) : turn)));

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || blocked) return;

    const id = (lastId.current += 2);
    const history = [...turns, { id: id - 1, role: "user" as const, content }];
    setTurns([...history, { id, role: "assistant", content: "", model }]);
    setError(null);
    setBusy(true);

    const system = systemPrompt.current?.value.trim();
    const messages = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...history.map(({ role, content }) => ({ role, content })),
    ];
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();
    let stopped = false;

    await settling.current;
    const before = queryClient.getQueryData<AccountResponse>(ACCOUNT_KEY)?.balance;

    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true, messages }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw Object.assign(new Error(data?.error?.message ?? "The request failed."), { code: data?.error?.code });
      }
      await readStream(response.body, (piece) => piece && patch(id, (turn) => ({ ...turn, content: turn.content + piece })));
    } catch (caught) {
      const failure = caught as Error & { code?: string };
      if (failure.name === "AbortError") stopped = true;
      else setError({ message: failure.message, code: failure.code });
    } finally {
      const ms = performance.now() - started;
      abort.current = null;
      setBusy(false);
      // Drop a reply that never said anything; stamp whatever did arrive.
      setTurns((current) =>
        current.flatMap((turn) => (turn.id !== id ? [turn] : turn.content ? [{ ...turn, ms, stopped }] : [])),
      );
      // The charge settles when the stream ends; what left the balance is what this reply cost.
      settling.current = queryClient
        .fetchQuery({ queryKey: ACCOUNT_KEY, queryFn: fetchAccount })
        .then((after) => {
          if (before !== undefined && before > after.balance) patch(id, (turn) => ({ ...turn, cost: before - after.balance }));
        })
        .catch(() => {});
    }
  }

  const last = turns[turns.length - 1];
  const status = busy
    ? "Waiting for the reply."
    : last?.role === "assistant" && last.ms !== undefined
      ? `Reply finished${last.cost === undefined ? "." : `. It cost ${formatCredits(last.cost)} credits.`}`
      : "";

  return (
    // Below lg the settings follow the chat in one scrolling column; from lg up they sit beside it.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <section aria-label="Conversation" className="flex h-[82dvh] min-w-0 shrink-0 flex-col lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
        <Transcript
          state={signedIn ? "ready" : session.isLoading ? "loading" : "signed-out"}
          turns={turns}
          busy={busy}
          blocked={Boolean(blocked)}
          error={error}
          onPick={send}
        />
        <p role="status" className="sr-only">
          {status}
        </p>
        <Composer
          busy={busy}
          blocked={blocked}
          canReset={turns.length > 0 || error !== null}
          onSend={send}
          onStop={() => abort.current?.abort()}
          onReset={() => {
            setTurns([]);
            setError(null);
          }}
        />
      </section>

      <Settings model={model} onModel={setModel} signedIn={signedIn} balance={balance} systemPrompt={systemPrompt} />
    </div>
  );
}
