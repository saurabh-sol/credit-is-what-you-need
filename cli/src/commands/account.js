import { ApiError, client } from "../api.js";
import { clearConfig, configPath, readConfig, settings, writeConfig } from "../config.js";
import { accent, ask, bold, credits, dim, fail, fields, ok, printJson, shortAddress, spinner, usd } from "../ui.js";

// login, logout, whoami, config: who you are and where the key is kept.

export async function login(keyArg, options, command) {
  const global = command.optsWithGlobals();
  let key = keyArg ?? global.key ?? process.env.KREDIT_API_KEY;
  const baseUrl = settings({ url: global.url }).baseUrl.value;
  if (!key) {
    process.stderr.write(`Create a key at ${accent(`${baseUrl}/dashboard/keys`)}, then paste it here.\n`);
    key = await ask("API key: ", { hidden: true });
  }
  if (!/^kred(it)?_sk_[A-Za-z0-9_-]{16,}$/.test(key)) {
    process.stderr.write(`${fail("That does not look like a Kredit key")} ${dim("(they start with kred_sk_)")}\n`);
    process.exitCode = 1;
    return;
  }
  const spin = spinner("Checking the key");
  try {
    const { data } = await client({ url: baseUrl, key }).get("/v1/account");
    spin.stop();
    writeConfig({ ...readConfig(), key, baseUrl });
    process.stdout.write(`${ok(`Signed in as ${bold(shortAddress(data.address))}`)} ${dim(`· key "${data.key.name}" · ${credits(data.balance)} credits`)}\n`);
    process.stdout.write(dim(`  Saved to ${configPath}\n`));
  } catch (error) {
    spin.stop();
    if (error instanceof ApiError && error.code === "invalid_api_key") {
      process.stderr.write(`${fail("The server did not accept that key.")} ${dim("Keys are shown once, when created; make a new one if this one is lost.")}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

export function logout() {
  clearConfig();
  process.stdout.write(`${ok("Signed out.")} ${dim("The key was removed from this machine; revoke it on the dashboard to retire it.")}\n`);
}

export async function whoami(options, command) {
  const api = client(command.optsWithGlobals());
  const { data } = await api.get("/v1/account");
  if (options.json) return printJson(data);
  process.stdout.write(`${bold(data.address)} ${dim(`via key "${data.key.name}" (${data.key.prefix})`)}\n\n`);
  process.stdout.write(
    `${fields([
      ["Balance", `${accent(credits(data.balance))} credits ${dim(`≈ ${usd(data.balance)} of AI usage`)}`],
      ...(data.held ? [["Held", `${credits(data.held)} ${dim("promised to calls still running")}`]] : []),
      ["Available", `${credits(data.available)} credits`],
      ["Spent so far", `${credits(data.total_spent)} credits`],
      ["Rate limit", `${data.rate_limit.requests_per_minute} requests a minute`],
      ["Server", api.baseUrl],
    ])}\n`,
  );
}

export function config(options, command) {
  const current = settings(command.optsWithGlobals());
  if (options.json) return printJson({ baseUrl: current.baseUrl.value, key: current.key.value ? `${current.key.value.slice(0, 12)}…` : null, keyFrom: current.key.from, file: configPath });
  process.stdout.write(
    `${fields([
      ["Server", `${current.baseUrl.value} ${dim(`(${current.baseUrl.from})`)}`],
      ["Key", current.key.value ? `${current.key.value.slice(0, 12)}… ${dim(`(${current.key.from})`)}` : dim("none; run `kredit login`")],
      ["File", configPath],
    ])}\n`,
  );
}

// `kredit config set url <url>` keeps a different server, e.g. a local one.
export function setUrl(url) {
  const clean = url.replace(/\/$/, "");
  if (!/^https?:\/\//.test(clean)) {
    process.stderr.write(`${fail("The server address needs http:// or https://")}\n`);
    process.exitCode = 1;
    return;
  }
  writeConfig({ ...readConfig(), baseUrl: clean });
  process.stdout.write(`${ok(`Server set to ${clean}`)}\n`);
}
