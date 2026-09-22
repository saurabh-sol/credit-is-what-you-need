"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { api } from "@/lib/use-kredit-account";

const PROFILE_KEY = ["profile"];

// The name shown beside this wallet on the public distribution page.
export function DisplayName() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: () => api<{ name: string | null }>("/api/profile") });
  const [draft, setDraft] = useState<string | null>(null); // null until the user types
  const name = draft ?? profile.data?.name ?? "";

  const save = useMutation({
    mutationFn: () => api<{ name: string | null }>("/api/profile", { method: "PUT", body: JSON.stringify({ name }) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(PROFILE_KEY, saved);
      queryClient.invalidateQueries({ queryKey: ["distribution"] });
      setDraft(null);
    },
  });
  const unchanged = name.trim() === (profile.data?.name ?? "");

  return (
    <form
      className="mt-5 flex max-w-md flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor="display-name" className="text-sm text-mist">
        Display name on the{" "}
        <Link href="/distribution" className="text-fog underline decoration-line underline-offset-4 transition hover:decoration-accent">
          distribution page
        </Link>
      </label>
      <div className="flex gap-2">
        <input
          id="display-name"
          value={name}
          maxLength={24}
          disabled={profile.isLoading}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Leave empty to show only your address"
          className="field"
        />
        <button type="submit" disabled={unchanged || save.isPending} className="btn-ghost shrink-0 px-4 text-sm">
          {save.isSuccess && unchanged ? <CheckIcon className="text-accent" /> : null}
          {save.isPending ? "Saving" : save.isSuccess && unchanged ? "Saved" : "Save"}
        </button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
    </form>
  );
}
