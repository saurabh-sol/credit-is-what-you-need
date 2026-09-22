import pc from "picocolors";

// Everything the commands print goes through here, so the whole tool looks
// the same: one accent, dim for the incidental, tables that line up.

export const isTTY = process.stdout.isTTY === true;
// The classic Windows console (not Windows Terminal) draws neither braille nor most symbols.
const plain = process.platform === "win32" && !process.env.WT_SESSION && !process.env.TERM_PROGRAM;
export const glyph = { ok: plain ? "+" : "✓", fail: plain ? "x" : "✗", prompt: plain ? ">" : "›", more: plain ? "..." : "…" };
export const accent = (text) => pc.yellow(text);
export const dim = (text) => pc.dim(text);
export const bold = (text) => pc.bold(text);
export const ok = (text) => `${pc.green(glyph.ok)} ${text}`;
export const warn = (text) => `${pc.yellow("!")} ${text}`;
export const fail = (text) => `${pc.red(glyph.fail)} ${text}`;

export const credits = (n) => Number(n).toLocaleString("en-US");
export const usd = (creditsAmount) => `$${(creditsAmount / 1000).toFixed(2)}`;
export const plural = (n, word) => `${credits(n)} ${word}${n === 1 ? "" : "s"}`;
export const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

// A price in a few words, in the unit the model is sold by.
export function priceLine(pricing) {
  if (!pricing) return dim("no price");
  if (pricing.credits_per_image !== undefined) return `${credits(pricing.credits_per_image)} / image`;
  if (pricing.credits_per_second_from !== undefined) return `from ${credits(pricing.credits_per_second_from)} / s`;
  return `${credits(pricing.credits_per_million_input)} in · ${credits(pricing.credits_per_million_output)} out / M tok`;
}

export const contextSize = (tokens) => (!tokens ? "" : tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(tokens / 1000)}K`);

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
const width = (text) => strip(String(text)).length;

// Columns padded to their widest cell. `align` marks right-aligned columns.
export function table(rows, { head, align = [], indent = 2 } = {}) {
  const all = head ? [head, ...rows] : rows;
  const widths = [];
  for (const row of all) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, width(cell))));
  const line = (row, style = (s) => s) =>
    " ".repeat(indent) +
    row
      .map((cell, i) => {
        const pad = widths[i] - width(cell);
        return align[i] === "right" ? " ".repeat(pad) + style(String(cell)) : style(String(cell)) + " ".repeat(pad);
      })
      .join("  ")
      .trimEnd();
  const out = [];
  if (head) out.push(line(head, (s) => dim(s)));
  for (const row of rows) out.push(line(row));
  return out.join("\n");
}

// Label/value pairs, labels dimmed and lined up.
export function fields(pairs, indent = 2) {
  const w = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `${" ".repeat(indent)}${dim(label.padEnd(w))}  ${value}`).join("\n");
}

// A spinner on stderr while something runs; silent when not a terminal.
export function spinner(text) {
  if (!process.stderr.isTTY) return { update() {}, stop() {} };
  const frames = plain ? ["-", "\\", "|", "/"] : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let label = text;
  const draw = () => process.stderr.write(`\r${accent(frames[i++ % frames.length])} ${label}\x1b[K`);
  draw();
  const timer = setInterval(draw, 80);
  return {
    update(next) {
      label = next;
    },
    stop() {
      clearInterval(timer);
      process.stderr.write("\r\x1b[K");
    },
  };
}

// Asks on the terminal. `hidden` keeps the answer off the screen (for keys).
export async function ask(question, { hidden = false } = {}) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  if (hidden) {
    // readline echoes as it goes; muting the output while the secret is typed hides it.
    const write = rl.output.write.bind(rl.output);
    let muted = false;
    rl.output.write = (chunk, ...rest) => (muted ? true : write(chunk, ...rest));
    process.stderr.write(question);
    muted = true;
    const answer = await rl.question("");
    muted = false;
    process.stderr.write("\n");
    rl.close();
    return answer.trim();
  }
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
