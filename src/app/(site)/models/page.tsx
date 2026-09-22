import Link from "next/link";
import { catalog, type ModelType } from "@/lib/catalog";
import { formatCredits } from "@/lib/format";
import { ECHO_MODEL } from "@/lib/gateway";
import { MARGIN } from "@/lib/pricing";
import { makerInfo, makerOf } from "@/lib/providers";
import { ModelsBoard } from "./board";

export const metadata = {
  title: "Models — Kredit",
  description: "Every model one Kredit key can call: chat, image, video and embeddings, with the price of a typical turn in credits.",
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

export default async function ModelsPage() {
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
  const routable = listed.filter((model) => model.price !== null).length;
  const typeOrder: ModelType[] = ["language", "image", "video", "embedding", "evaluation"];
  const counts = typeOrder.filter((type) => byType.get(type)).map((type) => [byType.get(type)!, TYPE_NAMES[type][byType.get(type) === 1 ? 0 : 1]] as const);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24">
      <header>
        <p className="eyebrow">Models</p>
        <h1 className="page-title mt-3">One key, every model</h1>
        {live ? (
          <p className="page-lede">
            {counts.map(([count, name], index) => (
              <span key={name}>
                {index > 0 && (index === counts.length - 1 ? " and " : ", ")}
                <strong className="text-fog">{formatCredits(count)}</strong> {name}
              </span>
            ))}{" "}
            from {formatCredits(makers.length)} makers, all behind <code>/v1</code> and the same balance. Prices are the
            providers&apos; own with a {Math.round(MARGIN * 100)}% fee: the credits you see are the credits you pay.
            {routable < listed.length && ` ${formatCredits(listed.length - routable)} listed models have no published price and cannot be called.`}
          </p>
        ) : (
          <p className="page-lede">
            This server is not connected to a provider yet, so only <code>{ECHO_MODEL}</code> answers today. Once one is
            connected, every model it offers appears here with its price.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/playground" className="btn-primary px-4 py-2">
            Open the playground
          </Link>
          <Link href="/docs/api/models" className="btn-ghost px-4 py-2">
            GET /v1/models
          </Link>
        </div>
      </header>

      <ModelsBoard makers={makers} models={listed} live={live} />
    </div>
  );
}
