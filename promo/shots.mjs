// Screenshots of the live dev site for the promo: hero + each landing section + catalog.
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3459";
const out = new URL("./shots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const page = await launch({ port: 9333, width: 1200, height: 820 });
const shots = [
  { name: "how", url: "/", selector: "#how", wait: 4500 },
  { name: "earn", url: "/", selector: "#earn", wait: 4000 },
];
let current = null;
for (const shot of shots) {
  if (current !== shot.url) {
    await page.navigate(base + shot.url);
    current = shot.url;
    await sleep(1500);
    // No sticky header or Next.js dev badge inside the promo's browser frame.
    await page.evaluate(`(() => { const style = document.createElement("style"); style.textContent = "header, nextjs-portal { display: none !important }"; document.head.append(style); })()`);
  }
  if (shot.selector) {
    const y = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(shot.selector)}); if (!el) return -1; const top = el.getBoundingClientRect().top + window.scrollY; document.documentElement.style.scrollBehavior = "auto"; window.scrollTo({ top, behavior: "instant" }); return window.scrollY; })()`);
    console.log("scrolled to", y);
  } else {
    await page.evaluate("window.scrollTo(0, 0)");
  }
  await sleep(shot.wait);
  writeFileSync(`${out}${shot.name}.png`, await page.screenshot());
  console.log("shot", shot.name);
}
page.close();
