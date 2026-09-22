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
  // Image and video makers.
  bfl: { name: "Black Forest Labs", logo: "bfl" },
  bytedance: { name: "ByteDance", logo: "bytedance" },
  klingai: { name: "Kling", logo: "kling" },
  recraft: { name: "Recraft", logo: "recraft" },
  alibaba: { name: "Alibaba", logo: "alibaba" },
};

// Gateways disagree on how to spell a maker ("meta-llama" on OpenRouter, "meta" on Vercel AI Gateway).
const aliases: Record<string, string> = {
  meta: "meta-llama",
  mistral: "mistralai",
  xai: "x-ai",
  spacexai: "x-ai",
  moonshot: "moonshotai",
  zai: "z-ai",
};

export const makerOf = (modelId: string) => {
  const [prefix, rest = ""] = modelId.split("/");
  // Alibaba ships Qwen (text) under its own name and Wan (video) too; Qwen keeps its mark.
  if (prefix === "alibaba" && rest.startsWith("qwen")) return "qwen";
  return aliases[prefix] ?? prefix;
};

export const providerOf = (modelId: string): Provider | null => providers[makerOf(modelId)] ?? null;

// The ones shown on the landing page and in the docs, in this order.
export const featuredProviders = ["openai", "anthropic", "google", "meta-llama", "mistralai", "deepseek", "x-ai", "qwen", "cohere", "perplexity", "nvidia", "microsoft"].map(
  (id) => ({ id, ...providers[id] }),
);
