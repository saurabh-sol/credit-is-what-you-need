"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCredits } from "@/lib/format";
import { HOUSE_STYLE } from "@/lib/house-style";
import { ACCOUNT_KEY, api, type AccountResponse } from "@/lib/use-kredit-account";
import { useSession } from "@/lib/use-session";
import type { Catalog } from "@/lib/catalog";
import type { Conversation, Message } from "@/lib/workspace";
import { HISTORY_SENT, MAX_MESSAGE_CHARS } from "@/lib/workspace-limits";
import { Composer } from "./composer";
import { CONVERSATIONS_KEY, Conversations } from "./conversations";
import { ChatIcon } from "./icons";
import { ModeSwitch } from "./mode-switch";
import { Settings } from "./settings";
import { Evaluate } from "./evaluate";
import { Studio } from "./studio";
import { Transcript } from "./transcript";
import { DEFAULT_MODELS, type Attachment, type Creation, type Failure, type ImageOptions, type Mode, type Turn, type VideoOptions } from "./types";

const fetchAccount = () => api<AccountResponse>("/api/account");

const link = "text-fog underline decoration-line underline-offset-4 transition-colors hover:decoration-accent";

type Charge = { credits: number; balance: number };

// Reads an OpenAI-style event stream: hands each piece of text to `onText`
// and returns the charge the gateway appends at the end, when it does.
async function readStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<Charge | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let charge: Charge | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return charge;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        const text = event.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) onText(text);
        if (event.kredit && typeof event.kredit.credits_charged === "number") {
          charge = { credits: event.kredit.credits_charged, balance: event.kredit.balance };
        }
      } catch {
        // a keep-alive comment, not JSON
      }
    }
  }
}

// What goes to the model for one message: the text, with text files pasted in
// and pictures attached as image parts.
function modelContent(text: string, attachments: Attachment[]) {
  const texts = attachments.filter((file) => file.kind === "text");
  const images = attachments.filter((file) => file.kind === "image");
  const full = [text, ...texts.map((file) => `--- ${file.name} ---\n${file.data}`)].filter(Boolean).join("\n\n");
  if (images.length === 0) return full;
  return [{ type: "text", text: full }, ...images.map((file) => ({ type: "image_url", image_url: { url: file.data } }))];
}

type PlaygroundProps = { initialModel?: string; initialMode?: Mode };

export function Playground({ initialModel, initialMode }: PlaygroundProps = {}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const signedIn = Boolean(session.address);
  const account = useQuery({ queryKey: ACCOUNT_KEY, queryFn: fetchAccount, enabled: signedIn });

  // Text, Image or Video, each remembering its own model.
  const [mode, setMode] = useState<Mode>(initialMode ?? "text");
  const [models, setModels] = useState(() => (initialModel ? { ...DEFAULT_MODELS, [initialMode ?? "text"]: initialModel } : DEFAULT_MODELS));
  const model = models[mode];
  const setModel = (id: string) => setModels((current) => ({ ...current, [mode]: id }));
  const [compareModel, setCompareModel] = useState<string | null>(null);
  const [image, setImage] = useState<ImageOptions>({ size: "1024x1024", n: 1 });
  const [video, setVideo] = useState<VideoOptions>({ duration: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false });
  const [creations, setCreations] = useState<Creation[]>([]);
  const catalogQuery = useQuery({ queryKey: ["models"], queryFn: () => api<Catalog>("/api/models"), staleTime: 600_000 });

  // The conversation on screen. Null until the first message, which creates it.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamingIds, setStreamingIds] = useState<Set<number>>(() => new Set());
  const abort = useRef<AbortController | null>(null);
  const systemPrompt = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);

  // Leaving the page mid-reply stops the request rather than paying for text nobody reads.
  useEffect(() => () => abort.current?.abort(), []);

  const balance = account.data?.balance;
  // The balance alone decides this, so topping up in another tab unblocks the composer on return.
  const outOfCredits = balance !== undefined && balance <= 0;
  const blocked = !signedIn ? (
    session.isLoading ? (
      "Checking whether you are signed in."
    ) : (
      "Sign in to send a message. Replies are paid from your own credits."
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

  const setCharge = (charge: Charge) =>
    queryClient.setQueryData<AccountResponse>(ACCOUNT_KEY, (data) => (data ? { ...data, balance: charge.balance } : data));

  // Opens a saved conversation, or starts fresh with null.
  const open = useCallback(async (id: string | null) => {
    abort.current?.abort();
    setError(null);
    setRailOpen(false);
    if (!id) {
      setConversationId(null);
      setTurns([]);
      return;
    }
    setLoadingConversation(true);
    try {
      const data = await api<Conversation & { messages: Message[] }>(`/api/workspace/conversations/${id}`);
      setConversationId(data.id);
      setModels((current) => ({ ...current, text: data.model }));
      if (systemPrompt.current) systemPrompt.current.value = data.system ?? HOUSE_STYLE;
      setTurns(
        data.messages.map((message) => {
          const turnId = (lastId.current += 1);
          return {
            id: turnId,
            role: message.role,
            content: message.content,
            model: message.model ?? undefined,
            ms: message.ms ?? undefined,
            cost: message.credits ?? undefined,
            attachments: message.attachments,
            messageId: message.id,
          };
        }),
      );
    } catch (caught) {
      setError({ message: (caught as Error).message });
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  // Saves a message in the background; the transcript never waits for the database.
  const persist = async (id: string, message: { role: "user" | "assistant"; content: string; model?: string; credits?: number; ms?: number; attachments?: string[] }) => {
    try {
      const saved = await api<{ id: number }>(`/api/workspace/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(message) });
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      return saved.id;
    } catch {
      return undefined;
    }
  };

  async function send(text: string, attachments: Attachment[] = []) {
    const content = text.trim();
    if ((!content && attachments.length === 0) || busy || blocked) return;

    const system = systemPrompt.current?.value.trim();
    const targets = [model, ...(compareModel && compareModel !== model ? [compareModel] : [])];
    const userId = (lastId.current += 1);
    const group = targets.length > 1 ? userId : undefined;
    const replies = targets.map((target) => ({ id: (lastId.current += 1), model: target }));
    const names = attachments.map((file) => file.name);
    const history = turns.slice(-HISTORY_SENT);

    setTurns([
      ...turns,
      { id: userId, role: "user", content, attachments: names },
      ...replies.map((reply) => ({ id: reply.id, role: "assistant" as const, content: "", model: reply.model, group })),
    ]);
    setError(null);
    setBusy(true);
    setStreamingIds(new Set(replies.map((reply) => reply.id)));

    // The conversation is created with the first message and named after it.
    let id = conversationId;
    if (!id) {
      try {
        const created = await api<Conversation>("/api/workspace/conversations", {
          method: "POST",
          body: JSON.stringify({ model, title: content || names.join(", "), system }),
        });
        id = created.id;
        setConversationId(id);
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      } catch {
        id = null; // the chat still works for this visit; it is just not saved
      }
    }
    if (id) void persist(id, { role: "user", content: content || `(${names.join(", ")})`, attachments: names });

    const messages = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...history.filter((turn) => turn.content).map(({ role, content }) => ({ role, content })),
      { role: "user", content: modelContent(content, attachments) },
    ];
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();

    await Promise.all(
      replies.map(async (reply) => {
        let stopped = false;
        let charge: Charge | null = null;
        try {
          const response = await fetch("/api/playground", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: reply.model, stream: true, messages }),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            const data = await response.json().catch(() => null);
            throw Object.assign(new Error(data?.error?.message ?? "The request failed."), { code: data?.error?.code });
          }
          charge = await readStream(response.body, (piece) => patch(reply.id, (turn) => ({ ...turn, content: turn.content + piece })));
        } catch (caught) {
          const failure = caught as Error & { code?: string };
          if (failure.name === "AbortError") stopped = true;
          else setError({ message: failure.message, code: failure.code });
        } finally {
          const ms = performance.now() - started;
          if (charge) setCharge(charge);
          setStreamingIds((current) => {
            const next = new Set(current);
            next.delete(reply.id);
            return next;
          });
          // Drop a reply that never said anything; stamp whatever did arrive and save it.
          let finished: Turn | null = null;
          setTurns((current) =>
            current.flatMap((turn) => {
              if (turn.id !== reply.id) return [turn];
              if (!turn.content) return [];
              finished = { ...turn, ms, stopped, cost: charge?.credits };
              return [finished];
            }),
          );
          // A stopped stream is still charged for what it wrote; the balance shows it.
          if (!charge && stopped) queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
          const done = finished as Turn | null;
          if (id && done) {
            const messageId = await persist(id, { role: "assistant", content: done.content, model: reply.model, credits: done.cost, ms });
            if (messageId) patch(reply.id, (turn) => ({ ...turn, messageId }));
          }
        }
      }),
    );
    abort.current = null;
    setBusy(false);
  }

  // What the next picture or clip will cost, from the model's listed price.
  const price = catalogQuery.data?.models.find((entry) => entry.id === model)?.price ?? null;
  let estimate = "";
  if (mode === "image") {
    if (price?.per === "image") estimate = `About ${formatCredits(price.credits * image.n)} credits for ${image.n === 1 ? "one picture" : `${image.n} pictures`}.`;
    else if (price?.per === "million_tokens") {
      // GPT Image bills by token; its largest picture is about 4,160 output tokens.
      const worst = Math.ceil(((price.output * 4160 + price.input * 100) / 1_000_000) * image.n);
      estimate = `Up to about ${formatCredits(worst)} credits for ${image.n === 1 ? "one picture" : `${image.n} pictures`}; simpler pictures cost less.`;
    }
  } else if (mode === "video" && price?.per === "second") {
    const rate =
      price.rates.find((entry) => entry.resolution === video.resolution && (entry.audio ?? false) === video.generateAudio) ??
      price.rates.find((entry) => entry.resolution === video.resolution && entry.audio === undefined);
    estimate = rate
      ? `${formatCredits(Math.ceil(rate.credits * video.duration))} credits for ${video.duration} seconds at ${video.resolution}${video.generateAudio ? " with sound" : ""}.`
      : `This model does not offer ${video.resolution}${video.generateAudio ? " with sound" : ""}.`;
  }

  async function make(prompt: string) {
    const text = prompt.trim();
    if (!text || busy || blocked || mode === "text" || mode === "evaluate") return;
    const id = (lastId.current += 1);
    const kind = mode;
    setCreations((current) => [{ id, kind, prompt: text, model, files: [] }, ...current]);
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();
    const patchCreation = (change: (creation: Creation) => Creation) =>
      setCreations((current) => current.map((creation) => (creation.id === id ? change(creation) : creation)));
    try {
      const body = kind === "image" ? { kind, model, prompt: text, ...image } : { kind, model, prompt: text, ...video };
      const response = await fetch("/api/playground/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(data?.error?.message ?? "The request failed."), { code: data?.error?.code });
      }
      const files = (kind === "image" ? data.images : data.videos) as Creation["files"];
      patchCreation((creation) => ({ ...creation, files, cost: data.credits, ms: performance.now() - started }));
      queryClient.setQueryData<AccountResponse>(ACCOUNT_KEY, (account) => (account ? { ...account, balance: data.balance } : account));
      // Into the library, so it is still there tomorrow.
      api("/api/workspace/creations", { method: "POST", body: JSON.stringify({ kind, prompt: text, model, credits: data.credits, files }) })
        .then(() => patchCreation((creation) => ({ ...creation, saved: true })))
        .catch(() => {});
    } catch (caught) {
      const failure = caught as Error & { code?: string };
      if (failure.name === "AbortError") setCreations((current) => current.filter((creation) => creation.id !== id));
      else patchCreation((creation) => ({ ...creation, error: { message: failure.message, code: failure.code } }));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  const sessionCost = turns.reduce((sum, turn) => sum + (turn.cost ?? 0), 0);
  const last = turns[turns.length - 1];
  const status = busy
    ? "Waiting for the reply."
    : last?.role === "assistant" && last.ms !== undefined
      ? `Reply finished${last.cost === undefined ? "." : `. It cost ${formatCredits(last.cost)} credits.`}`
      : "";
  const state = signedIn ? (loadingConversation ? "loading" : "ready") : session.isLoading ? "loading" : "signed-out";

  return (
    // Below lg the settings follow the chat in one scrolling column; from lg up they sit beside it.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {mode === "text" && signedIn && (
        <>
          {railOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setRailOpen(false)} />}
          <aside
            data-open={railOpen || undefined}
            aria-label="Saved conversations"
            className="fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r border-line bg-ink transition-transform duration-300 ease-out-expo data-open:translate-x-0 lg:static lg:z-auto lg:w-60 lg:shrink-0 lg:translate-x-0"
          >
            <Conversations active={conversationId} disabled={busy} onSelect={open} />
          </aside>
        </>
      )}

      <section aria-label={mode === "text" ? "Conversation" : "Studio"} className="flex h-[82dvh] min-w-0 shrink-0 flex-col lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          {mode === "text" && signedIn && (
            <button type="button" onClick={() => setRailOpen(true)} className="btn-sm lg:hidden" aria-label="Open saved conversations">
              <ChatIcon className="size-3.5" />
              Chats
            </button>
          )}
          <ModeSwitch value={mode} onChange={setMode} disabled={busy} />
          {mode === "text" && sessionCost > 0 && (
            <p className="ml-auto font-mono text-xs text-mist tabular-nums" title="What this conversation has cost so far">
              <span className="text-accent">−{formatCredits(sessionCost)}</span> this chat
            </p>
          )}
        </div>
        {mode === "text" ? (
          <>
            <Transcript state={state} turns={turns} busy={busy} blocked={Boolean(blocked)} error={error} streamingIds={streamingIds} onPick={send} />
            <p role="status" className="sr-only">
              {status}
            </p>
            <Composer
              busy={busy}
              blocked={blocked}
              canReset={turns.length > 0 || error !== null}
              maxChars={MAX_MESSAGE_CHARS}
              onSend={send}
              onStop={() => abort.current?.abort()}
              onReset={() => void open(null)}
            />
          </>
        ) : mode === "evaluate" ? (
          <Evaluate model={model} state={signedIn ? "ready" : session.isLoading ? "loading" : "signed-out"} blocked={blocked} />
        ) : (
          <Studio
            mode={mode}
            state={signedIn ? "ready" : session.isLoading ? "loading" : "signed-out"}
            creations={creations.filter((creation) => creation.kind === mode)}
            busy={busy}
            blocked={blocked}
            estimate={estimate}
            onMake={make}
            onStop={() => abort.current?.abort()}
          />
        )}
      </section>

      <Settings
        mode={mode}
        model={model}
        onModel={(id) => {
          setModel(id);
          // A saved conversation remembers the model it was last on.
          if (mode === "text" && conversationId) {
            api(`/api/workspace/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ model: id }) }).catch(() => {});
          }
        }}
        compareModel={compareModel}
        onCompareModel={setCompareModel}
        signedIn={signedIn}
        balance={balance}
        systemPrompt={systemPrompt}
        onSystemPrompt={(value) => {
          if (conversationId) api(`/api/workspace/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ system: value }) }).catch(() => {});
        }}
        image={image}
        onImage={setImage}
        video={video}
        onVideo={setVideo}
        estimate={estimate}
      />
    </div>
  );
}
