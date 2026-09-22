"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { StopIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { WalletButton } from "@/components/wallet-button";
import { formatCredits } from "@/lib/format";
import { ACCOUNT_KEY, type AccountResponse } from "@/lib/use-kredit-account";
import { SparkIcon } from "./icons";
import type { Failure } from "./types";

// Jev answers typed questions about some text: is this so (a probability),
// which of these (a choice), which level of a rubric (a score). Each run is one request.

type QuestionType = "noul" | "choice" | "score";
type Question = { id: number; name: string; type: QuestionType; instructions: string; criteria: string };

const TYPES: { id: QuestionType; label: string; hint: string }[] = [
  { id: "noul", label: "Yes or no", hint: "A probability between 0 and 1" },
  { id: "choice", label: "Choice", hint: "One of the options you list" },
  { id: "score", label: "Score", hint: "A level on a rubric you list, lowest first" },
];

type Answer = { type: string; noul?: number; choice?: string; score?: number; probabilities?: Record<string, number>; legend?: Record<string, string> } & Record<string, unknown>;
type Run = { id: number; state: string; questions: Question[]; answers?: Record<string, Answer>; ms?: number; cost?: number; error?: Failure };

const example = {
  state: "Hi, I was charged twice for my subscription this month and I would like the second charge refunded. I am also unable to log in since yesterday.",
  questions: [
    { id: 1, name: "refund", type: "noul" as const, instructions: "Is the customer asking for money back?", criteria: "" },
    { id: 2, name: "department", type: "choice" as const, instructions: "Which team should handle this first?", criteria: "billing: Charges, refunds and invoices\ntechnical: Bugs, outages and sign-in problems\nsales: Plans and upgrades" },
    { id: 3, name: "urgency", type: "score" as const, instructions: "How urgent is this?", criteria: "Can wait a few days\nShould be handled today\nThe customer is blocked right now" },
  ],
};

// "key: description" lines -> TypeSafe's options for a choice.
function optionsOf(text: string) {
  const criteria: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key.trim()) criteria[key.trim()] = rest.join(":").trim() || key.trim();
  }
  return criteria;
}

// One rubric level per line, lowest first -> TypeSafe's criteria for a score.
const levelsOf = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function AnswerView({ answer }: { answer: Answer }) {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  if (answer.type === "noul" && typeof answer.noul === "number") {
    return (
      <span className="flex items-center gap-2">
        <span className={`font-medium ${answer.noul >= 0.5 ? "text-fog" : "text-mist"}`}>{answer.noul >= 0.5 ? "Yes" : "No"}</span>
        <span className="font-mono text-xs text-mist tabular-nums">{pct(answer.noul)}</span>
      </span>
    );
  }
  if (answer.type === "choice" && typeof answer.choice === "string") {
    const odds = answer.probabilities ?? {};
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-fog">{answer.choice}</span>
        {Object.entries(odds)
          .sort(([, a], [, b]) => b - a)
          .map(([key, value]) => (
            <span key={key} className="font-mono text-xs text-mist tabular-nums">
              {key} {pct(value)}
            </span>
          ))}
      </span>
    );
  }
  if (answer.type === "score" && typeof answer.score === "number") {
    // The score is the expected rubric level (1.95 sits between levels 1 and 2); the nearest level names it.
    const top = Object.keys(answer.legend ?? {}).length - 1;
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-fog">{answer.legend?.[String(Math.round(answer.score))] ?? answer.score.toFixed(2)}</span>
        {top > 0 && (
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-fog/10">
            <span className="block h-full rounded-full bg-accent" style={{ width: pct(answer.score / top) }} />
          </span>
        )}
        <span className="font-mono text-xs text-mist tabular-nums">
          {answer.score.toFixed(2)}
          {top > 0 && ` of ${top}`}
        </span>
      </span>
    );
  }
  return <span className="font-mono text-xs text-mist">{JSON.stringify(answer)}</span>;
}

type EvaluateProps = { model: string; state: "ready" | "loading" | "signed-out"; blocked: ReactNode | null };

export function Evaluate({ model, state: signIn, blocked }: EvaluateProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(example.state);
  const [questions, setQuestions] = useState<Question[]>(example.questions);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(10);

  const patchQuestion = (id: number, change: Partial<Question>) =>
    setQuestions((current) => current.map((question) => (question.id === id ? { ...question, ...change } : question)));
  const ready =
    !blocked && !busy && state.trim() && questions.every((question) => question.name.trim() && question.instructions.trim() && (question.type === "noul" || question.criteria.trim()));

  async function run() {
    if (!ready) return;
    const id = nextId.current++;
    const started = performance.now();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setRuns((current) => [{ id, state, questions }, ...current]);
    const patchRun = (change: (run: Run) => Run) => setRuns((current) => current.map((entry) => (entry.id === id ? change(entry) : entry)));
    try {
      const body = {
        model,
        state,
        questions: Object.fromEntries(
          questions.map((question) => [
            question.name.trim(),
            {
              type: question.type,
              instructions: question.instructions.trim(),
              ...(question.type === "choice" && { criteria: optionsOf(question.criteria) }),
              ...(question.type === "score" && { criteria: levelsOf(question.criteria) }),
            },
          ]),
        ),
      };
      const response = await fetch("/api/playground/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(data?.error?.message ?? data?.message ?? "The request failed."), { code: data?.error?.code });
      }
      patchRun((entry) => ({ ...entry, answers: data.answers, cost: data.credits, ms: performance.now() - started }));
      queryClient.setQueryData<AccountResponse>(ACCOUNT_KEY, (account) => (account ? { ...account, balance: data.balance } : account));
    } catch (caught) {
      const failure = caught as Error & { code?: string };
      if (failure.name === "AbortError") setRuns((current) => current.filter((entry) => entry.id !== id));
      else patchRun((entry) => ({ ...entry, error: { message: failure.message, code: failure.code } }));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Evaluate</h1>
        <p className="mt-1.5 max-w-xl text-[0.8125rem] leading-relaxed text-mist">
          Give the model some text and ask it typed questions. Each answer comes back as a probability, a choice, or a score,
          so it can route, classify and check things in your own code.
        </p>

        {blocked && (
          <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[0.8125rem] leading-relaxed text-mist">
            <p>{blocked}</p>
            {signIn === "signed-out" && <WalletButton />}
          </div>
        )}

        <form
          className="mt-5 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <div>
            <label htmlFor="evaluate-state" className="text-[0.8125rem] font-medium">
              What the model looks at
            </label>
            <textarea
              id="evaluate-state"
              value={state}
              disabled={Boolean(blocked)}
              onChange={(event) => setState(event.target.value)}
              rows={4}
              className="field mt-2 max-h-64 min-h-24 w-full resize-none rounded-lg px-3 py-2.5 text-[0.8125rem] leading-relaxed [field-sizing:content] disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[0.8125rem] font-medium">Questions</span>
              <button
                type="button"
                disabled={Boolean(blocked) || questions.length >= 8}
                onClick={() =>
                  setQuestions((current) => [...current, { id: nextId.current++, name: `question${current.length + 1}`, type: "noul", instructions: "", criteria: "" }])
                }
                className="btn-sm"
              >
                Add a question
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {questions.map((question) => (
                <li key={question.id} className="card space-y-2 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={question.name}
                      disabled={Boolean(blocked)}
                      aria-label="Question name"
                      onChange={(event) => patchQuestion(question.id, { name: event.target.value.replace(/[^\w-]/g, "") })}
                      className="field w-36 rounded-md px-2.5 py-1.5 font-mono text-xs"
                    />
                    <div role="radiogroup" aria-label="Answer type" className="inline-flex rounded-md border border-line bg-surface p-0.5">
                      {TYPES.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          role="radio"
                          aria-checked={question.type === type.id}
                          title={type.hint}
                          disabled={Boolean(blocked)}
                          onClick={() => patchQuestion(question.id, { type: type.id })}
                          className={`rounded px-2.5 py-1 text-xs transition-colors ${question.type === type.id ? "bg-raised text-fog shadow-[0_1px_2px_var(--shade)]" : "text-mist hover:text-fog"}`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        disabled={Boolean(blocked)}
                        onClick={() => setQuestions((current) => current.filter((entry) => entry.id !== question.id))}
                        className="ml-auto text-xs text-mist transition-colors hover:text-fog"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    value={question.instructions}
                    disabled={Boolean(blocked)}
                    aria-label="Instructions"
                    placeholder="What should the model decide?"
                    onChange={(event) => patchQuestion(question.id, { instructions: event.target.value })}
                    className="field w-full rounded-md px-2.5 py-1.5 text-[0.8125rem]"
                  />
                  {question.type !== "noul" && (
                    <textarea
                      value={question.criteria}
                      disabled={Boolean(blocked)}
                      aria-label={question.type === "choice" ? "Options, one per line as name: description" : "Rubric levels, one per line, lowest first"}
                      placeholder={
                        question.type === "choice"
                          ? "One option per line, as name: description\nbilling: Charges and refunds\ntechnical: Bugs and outages"
                          : "One level per line, lowest first\nNot at all\nSomewhat\nVery much"
                      }
                      onChange={(event) => patchQuestion(question.id, { criteria: event.target.value })}
                      rows={3}
                      className="field w-full resize-none rounded-md px-2.5 py-1.5 font-mono text-xs leading-relaxed [field-sizing:content]"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs text-mist">Billed on the text you send; the answers are free.</p>
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="btn-sm ml-auto">
                <StopIcon className="size-3.5" />
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!ready} className="btn-sm btn-sm-primary ml-auto">
                <SparkIcon className="size-3.5" />
                Evaluate
              </button>
            )}
          </div>
        </form>

        {runs.length > 0 && (
          <ol className="mt-8 space-y-4" aria-label="Results">
            {runs.map((entry) => (
              <li key={entry.id} className="card px-4 py-3.5">
                <p className="flex items-center gap-2 text-xs text-mist">
                  <ModelLogo model={model} className="size-4" />
                  <span className="font-mono">{model}</span>
                  {entry.ms !== undefined && <span>· {(entry.ms / 1000).toFixed(1)}s</span>}
                  {entry.cost !== undefined && <span>· {formatCredits(entry.cost)} credits</span>}
                  {!entry.answers && !entry.error && <span className="skeleton">Thinking</span>}
                </p>
                <p className="mt-2 line-clamp-2 text-[0.8125rem] leading-relaxed text-mist">{entry.state}</p>
                {entry.error ? (
                  <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-4 py-3 text-[0.8125rem] leading-relaxed text-danger">
                    {entry.error.message}
                  </p>
                ) : entry.answers ? (
                  <dl className="mt-3 divide-y divide-line">
                    {entry.questions.map((question) => {
                      const answer = entry.answers?.[question.name.trim()];
                      return (
                        <div key={question.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-[0.8125rem]">
                          <dt className="w-32 shrink-0 truncate font-mono text-xs text-mist">{question.name}</dt>
                          <dd className="min-w-0 flex-1">{answer ? <AnswerView answer={answer} /> : <span className="text-mist">No answer</span>}</dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
