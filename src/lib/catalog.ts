import { ECHO_MODEL, upstream, upstreams, type Upstream } from "./gateway.ts";
import { cheapestVideoRate, CREDITS_PER_USD, ECHO_PRICE, MARGIN, type ModelPrice, type PriceTier, type VideoRate } from "./pricing.ts";

// The models this deployment can reach, read from the provider once and kept
// for ten minutes. It feeds the docs, the playground, /v1/models, and billing
// (which needs each model's price and longest answer).
//
// Vercel AI Gateway publishes its list, with prices, at /v1/models without a
// key. OpenRouter's shape is read too, so either can sit behind UPSTREAM_BASE_URL.

export type ModelType = "language" | "embedding" | "image" | "video" | "evaluation" | "other";

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
  sources: Map<string, Upstream>; // which provider serves each model
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
  const output = num(pricing.output) ?? num(pricing.completion) ?? (type === "embedding" || type === "evaluation" || flat ? 0 : undefined);
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
  if (type === "language" || type === "embedding" || type === "image" || type === "video" || type === "evaluation") return type;
  if (type === undefined) return "language"; // OpenRouter lists language models only
  return "other";
}

// The provider's display name, without the maker OpenRouter puts in front ("OpenAI: GPT-4o").
function modelName(model: Record<string, unknown>, id: string) {
  const name = typeof model.name === "string" ? model.name : id;
  return name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name;
}

// One provider's list, parsed; null when it could not be read.
async function fetchModels({ baseUrl, apiKey }: Upstream): Promise<Record<string, unknown>[] | null> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = ((await response.json()).data ?? []) as Record<string, unknown>[];
    return data.filter((model) => typeof model.id === "string");
  } catch {
    // A provider's list is a nicety; the echo model is always available.
    return null;
  }
}

async function load(): Promise<Loaded> {
  const cached = holder.kreditCatalog;
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;

  const providers = upstreams();
  const lists = await Promise.all(providers.map(fetchModels));
  const value: Loaded = {
    catalog: { live: lists.some(Boolean), models: [ECHO] },
    raw: [],
    prices: new Map([[ECHO_MODEL, ECHO_PRICE]]),
    types: new Map([[ECHO_MODEL, "language"]]),
    sources: new Map(),
  };
  // Providers are merged in order, so a model on both is served by the first.
  for (const [index, list] of lists.entries()) {
    for (const model of list ?? []) {
      const id = model.id as string;
      if (value.sources.has(id)) continue;
      // OpenRouter's own routers (openrouter/auto, …) pick a model for you; the price can't be known in advance.
      if (id.startsWith("openrouter/")) continue;
      const price = priceOf(model);
      const type = typeOf(model);
      if (price) value.prices.set(id, price);
      value.types.set(id, type);
      value.sources.set(id, providers[index]);
      value.raw.push(model);
      value.catalog.models.push({
        id,
        name: modelName(model, id),
        provider: providerOf(id),
        type,
        price: price ? catalogPrice(price, type) : null,
        ...(price?.contextWindow && { contextWindow: price.contextWindow }),
      });
    }
  }
  // A failed fetch is retried on the next request instead of being cached.
  if (lists.every(Boolean)) holder.kreditCatalog = { at: Date.now(), value };
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

// The provider a model is sent to: the one that lists it, else the main one.
// A variant such as "openai/gpt-4o:online" is OpenRouter's way of asking for
// extras, so it goes there whenever OpenRouter is connected.
export async function upstreamFor(modelId: string): Promise<Upstream> {
  const { sources } = await load();
  const providers = upstreams();
  const openRouter = modelId.includes(":") ? providers.find((provider) => provider.isOpenRouter) : undefined;
  return sources.get(modelId) ?? openRouter ?? sources.get(modelId.split(":")[0]) ?? providers[0] ?? upstream();
}

export async function typeFor(modelId: string) {
  const { types } = await load();
  return types.get(modelId) ?? types.get(modelId.split(":")[0]) ?? null;
}
