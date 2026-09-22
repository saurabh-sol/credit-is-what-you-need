"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PlusIcon, SearchIcon } from "@/components/icons";
import type { Conversation } from "@/lib/workspace";
import { api } from "@/lib/use-kredit-account";
import { ChatIcon, LibraryIcon, PencilIcon, TrashIcon } from "./icons";

export const CONVERSATIONS_KEY = ["workspace", "conversations"];

// The rail of saved conversations: newest first, searchable, each one can be
// renamed or deleted. Selecting one loads it into the transcript.
type Props = {
  active: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
};

const when = (iso: string) => {
  const at = new Date(iso);
  const days = (Date.now() - at.getTime()) / 86_400_000;
  if (days < 1) return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days < 7) return at.toLocaleDateString(undefined, { weekday: "short" });
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function Conversations({ active, disabled, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const list = useQuery({ queryKey: CONVERSATIONS_KEY, queryFn: () => api<{ conversations: Conversation[] }>("/api/workspace/conversations") });

  const remove = useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/workspace/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<{ conversations: Conversation[] }>(CONVERSATIONS_KEY, (data) =>
        data ? { conversations: data.conversations.filter((entry) => entry.id !== id) } : data,
      );
      if (active === id) onSelect(null);
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<Conversation>(`/api/workspace/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    onSuccess: (saved) => {
      queryClient.setQueryData<{ conversations: Conversation[] }>(CONVERSATIONS_KEY, (data) =>
        data ? { conversations: data.conversations.map((entry) => (entry.id === saved.id ? { ...entry, title: saved.title } : entry)) } : data,
      );
      setRenaming(null);
    },
  });

  const needle = query.trim().toLowerCase();
  const shown = (list.data?.conversations ?? []).filter((entry) => !needle || entry.title.toLowerCase().includes(needle));

  return (
    <nav aria-label="Conversations" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3">
        <button type="button" disabled={disabled} onClick={() => onSelect(null)} className="btn-sm flex-1 justify-center">
          <PlusIcon className="size-3.5" />
          New chat
        </button>
        <Link href="/playground/library" className="btn-sm" title="Pictures and clips you made">
          <LibraryIcon className="size-3.5" />
        </Link>
      </div>
      <label className="field mx-3 mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist">
        <SearchIcon className="size-3.5" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" aria-label="Search conversations" className="w-full bg-transparent text-xs text-fog placeholder:text-mist focus:outline-none" />
      </label>
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {list.isLoading && <li className="px-2 py-3 text-xs text-mist">Loading…</li>}
        {list.data && shown.length === 0 && (
          <li className="px-2 py-3 text-xs leading-relaxed text-mist">{needle ? "No chat by that name." : "Nothing saved yet. Your chats will appear here."}</li>
        )}
        {shown.map((entry) => {
          const current = entry.id === active;
          return (
            <li key={entry.id} className="group relative">
              {renaming?.id === entry.id ? (
                <form
                  className="px-1 py-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (renaming.title.trim()) rename.mutate(renaming);
                    else setRenaming(null);
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.title}
                    onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(event) => event.key === "Escape" && setRenaming(null)}
                    aria-label="Conversation title"
                    className="field w-full rounded-md px-2 py-1.5 text-xs"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={current ? "true" : undefined}
                  onClick={() => onSelect(entry.id)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${current ? "bg-fog/[0.06] text-fog" : "text-mist hover:bg-fog/[0.03] hover:text-fog"} disabled:cursor-not-allowed`}
                >
                  <ChatIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs leading-5">{entry.title}</span>
                    <span className="block truncate font-mono text-[0.625rem] text-mist">
                      {entry.model.split("/").pop()} · {when(entry.updatedAt)}
                    </span>
                  </span>
                </button>
              )}
              {renaming?.id !== entry.id && (
                <span className="absolute top-1.5 right-1.5 hidden gap-0.5 group-hover:flex group-focus-within:flex">
                  <button type="button" aria-label="Rename" onClick={() => setRenaming({ id: entry.id, title: entry.title })} className="grid size-6 place-items-center rounded-md bg-raised text-mist hover:text-fog">
                    <PencilIcon className="size-3" />
                  </button>
                  <button type="button" aria-label="Delete" disabled={remove.isPending} onClick={() => remove.mutate(entry.id)} className="grid size-6 place-items-center rounded-md bg-raised text-mist hover:text-danger">
                    <TrashIcon className="size-3" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
