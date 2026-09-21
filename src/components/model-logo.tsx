import { providerOf } from "@/lib/providers";

// A provider's mark, painted in the current text color through a CSS mask.
export function ProviderLogo({ logo, className = "size-5" }: { logo: string; className?: string }) {
  const mask = `url(/logos/${logo}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ mask, WebkitMask: mask }}
      className={`${className} inline-block shrink-0 bg-current`}
    />
  );
}

// The logo for a model id. Fuel's own test model, and makers we have no mark for, get the F tile.
export function ModelLogo({ model, className = "size-5" }: { model: string; className?: string }) {
  const provider = providerOf(model);
  if (provider) return <ProviderLogo logo={provider.logo} className={className} />;
  return (
    <span
      aria-hidden
      className={`${className} inline-grid shrink-0 place-items-center rounded-[28%] bg-lime font-mono text-[10px] leading-none font-bold text-ink`}
    >
      F
    </span>
  );
}
