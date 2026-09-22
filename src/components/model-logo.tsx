import { OrbMark } from "@/components/brand/orb-mark";
import { makerInfo, makerOf } from "@/lib/providers";

// Makers whose mark has colors of its own (public/logos/<name>-color.<ext>). The rest
// are single-color brands, drawn in the text color so they read on any page.
const colored = new Map<string, "svg" | "png">([
  ["google", "svg"],
  ["meta", "svg"],
  ["mistral", "svg"],
  ["deepseek", "svg"],
  ["qwen", "svg"],
  ["cohere", "svg"],
  ["perplexity", "svg"],
  ["nvidia", "svg"],
  ["microsoft", "svg"],
  ["zhipu", "svg"],
  ["minimax", "svg"],
  ["bytedance", "svg"],
  ["kling", "svg"],
  ["alibaba", "svg"],
  ["amazon", "svg"],
  ["arcee", "svg"],
  ["morph", "svg"],
  ["poolside", "svg"],
  ["sakana", "svg"],
  ["stepfun", "svg"],
  ["hunyuan", "svg"],
  ["baidu", "svg"],
  ["upstage", "svg"],
  ["longcat", "svg"],
  // Marks their makers only publish as bitmaps.
  ["mixedbread", "png"],
  ["interfaze", "png"],
  ["gryphe", "png"],
  ["anthracite", "png"],
  ["thedrummer", "png"],
  ["sao10k", "png"],
  ["undi95", "png"],
  ["mancer", "svg"],
  ["unbiased", "svg"],
]);
// Single-color marks that exist only as bitmaps; the mask uses their alpha channel.
const bitmapMono = new Set(["quiverai", "inclusionai", "nexagi", "writer", "prismml"]);

type ProviderLogoProps = { logo: string; className?: string; /** Force the single-color version. */ mono?: boolean };

// A maker's mark: in its brand colors where it has them, otherwise painted in
// the current text color through a CSS mask.
export function ProviderLogo({ logo, className = "size-5", mono = false }: ProviderLogoProps) {
  const ext = colored.get(logo);
  if (ext && !mono) {
    // A small static image: there is nothing for next/image to optimize.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/logos/${logo}-color.${ext}`} alt="" aria-hidden className={`${className} inline-block shrink-0 object-contain`} />;
  }
  const mask = `url(/logos/${logo}.${bitmapMono.has(logo) ? "png" : "svg"}) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ mask, WebkitMask: mask }}
      className={`${className} inline-block shrink-0 bg-current`}
    />
  );
}

// A maker's initial on a tile, for the rare maker we have no mark for.
function LetterTile({ letter, className }: { letter: string; className: string }) {
  return (
    <span aria-hidden className={`${className} inline-grid shrink-0 place-items-center rounded-[28%] bg-fog/10 font-mono text-[10px] leading-none font-bold text-fog`}>
      {letter}
    </span>
  );
}

// A maker's logo, or its initial on a tile.
export function MakerLogo({ maker, className = "size-5" }: { maker: { id: string; name: string; logo?: string }; className?: string }) {
  if (maker.logo) return <ProviderLogo logo={maker.logo} className={className} />;
  return <LetterTile letter={maker.name.charAt(0).toUpperCase()} className={className} />;
}

// The logo for a model id. Kredit's own test model gets the Kredit orb.
export function ModelLogo({ model, className = "size-5" }: { model: string; className?: string }) {
  const maker = makerOf(model);
  if (maker === "kredit" || !model.includes("/")) return <OrbMark className={className} />;
  return <MakerLogo maker={makerInfo(maker)} className={className} />;
}
