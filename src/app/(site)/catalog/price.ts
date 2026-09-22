import type { CatalogPrice } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";

// The price of one typical unit, shared by the page (quick picks) and the table.
// A turn is a 1,000-token prompt with a 500-token answer; image models are
// priced by the picture and video models by the second.
export const TURN_IN = 1_000;
export const TURN_OUT = 500;

export function turnCost(price: CatalogPrice | null) {
  if (!price) return Infinity;
  if (price.per === "image") return price.credits;
  if (price.per === "second") return price.from;
  return (price.input * TURN_IN + price.output * TURN_OUT) / 1_000_000;
}

// Credits with the decimals a small number needs and none a big one does.
export const credits = (value: number) => (value < 10 ? value.toFixed(2).replace(/\.?0+$/, "") : formatCredits(Math.round(value)));
export const turnLabel = (price: CatalogPrice | null) => (price ? (turnCost(price) === 0 ? "free" : `${credits(turnCost(price))} credits`) : "–");
export const turnUnit = (price: CatalogPrice | null) => (price?.per === "image" ? "/ image" : price?.per === "second" ? "/ sec" : "/ turn");

// "400K" or "1M" for a context window or answer length.
export const tokens = (count?: number) => (count ? (count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(count / 1000)}K`) : "");
