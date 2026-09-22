import Link from "next/link";
import { ModelLogo } from "@/components/model-logo";
import { catalog, type CatalogModel, type ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { ECHO_MODEL } from "@/lib/gateway";
import { makerInfo, makerOf } from "@/lib/providers";
import { tokens, turnCost, turnLabel } from "./price";
import { CatalogTable } from "./table";

export const metadata = {
  title: "Catalog — Kredit",
  description: "Every model one Kredit key can call, grouped by maker: the price of a turn in credits, context, capabilities and data policies.",
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

// Four models worth a first look, picked from the live list.
function quickPicks(models: CatalogModel[]) {
  const chat = models.filter((model) => model.type === "language" && model.price);
  const cheapest = [...chat].sort((a, b) => turnCost(a.price) - turnCost(b.price))[0];
  const newest = [...models].filter((model) => model.price && model.released).sort((a, b) => b.released! - a.released!)[0];
  const widest = [...chat].sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0))[0];
  const fullest = [...chat].sort((a, b) => (b.capabilities?.length ?? 0) - (a.capabilities?.length ?? 0) || turnCost(a.price) - turnCost(b.price))[0];
  const picks = [
    cheapest && { label: "Cheapest chat turn", model: cheapest, value: turnLabel(cheapest.price) },
    newest && { label: "Newest arrival", model: newest, value: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(newest.released! * 1000)) },
    widest && { label: "Biggest context", model: widest, value: `${tokens(widest.contextWindow)} tokens` },
    fullest && { label: "Most capable", model: fullest, value: `${fullest.capabilities?.length ?? 0} capabilities` },
  ];
  return picks.filter((pick): pick is NonNullable<typeof pick> => Boolean(pick));
}

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
  const picks = live ? quickPicks(listed) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 pb-24 md:pt-16">
      <header className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
            Every model.
            <br />
            <span className="text-shine">One balance.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-mist">
            {live ? (
              <>
                {counts.map(([count, name], index) => (
                  <span key={name}>
                    {index > 0 && (index === counts.length - 1 ? " and " : ", ")}
                    <strong className="font-medium text-fog">{formatCredits(count)}</strong> {name}
                  </span>
                ))}{" "}
                from {formatCredits(makers.length)} makers. Every price is in credits, so you can compare a turn across makers before you spend one.
              </>
            ) : (
              <>
                This server is not connected to a provider yet, so only <code>{ECHO_MODEL}</code> answers today. Once one is connected, every
                model it offers appears here.
              </>
            )}
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <Link href="/playground" className="btn-primary px-5 py-2.5">
              Open the playground
            </Link>
            <Link href="/dashboard/keys" className="btn-ghost px-5 py-2.5">
              Get an API key
            </Link>
          </div>
        </div>

        {picks.length > 0 && (
          <div className="card p-5 shadow-[0_18px_40px_-18px_var(--shade)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Quick picks</p>
              <span className="chip">Live</span>
            </div>
            <ul className="mt-4 m-0 list-none divide-y divide-line p-0">
              {picks.map((pick) => (
                <li key={pick.label} className="m-0">
                  <Link
                    href={`/playground?model=${encodeURIComponent(pick.model.id)}&mode=${pick.model.type === "language" ? "text" : pick.model.type}`}
                    className="group flex items-center gap-3 py-3 transition hover:text-fog"
                  >
                    <ModelLogo model={pick.model.id} className="size-6 text-mist transition group-hover:text-fog" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.6875rem] font-medium tracking-wider text-mist uppercase">{pick.label}</span>
                      <span className="block truncate font-mono text-[0.8125rem] text-fog">{pick.model.id}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-accent tabular-nums">{pick.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <CatalogTable makers={makers} models={listed} live={live} />
    </div>
  );
}
