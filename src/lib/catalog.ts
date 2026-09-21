import { ECHO_MODEL, upstream } from "./gateway.ts";

// The public list of models this deployment can reach, for the docs and the
// playground. Same source as /v1/models, minus the API key requirement.

export type CatalogModel = { id: string; name: string; provider: string };
export type Catalog = { live: boolean; models: CatalogModel[] };

const ECHO: CatalogModel = { id: ECHO_MODEL, name: "Echo (test model)", provider: "kredit" };
const CACHE_MS = 10 * 60_000;
const holder = globalThis as { kreditCatalog?: { at: number; value: Catalog } };

const providerOf = (id: string) => (id.includes("/") ? id.split("/")[0] : "other");

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
      if (response.ok) {
        const data = ((await response.json()).data ?? []) as { id?: unknown; name?: unknown }[];
        const models = data
          .filter((model): model is { id: string; name?: unknown } => typeof model.id === "string")
          .map((model) => ({
            id: model.id,
            name: typeof model.name === "string" ? model.name : model.id,
            provider: providerOf(model.id),
          }));
        value = { live: true, models: [ECHO, ...models] };
      }
    } catch {
      // The provider's list is a nicety; the echo model is always available.
    }
  }
  // A failed fetch is retried on the next request instead of being cached.
  if (value.live || !apiKey) holder.kreditCatalog = { at: Date.now(), value };
  return value;
}
