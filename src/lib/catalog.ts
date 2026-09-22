import { ECHO_MODEL, upstream } from "./gateway.ts";
import type { ModelPrice } from "./pricing.ts";

// The public list of models this deployment can reach, for the docs, the
// playground and /v1/models, with each model's list price for billing.

export type CatalogModel = { id: string; name: string; provider: string; created?: number; price?: ModelPrice };
export type Catalog = { live: boolean; models: CatalogModel[] };

const ECHO: CatalogModel = { id: ECHO_MODEL, name: "Echo (test model)", provider: "kredit" };
const CACHE_MS = 10 * 60_000;
const holder = globalThis as { kreditCatalog?: { at: number; value: Catalog } };

const providerOf = (id: string) => (id.includes("/") ? id.split("/")[0] : "other");

// One entry of a provider's /models list. Vercel AI Gateway prices `input` and
// `output`; OpenRouter says `prompt` and `completion`. Both are USD per token.
type ListedModel = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  created?: unknown;
  pricing?: { input?: unknown; output?: unknown; prompt?: unknown; completion?: unknown; input_cache_read?: unknown };
};

const usdPerToken = (value: unknown) => {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

function priceOfListed(pricing: ListedModel["pricing"]): ModelPrice | undefined {
  const input = usdPerToken(pricing?.input ?? pricing?.prompt);
  const output = usdPerToken(pricing?.output ?? pricing?.completion);
  if (input === undefined || output === undefined) return undefined;
  const cachedInput = usdPerToken(pricing?.input_cache_read);
  return { input, output, ...(cachedInput !== undefined && { cachedInput }) };
}

// Only chat models belong in the list: embedding, image and video models
// cannot answer /v1/chat/completions. Lists that do not say a type are trusted.
export function parseModels(data: unknown): CatalogModel[] {
  if (!Array.isArray(data)) return [];
  return (data as ListedModel[])
    .filter((model): model is ListedModel & { id: string } => typeof model.id === "string")
    .filter((model) => model.type === undefined || model.type === "language")
    .map((model) => {
      const price = priceOfListed(model.pricing);
      return {
        id: model.id,
        name: typeof model.name === "string" ? model.name : model.id,
        provider: providerOf(model.id),
        ...(typeof model.created === "number" && { created: model.created }),
        ...(price && { price }),
      };
    });
}

export async function catalog(): Promise<Catalog> {
  const cached = holder.kreditCatalog;
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;

  const { baseUrl, apiKey } = upstream();
  let value: Catalog = { live: false, models: [ECHO] };
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) value = { live: true, models: [ECHO, ...parseModels((await response.json()).data)] };
    } catch {
      // The provider's list is a nicety; the echo model is always available.
    }
  }
  // A failed fetch is retried on the next request instead of being cached.
  if (value.live || !apiKey) holder.kreditCatalog = { at: Date.now(), value };
  return value;
}

// A model's list price, or nothing for models the provider did not price.
export async function priceOf(modelId: string) {
  return (await catalog()).models.find((model) => model.id === modelId)?.price;
}
