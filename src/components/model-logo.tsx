import { providerOf } from "@/lib/providers";

// Makers whose mark has colors of its own (public/logos/<name>-color.svg). The rest
// are single-color brands, drawn in the text color so they read on a dark page.
const colored = new Set([
  "google",
  "meta",
  "mistral",
  "deepseek",
  "qwen",
  "cohere",
  "perplexity",
  "nvidia",
  "microsoft",
  "zhipu",
  "minimax",
]);

type ProviderLogoProps = { logo: string; className?: string; /** Force the single-color version. */ mono?: boolean };

// A maker's mark: in its brand colors where it has them, otherwise painted in
// the current text color through a CSS mask.
export function ProviderLogo({ logo, className = "size-5", mono = false }: ProviderLogoProps) {
  if (colored.has(logo) && !mono) {
    // A small static SVG: there is nothing for next/image to optimize.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/logos/${logo}-color.svg`} alt="" aria-hidden className={`${className} inline-block shrink-0 object-contain`} />;
  }
  const mask = `url(/logos/${logo}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ mask, WebkitMask: mask }}
      className={`${className} inline-block shrink-0 bg-current`}
    />
  );
}

// The logo for a model id. Kredit's own test model, and makers we have no mark for, get the K tile.
export function ModelLogo({ model, className = "size-5" }: { model: string; className?: string }) {
  const provider = providerOf(model);
  if (provider) return <ProviderLogo logo={provider.logo} className={className} />;
  return (
    <span
      aria-hidden
      className={`${className} inline-grid shrink-0 place-items-center rounded-[28%] bg-lime font-mono text-[10px] leading-none font-bold text-ink`}
    >
      K
    </span>
  );
}
