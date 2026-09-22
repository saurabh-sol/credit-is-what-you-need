// Packs the CLI into public/cli/kredit-cli.tgz, so every deploy serves the
// current one and anyone can install it with
//   npm install -g https://usekredit.space/cli/kredit-cli.tgz
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = join("public", "cli");
mkdirSync(out, { recursive: true });
for (const file of readdirSync(out)) if (file.endsWith(".tgz")) rmSync(join(out, file));
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--pack-destination", join("..", out)], { cwd: "cli", stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
const packed = readdirSync(out).find((file) => file.endsWith(".tgz"));
renameSync(join(out, packed), join(out, "kredit-cli.tgz"));
console.log(`cli -> ${join(out, "kredit-cli.tgz")}`);
