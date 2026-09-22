import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Where the key lives, readable by you alone: ~/.config/kredit/config.json on
// macOS and Linux (or under $XDG_CONFIG_HOME), %APPDATA%\kredit\config.json on
// Windows. KREDIT_API_KEY and KREDIT_BASE_URL in the environment win over the
// file, so scripts and CI never touch it.

export const DEFAULT_BASE_URL = "https://usekredit.space";

const dir =
  process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "kredit")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "kredit");
export const configPath = join(dir, "config.json");

export function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(config) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // Windows has no such bits; the folder under the profile is already private to the user.
  if (process.platform !== "win32") chmodSync(configPath, 0o600);
}

export function clearConfig() {
  if (existsSync(configPath)) unlinkSync(configPath);
}

// What this run uses, and where each part came from (shown by `kredit config`).
export function settings(overrides = {}) {
  const file = readConfig();
  const pick = (flag, env, saved, fallback) => {
    if (flag) return { value: flag, from: "flag" };
    if (process.env[env]) return { value: process.env[env], from: `$${env}` };
    if (saved) return { value: saved, from: "config" };
    return { value: fallback, from: "default" };
  };
  const baseUrl = pick(overrides.url, "KREDIT_BASE_URL", file.baseUrl, DEFAULT_BASE_URL);
  const key = pick(overrides.key, "KREDIT_API_KEY", file.key, undefined);
  return { baseUrl: { ...baseUrl, value: baseUrl.value.replace(/\/$/, "") }, key };
}
