"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/use-kredit-account";

// Take your data with you, or clear what the workspace keeps. Both are here so
// the privacy policy's promises have a button behind them.
export function YourData() {
  const queryClient = useQueryClient();
  const clear = useMutation({
    mutationFn: () => api<{ ok: true }>("/api/workspace", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });

  return (
    <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="card p-5">
        <h3 className="text-sm font-medium text-fog">Download everything</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-mist">
          One JSON file: your ledger, every call you paid for, your keys&apos; names, and what the workspace keeps.
          Prompts sent through the API are not in it because they were never stored.
        </p>
        <a href="/api/account/export" download className="btn-sm mt-4 inline-flex">
          Download JSON
        </a>
      </div>
      <div className="card p-5">
        <h3 className="text-sm font-medium text-fog">Clear the workspace</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-mist">
          Deletes every saved conversation, picture and clip for this wallet. Credits, keys and your activity stay.
          This cannot be undone.
        </p>
        <button
          type="button"
          disabled={clear.isPending}
          onClick={() => clear.mutate()}
          className="btn-sm mt-4 text-danger hover:border-danger/50"
        >
          {clear.isPending ? "Clearing…" : clear.isSuccess ? "Cleared" : "Delete workspace data"}
        </button>
      </div>
    </div>
  );
}
