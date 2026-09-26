"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ModelLogo } from "@/components/model-logo";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { api } from "@/lib/use-kredit-account";
import { useSession } from "@/lib/use-session";
import type { Creation } from "@/lib/workspace";
import { TrashIcon } from "../icons";

const LIBRARY_KEY = ["workspace", "creations"];

const save = (file: { base64: string; mediaType: string }, name: string) => {
  const link = document.createElement("a");
  link.href = `data:${file.mediaType};base64,${file.base64}`;
  link.download = name;
  link.click();
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// Every picture and clip this wallet made, newest first, with what it cost.
export function Library() {
  const session = useSession();
  const queryClient = useQueryClient();
  const signedIn = Boolean(session.address);
  const library = useQuery({ queryKey: LIBRARY_KEY, queryFn: () => api<{ creations: Creation[] }>("/api/workspace/creations"), enabled: signedIn });
  const remove = useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/workspace/creations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      queryClient.setQueryData<{ creations: Creation[] }>(LIBRARY_KEY, (data) => (data ? { creations: data.creations.filter((entry) => entry.id !== id) } : data)),
  });

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="page-title">Library</h1>
        <p className="page-lede">The pictures and clips you make in the studio are kept here, for your wallet only. Connect it to see them.</p>
        <div className="mt-6">
          <WalletButton label="Sign in" />
        </div>
      </div>
    );
  }

  const creations = library.data?.creations ?? [];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-lede">
            Every picture and clip you made, with its prompt, model and cost. Deleting one removes it for good.
          </p>
        </div>
        <Link href="/playground?mode=image" className="btn-sm">
          Make another
        </Link>
      </div>

      {library.isLoading && <p className="mt-8 text-sm text-mist">Loading your library.</p>}
      {library.data && creations.length === 0 && (
        <p className="card mt-8 px-5 py-8 text-center text-sm text-mist">
          Nothing here yet.{" "}
          <Link href="/playground?mode=image" className="text-fog underline decoration-line underline-offset-4 hover:decoration-accent">
            Make a picture
          </Link>{" "}
          or{" "}
          <Link href="/playground?mode=video" className="text-fog underline decoration-line underline-offset-4 hover:decoration-accent">
            a clip
          </Link>{" "}
          and it lands here.
        </p>
      )}

      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {creations.map((creation) => (
          <li key={creation.id} className="card overflow-hidden">
            <div className={`grid gap-1 ${creation.files.length > 1 ? "grid-cols-2" : ""}`}>
              {creation.files.map((file, index) => (
                <figure key={index} className="group relative bg-surface">
                  {creation.kind === "video" ? (
                    <video controls loop muted playsInline className="w-full" src={`data:${file.mediaType};base64,${file.base64}`} />
                  ) : (
                    // A data URL from the database; nothing for next/image to optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={creation.prompt} className="w-full" src={`data:${file.mediaType};base64,${file.base64}`} />
                  )}
                  <button
                    type="button"
                    onClick={() => save(file, `kredit-${creation.kind}-${creation.id.slice(0, 8)}${index ? `-${index + 1}` : ""}.${file.mediaType.split("/")[1] ?? "bin"}`)}
                    className="btn-sm absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  >
                    Save
                  </button>
                </figure>
              ))}
            </div>
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-raised text-fog">
                <ModelLogo model={creation.model} className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-[0.875rem] leading-6 text-fog">{creation.prompt}</p>
                <p className="mt-1 font-mono text-[0.6875rem] text-mist">
                  {creation.model} · {when(creation.createdAt)}
                  {creation.credits !== null && ` · ${formatCredits(creation.credits)} credits`}
                </p>
              </div>
              <button type="button" aria-label="Delete" disabled={remove.isPending} onClick={() => remove.mutate(creation.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-mist transition-colors hover:bg-raised hover:text-danger">
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
