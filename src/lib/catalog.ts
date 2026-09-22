import { ECHO_MODEL, upstream } from "./gateway.ts";
import { cheapestVideoRate, CREDITS_PER_USD, ECHO_PRICE, MARGIN, type ModelPrice, type PriceTier, type VideoRate } from "./pricing.ts";

// The models this deployment can reach, read from the provider once and kept
// for ten minutes. It feeds the docs, the playground, /v1/models, and billing
// (which needs each model's price and longest answer).
//
// Vercel AI Gateway publishes its list, with prices, at /v1/models without a
// key. OpenRouter's shape is read too, so either can sit behind UPSTREAM_BASE_URL.

export type ModelType = "language" | "embedding" | "image" | "video" | "other";

// What a caller pays, margin included, in the unit the model is sold by.
export type CatalogPrice =
  | { per: "million_tokens"; input: number; output: number }
  | { per: "image"; credits: number }
  | { per: "second"; from: number; resolution: string; rates: { resolution: string; audio?: boolean; credits: number }[] };

export type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  type: ModelType;
  price: CatalogPrice | null;
  contextWindow?: number;
};
export type Catalog = { live: boolean; models: CatalogModel[] };

type Loaded = {
  catalog: Catalog;
  raw: Record<string, unknown>[]; // the provider's own entries, passed through by /v1/models
  prices: Map<string, ModelPrice>;
  types: Map<string, ModelType>;
};

const ECHO: CatalogModel = {
  id: ECHO_MODEL,
  name: "Echo (test model)",
  provider: "kredit",
  type: "language",
  price: catalogPrice(ECHO_PRICE, "language"),
};
const CACHE_MS = 10 * 60_000;
const holder = globalThis as { kreditCatalog?: { at: number; value: Loaded } };

const providerOf = (id: string) => (id.includes("/") ? id.split("/")[0] : "other");

function toCredits(usd: number) {
  return Math.round(usd * (1 + MARGIN) * CREDITS_PER_USD * 100) / 100;
}

export function catalogPrice(price: ModelPrice, type: ModelType): CatalogPrice | null {
  if (type === "video") {
    const rate = cheapestVideoRate(price);
    if (!rate) return null;
    const rates = (price.perSecond ?? []).map(({ resolution, audio, usd }) => ({ resolution, ...(audio !== undefined && { audio }), credits: toCredits(usd) }));
    return { per: "second", from: toCredits(rate.usd), resolution: rate.resolution, rates };
  }
  if (type === "image" && price.perImage !== undefined) return { per: "image", credits: toCredits(price.perImage) };
  return { per: "million_tokens", input: toCredits(price.input * 1_000_000), output: toCredits(price.output * 1_000_000) };
}

// A number the provider wrote as a string ("0.000003"), or undefined.
const num = (value: unknown) => {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

function tiers(value: unknown): PriceTier[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: PriceTier[] = [];
  for (const step of value as { min?: unknown; max?: unknown; cost?: unknown }[]) {
    const usd = num(step?.cost);
    const min = num(step?.min);
    if (usd === undefined || min === undefined) return undefined;
    const max = num(step?.max);
    parsed.push({ min, usd, ...(max !== undefined && { max }) });
  }
  return parsed.length > 0 ? parsed : undefined;
}

// Vercel's per-second video prices -> our rates.
function videoRates(value: unknown): VideoRate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rates: VideoRate[] = [];
  for (const entry of value as { resolution?: unknown; audio?: unknown; cost_per_second?: unknown }[]) {
    const usd = num(entry?.cost_per_second);
    if (usd === undefined || typeof entry.resolution !== "string") continue;
    rates.push({ resolution: entry.resolution.toLowerCase(), usd, ...(typeof entry.audio === "boolean" && { audio: entry.audio }) });
  }
  return rates.length > 0 ? rates : undefined;
}

// The provider's entry -> our price list. Null when there is no usable price.
function priceOf(model: Record<string, unknown>): ModelPrice | null {
  const pricing = model.pricing as Record<string, unknown> | undefined;
  if (!pricing) return null;
  const type = typeOf(model);
  const perImage = num(pricing.image);
  const perSecond = videoRates(pricing.video_duration_pricing);
  // Sold by the image or by the second: no token prices needed.
  const flat = (type === "image" && perImage !== undefined) || (type === "video" && perSecond !== undefined);
  // Vercel: input/output; OpenRouter: prompt/completion. Embedding models
  // write nothing back, so they list no output price.
  const input = num(pricing.input) ?? num(pricing.prompt) ?? (flat ? 0 : undefined);
  const output = num(pricing.output) ?? num(pricing.completion) ?? (type === "embedding" || flat ? 0 : undefined);
  if (input === undefined || output === undefined) return null;
  const top = model.top_provider as Record<string, unknown> | undefined;
  const maxOutputTokens = num(model.max_tokens) ?? num(top?.max_completion_tokens);
  const contextWindow = num(model.context_window) ?? num(model.context_length);
  return {
    input,
    output,
    ...(num(pricing.input_cache_read) !== undefined && { cacheRead: num(pricing.input_cache_read) }),
    ...(num(pricing.input_cache_write) !== undefined && { cacheWrite: num(pricing.input_cache_write) }),
    ...(tiers(pricing.input_tiers) && { inputTiers: tiers(pricing.input_tiers) }),
    ...(tiers(pricing.output_tiers) && { outputTiers: tiers(pricing.output_tiers) }),
    ...(maxOutputTokens && { maxOutputTokens }),
    ...(contextWindow && { contextWindow }),
    ...(perImage !== undefined && { perImage }),
    ...(perSecond && { perSecond }),
  };
}

function typeOf(model: Record<string, unknown>): ModelType {
  const type = model.type;
  if (type === "language" || type === "embedding" || type === "image" || type === "video") return type;
  if (type === undefined) return "language"; // OpenRouter lists language models only
  return "other";
}

async function load(): Promise<Loaded> {
  const cached = holder.kreditCatalog;
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;

  const { baseUrl, apiKey } = upstream();
  let value: Loaded = {
    catalog: { live: false, models: [ECHO] },
    raw: [],
    prices: new Map([[ECHO_MODEL, ECHO_PRICE]]),
    types: new Map([[ECHO_MODEL, "language"]]),
  };
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const data = ((await response.json()).data ?? []) as Record<string, unknown>[];
        const known = data.filter((model) => typeof model.id === "string");
        const prices = new Map(value.prices);
        const types = new Map(value.types);
        const models: CatalogModel[] = [ECHO];
        for (const model of known) {
          const id = model.id as string;
          const price = priceOf(model);
          const type = typeOf(model);
          if (price) prices.set(id, price);
          types.set(id, type);
          models.push({
            id,
            name: typeof model.name === "string" ? model.name : id,
            provider: providerOf(id),
            type,
            price: price ? catalogPrice(price, type) : null,
            ...(price?.contextWindow && { contextWindow: price.contextWindow }),
          });
        }
        value = { catalog: { live: true, models }, raw: known, prices, types };
      }
    } catch {
      // The provider's list is a nicety; the echo model is always available.
    }
  }
  // A failed fetch is retried on the next request instead of being cached.
  if (value.catalog.live || !apiKey) holder.kreditCatalog = { at: Date.now(), value };
  return value;
}

export const catalog = async () => (await load()).catalog;

// The provider's own model entries, for /v1/models.
export const providerModels = async () => (await load()).raw;

// What a model costs, or null when the provider doesn't list it. A variant
// such as "openai/gpt-4o:online" is priced like the model it is built on.
export async function priceFor(modelId: string) {
  const { prices } = await load();
  return prices.get(modelId) ?? prices.get(modelId.split(":")[0]) ?? null;
}

export async function typeFor(modelId: string) {
  const { types } = await load();
  return types.get(modelId) ?? types.get(modelId.split(":")[0]) ?? null;
}
