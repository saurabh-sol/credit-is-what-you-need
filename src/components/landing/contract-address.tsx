"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon } from "@/components/icons";
import { shortAddress } from "@/lib/format";
import { TOKEN, tokenUrl } from "@/lib/token";

// The token's contract address as a pill in the hero: the address opens the
// token's page, the button beside it copies the full address.
export function ContractAddress({ style }: { style?: CSSProperties }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!TOKEN.address) return null;

  return (
    <div style={style} className="mb-6 inline-flex animate-rise items-stretch overflow-hidden rounded-full border border-line bg-surface/70 text-xs backdrop-blur">
      <a
        href={tokenUrl()}
        target="_blank"
        rel="noopener noreferrer"
        title={`${TOKEN.symbol} on the explorer`}
        className="group flex items-center gap-2 py-1.5 pr-2.5 pl-3 text-fog transition-colors hover:bg-fog/[0.04]"
      >
        <span className="font-semibold tracking-wide text-accent">CA</span>
        <span className="font-mono">
          <span className="sm:hidden">{shortAddress(TOKEN.address)}</span>
          <span className="hidden sm:inline">{TOKEN.address}</span>
        </span>
        <ArrowUpRightIcon className="size-3.5 text-mist transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fog" />
      </a>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy the contract address"}
        onClick={() => navigator.clipboard.writeText(TOKEN.address).then(() => setCopied(true))}
        className="flex items-center border-l border-line px-2.5 text-mist transition-colors hover:bg-fog/[0.04] hover:text-fog"
      >
        {copied ? <CheckIcon className="size-3.5 text-accent" /> : <CopyIcon className="size-3.5" />}
      </button>
    </div>
  );
}
