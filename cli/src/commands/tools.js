import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { client } from "../api.js";
import { accent, bold, credits, dim, fields, glyph, ok, printJson, seconds, spinner, table } from "../ui.js";

// eval, embed, image: the endpoints that are not a conversation.

// "name: question" with an optional "[a, b, c]" of options or rubric levels.
function parseQuestion(text, type) {
  const match = /^\s*([\w-]+)\s*:\s*(.+?)\s*(?:\[(.*)\])?\s*$/s.exec(text);
  if (!match) throw new Error(`Write a question as name: "question" [option, option]; got "${text}".`);
  const [, name, instructions, list] = match;
  const items = list ? list.split(",").map((item) => item.trim()).filter(Boolean) : [];
  if (type === "noul") return [name, { type, instructions }];
  if (items.length < 2) throw new Error(`"${name}" needs at least two ${type === "choice" ? "options" : "rubric levels"} in [brackets].`);
  if (type === "choice") return [name, { type, instructions, criteria: Object.fromEntries(items.map((item) => item.split(/\s*=\s*/).length > 1 ? item.split(/\s*=\s*/, 2) : [item, item])) }];
  return [name, { type, instructions, criteria: items }];
}

const pct = (value) => `${Math.round(value * 100)}%`;

function answerLine(answer) {
  if (answer.type === "noul") return `${answer.noul >= 0.5 ? bold("yes") : bold("no")} ${dim(pct(answer.noul))}`;
  if (answer.type === "choice") {
    const odds = Object.entries(answer.probabilities ?? {}).sort(([, a], [, b]) => b - a).map(([key, value]) => `${key} ${pct(value)}`);
    return `${bold(answer.choice)} ${dim(odds.join("  "))}`;
  }
  if (answer.type === "score") {
    const level = answer.legend?.[String(Math.round(answer.score))];
    return `${bold(level ?? answer.score)} ${dim(`${answer.score.toFixed(2)} of ${Object.keys(answer.legend ?? {}).length - 1}`)}`;
  }
  return JSON.stringify(answer);
}

export async function evaluate(state, options, command) {
  const api = client(command.optsWithGlobals());
  const questions = {};
  try {
    for (const text of options.yesNo ?? []) Object.assign(questions, Object.fromEntries([parseQuestion(text, "noul")]));
    for (const text of options.choice ?? []) Object.assign(questions, Object.fromEntries([parseQuestion(text, "choice")]));
    for (const text of options.score ?? []) Object.assign(questions, Object.fromEntries([parseQuestion(text, "score")]));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (Object.keys(questions).length === 0) {
    process.stderr.write("Ask at least one question: --yes-no, --choice or --score.\n");
    process.exitCode = 1;
    return;
  }
  const started = performance.now();
  const spin = spinner("Evaluating");
  const { data, charged, balance } = await api.post("/v1/systemone", { model: options.model ?? "typesafe-ai/jev", state, questions });
  spin.stop();
  if (options.json) return printJson(data);
  process.stdout.write(`${fields(Object.entries(data.answers).map(([name, answer]) => [name, answerLine(answer)]))}\n`);
  process.stderr.write(`${dim(`· ${credits(charged)} credit${charged === 1 ? "" : "s"} · ${credits(balance)} left · ${seconds(performance.now() - started)}`)}\n`);
}

export async function embed(words, options, command) {
  const api = client(command.optsWithGlobals());
  const input = words.join(" ").trim();
  if (!input) {
    process.stderr.write("Give some text to embed.\n");
    process.exitCode = 1;
    return;
  }
  const spin = spinner("Embedding");
  const { data, charged, balance } = await api.post("/v1/embeddings", { model: options.model ?? "openai/text-embedding-3-small", input });
  spin.stop();
  const vector = data.data[0].embedding;
  if (options.json) return printJson(data);
  if (options.raw) return process.stdout.write(`${JSON.stringify(vector)}\n`);
  process.stdout.write(`${bold(`${vector.length} dimensions`)} ${dim(`[${vector.slice(0, 6).map((n) => n.toFixed(4)).join(", ")}, ${glyph.more}]`)}\n`);
  process.stderr.write(`${dim(`· ${credits(charged)} credit${charged === 1 ? "" : "s"} · ${credits(balance)} left · --raw prints the whole vector, --json the response`)}\n`);
}

export async function image(words, options, command) {
  const api = client(command.optsWithGlobals());
  const prompt = words.join(" ").trim();
  if (!prompt) {
    process.stderr.write("Describe the picture.\n");
    process.exitCode = 1;
    return;
  }
  const n = Number(options.count ?? 1);
  const started = performance.now();
  const spin = spinner(n === 1 ? "Making the picture" : `Making ${n} pictures`);
  const { data, charged, balance } = await api.post("/v1/images/generations", { model: options.model ?? "openai/gpt-image-2", prompt, n, ...(options.size && { size: options.size }) });
  spin.stop();
  if (options.json) return printJson(data);
  const dir = options.out ?? ".";
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const files = data.data.map((entry, index) => {
    const ext = (entry.media_type ?? "image/png").split("/")[1].replace("jpeg", "jpg");
    const path = join(dir, `kredit-${stamp}${data.data.length > 1 ? `-${index + 1}` : ""}.${ext}`);
    writeFileSync(path, Buffer.from(entry.b64_json, "base64"));
    return path;
  });
  process.stdout.write(`${ok(files.length === 1 ? `Saved ${accent(files[0])}` : `Saved ${files.length} pictures`)}\n`);
  if (files.length > 1) process.stdout.write(`${table(files.map((file) => [accent(file)]))}\n`);
  process.stderr.write(`${dim(`· ${credits(charged)} credit${charged === 1 ? "" : "s"} · ${credits(balance)} left · ${seconds(performance.now() - started)}`)}\n`);
}
