#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import pc from "picocolors";
import { ApiError, adviceFor } from "../src/api.js";
import { config, login, logout, setUrl, whoami } from "../src/commands/account.js";
import { chat } from "../src/commands/chat.js";
import { models } from "../src/commands/models.js";
import { embed, evaluate, image } from "../src/commands/tools.js";
import { usage } from "../src/commands/usage.js";
import { settings } from "../src/config.js";
import { dim, fail } from "../src/ui.js";

// `kredit models | head` closes stdout early; that is not an error.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const program = new Command("kredit")
  .description("Kredit from the terminal: chat with any model, check your balance, read your bill.")
  .version(version, "-v, --version")
  .option("--url <url>", "the Kredit server (default: the saved one, or usekredit.space)")
  .option("--key <key>", "an API key for this run only")
  .configureHelp({ sortSubcommands: false })
  .showHelpAfterError(dim("(run with --help for usage)"))
  .addHelpText(
    "after",
    `
Examples:
  kredit login                                 paste a key from the dashboard
  kredit chat "explain gas fees in one line"   ask the default model
  kredit chat -m anthropic/claude-3-haiku      talk to a model, turn by turn
  cat notes.md | kredit chat -s "summarize"    pipe text in
  kredit models claude                         find a model
  kredit usage --from 2026-09-01               what this month cost

Keys come from ${pc.underline("https://usekredit.space/dashboard/keys")}. KREDIT_API_KEY and
KREDIT_BASE_URL in the environment override the saved settings.`,
  );

program.command("login [key]").description("save an API key on this machine").action(login);
program.command("logout").description("forget the saved key").action(logout);
program.command("whoami").alias("account").alias("balance").description("your wallet, key and balance").option("--json", "print the account as JSON").action(whoami);

program
  .command("chat [prompt...]")
  .description("ask a model; with no prompt, start a conversation")
  .option("-m, --model <id>", "the model to use (default: openai/gpt-4o-mini, or the last /model)")
  .option("-s, --system <text>", "a system prompt")
  .option("--max-tokens <n>", "cap the reply length")
  .option("--temperature <n>", "0 for the most predictable answer, up to 2")
  .option("--thinking", "show a reasoning model's thoughts as they arrive")
  .option("--no-stream", "wait for the whole reply, then print it")
  .option("-q, --quiet", "no cost line after the reply")
  .option("--json", "print the raw response")
  .action(chat);

program
  .command("models [search]")
  .description("list models, search them, or show one by its exact id")
  .option("-t, --type <kind>", "chat, embedding, image, video or evaluation")
  .option("--maker <name>", "only one maker, e.g. openai")
  .option("-a, --all", "show every match, not just the first forty")
  .option("--json", "print the list as JSON")
  .action(models);

program
  .command("usage")
  .description("what your key spent, by model and call by call")
  .option("--from <date>", "start of the period, YYYY-MM-DD")
  .option("--to <date>", "end of the period, YYYY-MM-DD")
  .option("--limit <n>", "how many recent calls to list", "20")
  .option("--json", "print the report as JSON")
  .action(usage);

program
  .command("eval <state>")
  .description("ask Jev typed questions about a piece of text")
  .option("-m, --model <id>", "an evaluation model", "typesafe-ai/jev")
  .option("--yes-no <question>", 'name: "question"', collect, [])
  .option("--choice <question>", 'name: "question" [option, option]', collect, [])
  .option("--score <question>", 'name: "question" [lowest level, …, highest]', collect, [])
  .option("--json", "print the answers as JSON")
  .addHelpText(
    "after",
    `
Example:
  kredit eval "I was charged twice and want a refund" \\
    --yes-no 'refund: Is the customer asking for money back?' \\
    --choice 'team: Which team handles this? [billing=charges and refunds, technical=bugs]' \\
    --score 'urgency: How urgent is this? [can wait, today, blocked right now]'`,
  )
  .action(evaluate);

program
  .command("embed <text...>")
  .description("turn text into a vector")
  .option("-m, --model <id>", "an embedding model", "openai/text-embedding-3-small")
  .option("--raw", "print the whole vector as a JSON array")
  .option("--json", "print the raw response")
  .action(embed);

program
  .command("image <prompt...>")
  .description("make a picture and save it")
  .option("-m, --model <id>", "an image model", "openai/gpt-image-2")
  .option("-n, --count <n>", "how many pictures", "1")
  .option("--size <wxh>", "e.g. 1024x1024")
  .option("-o, --out <dir>", "where to save (default: here)")
  .option("--json", "print the raw response instead of saving")
  .action(image);

const configCommand = program.command("config").description("show where the key and server come from").option("--json", "as JSON").action(config);
configCommand.command("set-url <url>").description("use another Kredit server, e.g. http://localhost:3000").action(setUrl);

function collect(value, previous) {
  return [...previous, value];
}

// One place for failures: the server's message, then what to do about it.
try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`${fail(error.message)}\n`);
  if (error instanceof ApiError) {
    const advice = adviceFor(error, settings(program.opts()).baseUrl.value);
    if (advice) process.stderr.write(`  ${dim(advice)}\n`);
    if (error.requestId) process.stderr.write(`  ${dim(`request ${error.requestId}`)}\n`);
  } else if (error.cause?.code === "ECONNREFUSED" || error.name === "TypeError") {
    process.stderr.write(`  ${dim(`Could not reach ${settings(program.opts()).baseUrl.value}. Is the address right? \`kredit config\` shows it.`)}\n`);
  }
  process.exitCode = 1;
}
