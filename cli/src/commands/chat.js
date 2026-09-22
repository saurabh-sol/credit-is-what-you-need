import { client } from "../api.js";
import { readConfig, writeConfig } from "../config.js";
import { accent, ask, bold, credits, dim, glyph, isTTY, printJson, seconds } from "../ui.js";

// chat: one question, a piped file, or a conversation that keeps going.

const DEFAULT_MODEL = "openai/gpt-4o-mini";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

// One whole reply at once, for --json and --no-stream.
async function reply(api, model, messages, options) {
  const started = performance.now();
  const { data, charged, balance } = await api.post("/v1/chat/completions", requestBody(model, messages, options));
  const text = data.choices?.[0]?.message?.content ?? "";
  if (options.json) printJson(data);
  else process.stdout.write(`${text}\n`);
  return { text, charged, balance, ms: performance.now() - started };
}

const requestBody = (model, messages, options) => ({
  model,
  messages,
  ...(options.maxTokens && { max_tokens: Number(options.maxTokens) }),
  ...(options.temperature !== undefined && { temperature: Number(options.temperature) }),
});

async function streamReply(api, model, messages, options) {
  const started = performance.now();
  let text = "";
  let thinking = false;
  const iterator = api.stream("/v1/chat/completions", requestBody(model, messages, options));
  let step = await iterator.next();
  while (!step.done) {
    const piece = step.value;
    if (piece.reasoning && options.thinking) {
      if (!thinking) process.stdout.write(dim("thinking… "));
      thinking = true;
      process.stdout.write(dim(piece.reasoning));
    } else if (piece.text) {
      if (thinking) {
        process.stdout.write("\n\n");
        thinking = false;
      }
      text += piece.text;
      process.stdout.write(piece.text);
    }
    step = await iterator.next();
  }
  if (!text.endsWith("\n")) process.stdout.write("\n");
  const charge = step.value ?? {};
  return { text, charged: charge.credits_charged, balance: charge.balance, ms: performance.now() - started };
}

const bill = ({ charged, balance, ms }) =>
  dim(`· ${charged !== undefined ? `${credits(charged)} credit${charged === 1 ? "" : "s"}` : "cost unknown"}${Number.isFinite(balance) ? ` · ${credits(balance)} left` : ""} · ${seconds(ms)}`);

export async function chat(words, options, command) {
  const api = client(command.optsWithGlobals());
  const model = options.model ?? readConfig().model ?? DEFAULT_MODEL;
  const system = options.system ? [{ role: "system", content: options.system }] : [];
  let prompt = words.join(" ").trim();
  if (!prompt && !process.stdin.isTTY) prompt = await readStdin();

  if (prompt) {
    const messages = [...system, { role: "user", content: prompt }];
    const result = options.json || options.stream === false ? await reply(api, model, messages, options) : await streamReply(api, model, messages, options);
    if (!options.json && isTTY && !options.quiet) process.stderr.write(`${bill(result)}\n`);
    return;
  }

  if (!isTTY) {
    process.stderr.write("Nothing to send. Pass a prompt, or pipe text in.\n");
    process.exitCode = 1;
    return;
  }
  await conversation(api, model, system, options);
}

// A back-and-forth in the terminal. /model switches, /new starts over, /quit leaves.
async function conversation(api, initialModel, system, options) {
  let model = initialModel;
  let messages = [...system];
  process.stderr.write(`${bold("Kredit chat")} ${dim(`· ${model} · /model <id> to switch, /new to start over, /quit to leave`)}\n`);
  for (;;) {
    let line;
    try {
      line = await ask(`${accent(glyph.prompt)} `);
    } catch {
      break; // Ctrl-C or the input closed
    }
    if (!line) continue;
    if (line === "/quit" || line === "/exit" || line === "/q") break;
    if (line === "/new") {
      messages = [...system];
      process.stderr.write(dim("Started over.\n"));
      continue;
    }
    if (line.startsWith("/model")) {
      const next = line.slice(6).trim();
      if (next) {
        model = next;
        writeConfig({ ...readConfig(), model });
        process.stderr.write(dim(`Now talking to ${model}.\n`));
      } else process.stderr.write(dim(`${model}\n`));
      continue;
    }
    messages.push({ role: "user", content: line });
    try {
      const result = await streamReply(api, model, messages, options);
      messages.push({ role: "assistant", content: result.text });
      process.stderr.write(`${bill(result)}\n`);
    } catch (error) {
      messages.pop();
      throw error;
    }
  }
}
