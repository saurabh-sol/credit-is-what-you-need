import { client } from "../api.js";
import { accent, bold, contextSize, credits, dim, fields, printJson, priceLine, spinner, table } from "../ui.js";

// models: the catalog, searchable, grouped by maker; or one model in detail.

const KINDS = { chat: "language", language: "language", embedding: "embedding", embeddings: "embedding", image: "image", video: "video", eval: "evaluation", evaluation: "evaluation" };
const kindName = { language: "chat", embedding: "embedding", image: "image", video: "video", evaluation: "evaluation", other: "other" };
const commandFor = { language: "kredit chat -m", embedding: "kredit embed -m", image: "kredit image -m", evaluation: "kredit eval -m" };

// The makers people look for first; the rest follow by how many models they have.
const FIRST = ["kredit", "openai", "anthropic", "google", "x-ai", "xai", "meta", "meta-llama", "mistral", "mistralai", "deepseek", "qwen", "alibaba"];

export async function models(search, options, command) {
  const api = client(command.optsWithGlobals());
  const spin = spinner("Reading the model list");
  const { data } = await api.get("/v1/models");
  spin.stop();
  let list = data.data;

  // An exact id shows that one model in full.
  const exact = search && list.find((model) => model.id === search);
  if (exact) return details(exact, options);

  const kind = options.type ? KINDS[options.type.toLowerCase()] : undefined;
  if (options.type && !kind) {
    process.stderr.write(`Unknown kind "${options.type}". Use chat, embedding, image, video or evaluation.\n`);
    process.exitCode = 1;
    return;
  }
  const needle = search?.toLowerCase();
  list = list.filter(
    (model) =>
      (!kind || model.type === kind) &&
      (!options.maker || model.owned_by === options.maker.toLowerCase()) &&
      (!needle || `${model.id} ${model.name}`.toLowerCase().includes(needle)),
  );
  if (options.json) return printJson(list);
  if (list.length === 0) {
    process.stdout.write(`${dim("No model matches that.")}\n`);
    return;
  }

  const byMaker = new Map();
  for (const model of list) byMaker.set(model.owned_by, [...(byMaker.get(model.owned_by) ?? []), model]);
  const rank = (maker) => (FIRST.includes(maker) ? FIRST.indexOf(maker) - FIRST.length : 0);
  const makers = [...byMaker.entries()].sort(([a, as], [b, bs]) => rank(a) - rank(b) || bs.length - as.length || a.localeCompare(b));

  const shown = [];
  let count = 0;
  const limit = options.all ? Infinity : 40;
  for (const [maker, entries] of makers) {
    if (count >= limit) break;
    const rows = entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit - count);
    count += rows.length;
    shown.push(`${bold(maker)} ${dim(`${entries.length}`)}`);
    shown.push(table(rows.map((model) => [accent(model.id), kindName[model.type], dim(contextSize(model.context_window)), priceLine(model.pricing)]), { align: [, , "right"] }));
    shown.push("");
  }
  process.stdout.write(shown.join("\n"));
  const hidden = list.length - count;
  process.stdout.write(
    dim(hidden > 0 ? `${credits(count)} of ${credits(list.length)} models shown. Narrow it down, or add --all.\n` : `${credits(list.length)} model${list.length === 1 ? "" : "s"}.\n`),
  );
}

function details(model, options) {
  if (options.json) return printJson(model);
  process.stdout.write(`${bold(model.name)} ${dim(model.id)}\n\n`);
  process.stdout.write(
    `${fields([
      ["Maker", model.owned_by],
      ["Kind", kindName[model.type] ?? model.type],
      ...(model.context_window ? [["Context", `${credits(model.context_window)} tokens`]] : []),
      ["Price", priceLine(model.pricing)],
      ...(commandFor[model.type] ? [["Use it", `${commandFor[model.type]} ${model.id}`]] : []),
    ])}\n`,
  );
}
