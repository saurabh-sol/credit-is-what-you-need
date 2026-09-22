import Link from "next/link";
import { catalog, type ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { ECHO_MODEL } from "@/lib/gateway";
import { makerInfo, makerOf } from "@/lib/providers";
import { CatalogTable } from "./table";

export const metadata = {
  title: "Catalog — Kredit",
  description: "Every model one Kredit key can call, grouped by maker: prices in credits, context, capabilities and data policies.",
};
// The list comes from the provider and is cached for ten minutes, so the page renders per request.
export const dynamic = "force-dynamic";

const TYPE_NAMES: Record<ModelType, [string, string]> = {
  language: ["chat model", "chat models"],
  image: ["image model", "image models"],
  video: ["video model", "video models"],
  embedding: ["embedding model", "embedding models"],
  evaluation: ["evaluation model", "evaluation models"],
  other: ["other", "other"],
};

export default async function CatalogPage() {
  const { live, models } = await catalog();
  const listed = models.filter((model) => model.id !== ECHO_MODEL);

  const byType = new Map<ModelType, number>();
  const byMaker = new Map<string, number>();
  for (const model of listed) {
    byType.set(model.type, (byType.get(model.type) ?? 0) + 1);
    const maker = makerOf(model.id);
    byMaker.set(maker, (byMaker.get(maker) ?? 0) + 1);
  }
  const makers = [...byMaker.entries()]
    .map(([id, count]) => ({ ...makerInfo(id), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const typeOrder: ModelType[] = ["language", "image", "video", "embedding", "evaluation"];
  const counts = typeOrder.filter((type) => byType.get(type)).map((type) => [byType.get(type)!, TYPE_NAMES[type][byType.get(type) === 1 ? 0 : 1]] as const);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 pb-24 md:pt-20">
      <header className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
            Browse the
            <br />
            Kredit catalog
          </h1>
        </div>
        <div className="md:pb-2">
          <p className="max-w-md text-lg leading-relaxed text-mist">
            {live ? (
              <>
                {counts.map(([count, name], index) => (
                  <span key={name}>
                    {index > 0 && (index === counts.length - 1 ? " and " : ", ")}
                    <strong className="font-medium text-fog">{formatCredits(count)}</strong> {name}
                  </span>
                ))}{" "}
                from {formatCredits(makers.length)} makers. Compare prices, context and capabilities, then call any of them with one key.
              </>
            ) : (
              <>
                This server is not connected to a provider yet, so only <code>{ECHO_MODEL}</code> answers today. Once one is connected, every
                model it offers appears here.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href="/dashboard/keys" className="btn-primary px-5 py-2.5">
              Get API key
            </Link>
            <Link href="/docs/api/models" className="btn-ghost px-5 py-2.5">
              Read the docs
            </Link>
          </div>
        </div>
      </header>

      <CatalogTable makers={makers} models={listed} live={live} />
    </div>
  );
}
