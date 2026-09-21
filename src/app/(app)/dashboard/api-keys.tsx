"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { ACCOUNT_KEY, api, useFuelAccount } from "@/lib/use-fuel-account";

type NewKey = { id: string; key: string; name: string };

export function ApiKeys() {
  const queryClient = useQueryClient();
  const { data } = useFuelAccount();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<NewKey | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
  const create = useMutation({
    mutationFn: () => api<NewKey>("/api/keys", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: (key) => {
      setFresh(key);
      setCopied(false);
      setName("");
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/keys/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      if (fresh?.id === id) setFresh(null);
      refresh();
    },
  });

  // Empty on the server, the real origin in the browser, without a hydration mismatch.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const snippet = `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${fresh?.key ?? "YOUR_KREDIT_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "kredit/echo", "messages": [{"role": "user", "content": "hello"}]}'`;

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">API keys</h2>
      <p className="mt-1 text-sm text-mist">
        Use a key anywhere that speaks the OpenAI API: Postman, Cursor, your own code.
      </p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Key name, e.g. Postman"
          maxLength={40}
          aria-label="Key name"
          className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 text-sm placeholder:text-mist"
        />
        <button
          disabled={create.isPending}
          className="btn-primary px-5 py-2 text-sm"
        >
          {create.isPending ? "Creating…" : "Create key"}
        </button>
      </form>
      {create.error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">
          {create.error.message}
        </p>
      )}

      {fresh && (
        <div className="mt-4 rounded-xl border border-lime/50 bg-raised p-4">
          <p className="text-sm font-medium text-lime">Copy your key now. You won&apos;t see it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-ink px-3 py-2 font-mono text-sm">{fresh.key}</code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(fresh.key);
                setCopied(true);
              }}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-sm transition hover:border-lime"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {data && data.keys.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {data.keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{key.name}</p>
                <p className="font-mono text-xs text-mist">
                  {key.prefix} · {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}
                </p>
              </div>
              <button
                onClick={() => revoke.mutate(key.id)}
                disabled={revoke.isPending}
                className="shrink-0 rounded-full px-3 py-1.5 text-sm text-mist transition hover:text-danger"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-sm text-mist">Try it</h3>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-ink p-4 font-mono text-xs leading-relaxed">
        <code>{snippet}</code>
      </pre>
      <p className="mt-2 text-xs leading-relaxed text-mist">
        In Postman: POST to <span className="font-mono text-fog">{origin}/v1/chat/completions</span>, Auth type
        &quot;Bearer Token&quot;. <span className="font-mono text-fog">kredit/echo</span> is a test model that repeats your
        message and is billed by length, like a real model.
      </p>
    </section>
  );
}
