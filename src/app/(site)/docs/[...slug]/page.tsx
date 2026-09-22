import { notFound } from "next/navigation";
import { pages } from "../content";
import { allPages, findPage } from "../nav";

// One route for every docs page but the introduction. The slug is looked up in
// the page tree; a slug that is not there is a 404, never a blank page.
type Props = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return allPages.filter((page) => page.slug).map((page) => ({ slug: page.slug.split("/") }));
}

// Some pages read the live model catalog, so they render per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const slug = (await params).slug.join("/");
  const found = findPage(slug);
  return found
    ? { title: `${found.page.title} — Kredit docs`, description: found.page.description }
    : { title: "Not found — Kredit docs" };
}

export default async function DocsPage({ params }: Props) {
  const slug = (await params).slug.join("/");
  const Page = pages[slug];
  if (!Page) notFound();
  return <Page />;
}
