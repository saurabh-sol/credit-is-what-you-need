// Live demo of the three kinds of call, through Kredit's own API and billed
// from a wallet's credits: streaming text, an image saved to a file, and a
// video saved to a file. It spends real money on the gateway (well under $1).
//
//   npx next start -p 3458         (with UPSTREAM_API_KEY set to a Vercel AI Gateway key)
//   DATABASE_PATH=... BASE_URL=http://localhost:3458 node scripts/gateway-demo.mjs
//
// Credits are seeded straight into the database (local testing only).
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath, sessionCookie } from "./lib/test-session.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.DEMO_OUT ?? "out";
const TEXT_MODEL = process.env.DEMO_TEXT_MODEL ?? "openai/gpt-6-astra";
const IMAGE_MODEL = process.env.DEMO_IMAGE_MODEL ?? "openai/gpt-image-2";
const VIDEO_MODEL = process.env.DEMO_VIDEO_MODEL ?? "google/veo-3.1-fast-generate-001";
fs.mkdirSync(out, { recursive: true });

const WALLET = `0x${Date.now().toString(16).padStart(40, "a")}`;
const cookie = await sessionCookie(WALLET);
new DatabaseSync(databasePath)
  .prepare("INSERT INTO ledger (address, amount, kind, memo) VALUES (?, 5000, 'claim', 'gateway-demo')")
  .run(WALLET.toLowerCase());
const { key } = await (await fetch(`${base}/api/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "demo" }) })).json();
const auth = { authorization: `Bearer ${key}`, "content-type": "application/json" };
const balance = async () => (await (await fetch(`${base}/v1/account`, { headers: auth })).json()).balance;
const fail = async (what, response) => {
  const body = await response.text();
  throw new Error(`${what} failed: HTTP ${response.status} ${body.slice(0, 400)}`);
};

console.log(`Wallet ${WALLET} starts with ${await balance()} credits.\n`);

// --- 1. streaming text
console.log(`== Text: ${TEXT_MODEL} (streaming)`);
const chat = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ model: TEXT_MODEL, stream: true, max_tokens: 120, messages: [{ role: "user", content: "In two sentences, what is Robinhood Chain?" }] }),
});
if (!chat.ok) await fail("text", chat);
const reader = chat.body.getReader();
const decoder = new TextDecoder();
let pending = "";
let charge;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  pending += decoder.decode(value, { stream: true });
  const lines = pending.split("\n");
  pending = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) continue;
    const event = JSON.parse(line.slice(6));
    if (event.kredit) charge = event.kredit;
    process.stdout.write(event.choices?.[0]?.delta?.content ?? "");
  }
}
console.log(`\n-> charged ${charge?.credits_charged} credits, balance ${charge?.balance}\n`);

// --- 2. an image, saved to a file
console.log(`== Image: ${IMAGE_MODEL}`);
const image = await fetch(`${base}/v1/images/generations`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ model: IMAGE_MODEL, prompt: "A paper boat drifting across a puddle in the rain, soft morning light", size: "1024x1024" }),
});
if (!image.ok) await fail("image", image);
const imageBody = await image.json();
const first = imageBody.data[0];
const imagePath = path.join(out, `image.${first.media_type?.split("/")[1] ?? "png"}`);
fs.writeFileSync(imagePath, Buffer.from(first.b64_json, "base64"));
console.log(`-> saved ${imagePath} (${fs.statSync(imagePath).size} bytes), usage ${JSON.stringify(imageBody.usage)}, charged ${image.headers.get("x-kredit-credits-charged")} credits, balance ${image.headers.get("x-kredit-balance")}\n`);

// --- 3. a video, saved to a file
console.log(`== Video: ${VIDEO_MODEL} (4s, 720p, no sound; this takes a minute or two)`);
const startedAt = Date.now();
const video = await fetch(`${base}/v1/videos/generations`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ model: VIDEO_MODEL, prompt: "A paper plane looping over a city at dusk, camera following it", duration: 4, resolution: "720p", aspect_ratio: "16:9", generate_audio: false }),
});
if (!video.ok) await fail("video", video);
const videoBody = await video.json();
const clip = videoBody.data[0];
const videoPath = path.join(out, `video.${clip.media_type?.split("/")[1] ?? "mp4"}`);
fs.writeFileSync(videoPath, Buffer.from(clip.b64_json, "base64"));
console.log(`-> saved ${videoPath} (${fs.statSync(videoPath).size} bytes) in ${Math.round((Date.now() - startedAt) / 1000)}s, charged ${video.headers.get("x-kredit-credits-charged")} credits, balance ${video.headers.get("x-kredit-balance")}\n`);

const usage = await (await fetch(`${base}/v1/usage`, { headers: auth })).json();
console.log("Spend by model:", usage.by_model.map((row) => `${row.model}: ${row.credits}`).join(", "));
console.log(`Wallet ends with ${await balance()} credits.`);
