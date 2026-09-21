// Who makes a model, worked out from the first part of its id ("openai/gpt-…").
// `logo` is a file in public/logos.

export type Provider = { name: string; logo: string };

const providers: Record<string, Provider> = {
  openai: { name: "OpenAI", logo: "openai" },
  anthropic: { name: "Anthropic", logo: "anthropic" },
  google: { name: "Google", logo: "google" },
  "meta-llama": { name: "Meta", logo: "meta" },
  mistralai: { name: "Mistral", logo: "mistral" },
  deepseek: { name: "DeepSeek", logo: "deepseek" },
  "x-ai": { name: "xAI", logo: "xai" },
  qwen: { name: "Qwen", logo: "qwen" },
  cohere: { name: "Cohere", logo: "cohere" },
  perplexity: { name: "Perplexity", logo: "perplexity" },
  nvidia: { name: "NVIDIA", logo: "nvidia" },
  microsoft: { name: "Microsoft", logo: "microsoft" },
  moonshotai: { name: "Moonshot", logo: "moonshot" },
  "z-ai": { name: "Zhipu", logo: "zhipu" },
  minimax: { name: "MiniMax", logo: "minimax" },
};

export const providerOf = (modelId: string): Provider | null => providers[modelId.split("/")[0]] ?? null;

// The ones shown on the landing page and in the docs, in this order.
export const featuredProviders = ["openai", "anthropic", "google", "meta-llama", "mistralai", "deepseek", "x-ai", "qwen", "cohere", "perplexity", "nvidia", "microsoft"].map(
  (id) => ({ id, ...providers[id] }),
);
