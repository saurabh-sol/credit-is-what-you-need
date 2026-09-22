// Who makes a model, worked out from the first part of its id ("openai/gpt-…").
// `logo` is a file in public/logos; makers without one get their initial on a tile.

export type Provider = { name: string; logo?: string };

const providers: Record<string, Provider> = {
  kredit: { name: "Kredit" }, // the echo model; its mark is drawn by ModelLogo
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
  // The long tail on Vercel AI Gateway.
  amazon: { name: "Amazon", logo: "amazon" },
  "arcee-ai": { name: "Arcee", logo: "arcee" },
  "fish-audio": { name: "Fish Audio", logo: "fishaudio" },
  inception: { name: "Inception", logo: "inception" },
  "inference-net": { name: "Inference.net", logo: "inference" },
  morph: { name: "Morph", logo: "morph" },
  poolside: { name: "Poolside", logo: "poolside" },
  sakana: { name: "Sakana AI", logo: "sakana" },
  stepfun: { name: "StepFun", logo: "stepfun" },
  tencent: { name: "Tencent", logo: "hunyuan" },
  voyage: { name: "Voyage AI", logo: "voyage" },
  xiaomi: { name: "Xiaomi", logo: "xiaomi" },
  inclusionai: { name: "inclusionAI", logo: "inclusionai" },
  interfaze: { name: "Interfaze", logo: "interfaze" },
  mixedbread: { name: "Mixedbread", logo: "mixedbread" },
  prodia: { name: "Prodia", logo: "prodia" },
  quiverai: { name: "QuiverAI", logo: "quiverai" },
  thinkingmachines: { name: "Thinking Machines", logo: "thinkingmachines" },
  "typesafe-ai": { name: "TypeSafe AI", logo: "typesafe" },
  // The long tail on OpenRouter.
  "ibm-granite": { name: "IBM", logo: "ibm" },
  nousresearch: { name: "Nous Research", logo: "nousresearch" },
  liquid: { name: "Liquid AI", logo: "liquid" },
  baidu: { name: "Baidu", logo: "baidu" },
  upstage: { name: "Upstage", logo: "upstage" },
  rekaai: { name: "Reka", logo: "reka" },
  meituan: { name: "Meituan", logo: "longcat" },
  "aion-labs": { name: "AionLabs", logo: "aionlabs" },
  kwaipilot: { name: "Kwaipilot", logo: "kwaipilot" },
  relace: { name: "Relace", logo: "relace" },
  perceptron: { name: "Perceptron", logo: "perceptron" },
  "dots-studio": { name: "Dots Studio", logo: "dotsstudio" },
  cognitivecomputations: { name: "Cognitive Computations", logo: "dolphin" },
  "nex-agi": { name: "Nex AGI", logo: "nexagi" },
  thedrummer: { name: "TheDrummer", logo: "thedrummer" },
  sao10k: { name: "Sao10K", logo: "sao10k" },
  writer: { name: "Writer", logo: "writer" },
  "prism-ml": { name: "Prism ML", logo: "prismml" },
  unbiased: { name: "Unbiased", logo: "unbiased" },
  "anthracite-org": { name: "Anthracite", logo: "anthracite" },
  mancer: { name: "Mancer", logo: "mancer" },
  undi95: { name: "Undi95", logo: "undi95" },
  gryphe: { name: "Gryphe", logo: "gryphe" },
};

// Gateways disagree on how to spell a maker ("meta-llama" on OpenRouter, "meta" on Vercel AI Gateway).
const aliases: Record<string, string> = {
  meta: "meta-llama",
  mistral: "mistralai",
  xai: "x-ai",
  spacexai: "x-ai",
  moonshot: "moonshotai",
  zai: "z-ai",
  "bytedance-seed": "bytedance",
};

export const makerOf = (modelId: string) => {
  // OpenRouter puts "~" in front of a maker for its "latest" aliases (~openai/gpt-…).
  const [prefix, rest = ""] = modelId.replace(/^~/, "").split("/");
  // Alibaba ships Qwen (text) under its own name and Wan (video) too; Qwen keeps its mark.
  if (prefix === "alibaba" && rest.startsWith("qwen")) return "qwen";
  return aliases[prefix] ?? prefix;
};

export const providerOf = (modelId: string): Provider | null => providers[makerOf(modelId)] ?? null;

// A maker by the id makerOf gives; one we have never heard of is named by its id.
export const makerInfo = (maker: string): Provider & { id: string } => ({ id: maker, ...(providers[maker] ?? { name: maker }) });

// The ones shown on the landing page, in this order. Every one has a logo.
export const featuredProviders = ["openai", "anthropic", "google", "meta-llama", "mistralai", "deepseek", "x-ai", "qwen", "cohere", "perplexity", "nvidia", "microsoft"].map(
  (id) => ({ id, ...providers[id], logo: providers[id].logo! }),
);
