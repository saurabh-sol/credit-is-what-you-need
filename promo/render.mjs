// Renders promo.html to frames (and, unless PREVIEW is set, to an MP4).
//   node render.mjs                 -> frames/00000.png … + kredit-promo.mp4
//   PREVIEW=0,1.5,4,9,14,19,24,28 node render.mjs -> preview/<t>.png only
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { launch } from "./cdp.mjs";

// ffmpeg: FFMPEG=/path, or the ffmpeg-static package if installed, else one on PATH.
const ffmpeg = process.env.FFMPEG ?? (() => { try { return createRequire(import.meta.url)("ffmpeg-static"); } catch { return "ffmpeg"; } })();
const dir = new URL("./", import.meta.url).pathname;
const FPS = 30;
const SECONDS = 30;

const page = await launch({ port: 9334, width: 1920, height: 1080 });
await page.navigate(`file://${dir}promo.html`);
await page.evaluate("window.ready");

const preview = process.env.PREVIEW;
if (preview) {
  mkdirSync(`${dir}preview`, { recursive: true });
  for (const t of preview.split(",").map(Number)) {
    await page.evaluate(`window.seek(${t * 1000})`);
    writeFileSync(`${dir}preview/${t}.png`, await page.screenshot());
    console.log("preview", t);
  }
} else {
  rmSync(`${dir}frames`, { recursive: true, force: true });
  mkdirSync(`${dir}frames`);
  const total = FPS * SECONDS;
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate(`window.seek(${(i / FPS) * 1000})`);
    writeFileSync(`${dir}frames/${String(i).padStart(5, "0")}.png`, await page.screenshot());
    if (i % 90 === 0) console.log(`frame ${i}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  const out = process.env.OUT ?? `${dir}kredit-promo.mp4`;
  // Soundtrack: score.wav from `node score.mjs`, muxed in when present.
  const audio = existsSync(`${dir}score.wav`) ? ["-i", `${dir}score.wav`, "-c:a", "aac", "-b:a", "192k", "-shortest"] : [];
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}frames/%05d.png`, ...audio,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
  ], { stdio: "inherit" });
  console.log("wrote", out);
}
page.close();
