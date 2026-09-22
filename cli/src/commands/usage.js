import { client } from "../api.js";
import { accent, bold, credits, dim, printJson, spinner, table, usd } from "../ui.js";

// usage: what was spent, by model and call by call.

const when = (iso) => {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

export async function usage(options, command) {
  const api = client(command.optsWithGlobals());
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  query.set("limit", String(options.limit ?? 20));
  const spin = spinner("Reading your usage");
  const { data } = await api.get(`/v1/usage?${query}`);
  spin.stop();
  if (options.json) return printJson(data);

  const period = data.period.from || data.period.to ? dim(`${data.period.from ?? "start"} → ${data.period.to ?? "now"}`) : dim("all time");
  process.stdout.write(`${bold("Spent")} ${accent(credits(data.total_credits))} credits ${dim(`≈ ${usd(data.total_credits)}`)} ${period}\n`);
  if (data.by_model.length === 0) {
    process.stdout.write(`${dim("No calls yet. Try `kredit chat \"hello\"`.")}\n`);
    return;
  }
  process.stdout.write(`\n${bold("By model")}\n`);
  process.stdout.write(
    `${table(
      data.by_model.map((row) => [row.model, credits(row.calls), credits(row.input_tokens), credits(row.output_tokens), accent(credits(row.credits))]),
      { head: ["model", "calls", "in", "out", "credits"], align: [, "right", "right", "right", "right"] },
    )}\n`,
  );
  if (data.data.length > 0) {
    process.stdout.write(`\n${bold("Recent calls")}\n`);
    process.stdout.write(
      `${table(
        data.data.map((row) => [dim(when(row.created_at)), row.model, credits(row.input_tokens ?? 0), credits(row.output_tokens ?? 0), accent(credits(row.credits))]),
        { head: ["when", "model", "in", "out", "credits"], align: [, , "right", "right", "right"] },
      )}\n`,
    );
    if (data.has_more) process.stdout.write(dim(`  More before ${data.next}; use --limit or --from/--to.\n`));
  }
}
