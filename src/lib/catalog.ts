import type { ModelLimits } from "./budget.ts";
import { ECHO_MODEL, upstream } from "./gateway.ts";

// The models this deployment can reach, read from the provider once and kept
// for ten minutes. It feeds the docs, the playground, /v1/models, and the
// spend guard (which needs each model's price and longest answer).

export type CatalogModel = { id: string; name: string; provider: string };
export type Catalog = { live: boolean; models: CatalogModel[] };

type Loaded = {
  catalog: Catalog;
  raw: unknown[]; // the provider's own entries, passed through by /v1/models
  limits: Map<string, ModelLimits>;
};

const ECHO: CatalogModel = { id: ECHO_MODEL, name: "Echo (test model)", provider: "kredit" };
const CACHE_MS = 10 * 60_000;
const holder = globalThis as { kreditCatalog?: { at: number; value: Loaded } };

const providerOf = (id: string) => (id.includes("/") ? id.split("/")[0] : "other");

type ProviderModel = {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown }; // USD per token, as strings (OpenRouter)
  top_provider?: { max_completion_tokens?: unknown };
};

// Null when the provider doesn't publish a usable price for the model.
function limitsOf(model: ProviderModel): ModelLimits | null {
  const input = Number(model.pricing?.prompt);
  const output = Number(model.pricing?.completion);
  if (!model.pricing || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  const max = Number(model.top_provider?.max_completion_tokens);
  return {
    inputUsdPerToken: input,
    outputUsdPerToken: output,
    ...(Number.isInteger(max) && max > 0 && { maxOutputTokens: max }),
  };
}

async function load(): Promise<Loaded> {
  const cached = holder.kreditCatalog;
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;

  const { baseUrl, apiKey } = upstream();
  let value: Loaded = { catalog: { live: false, models: [ECHO] }, raw: [], limits: new Map() };
  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const data = ((await response.json()).data ?? []) as ProviderModel[];
        const known = data.filter((model): model is ProviderModel & { id: string } => typeof model.id === "string");
        const models = known.map((model) => ({
          id: model.id,
          name: typeof model.name === "string" ? model.name : model.id,
          provider: providerOf(model.id),
        }));
        const limits = new Map<string, ModelLimits>();
        for (const model of known) {
          const found = limitsOf(model);
          if (found) limits.set(model.id, found);
        }
        value = { catalog: { live: true, models: [ECHO, ...models] }, raw: known, limits };
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

// A variant such as "openai/gpt-4o:online" is priced like the model it is built on.
export async function limitsFor(modelId: string) {
  const { limits } = await load();
  return limits.get(modelId) ?? limits.get(modelId.split(":")[0]) ?? null;
}
