import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { docHref, findPage } from "./nav";

// The building blocks every docs page is written with. Server components, so
// pages can read the real rules (pricing, limits, scoring) at render time.

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const textOf = (node: React.ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : node && typeof node === "object" && "props" in node
        ? textOf((node as { props: { children?: React.ReactNode } }).props.children)
        : "";

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  const anchor = id ?? slugify(textOf(children));
  return (
    <h2 id={anchor}>
      {children}
      <a href={`#${anchor}`} className="anchor" aria-label="Link to this section">
        #
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  const anchor = id ?? slugify(textOf(children));
  return (
    <h3 id={anchor}>
      {children}
      <a href={`#${anchor}`} className="anchor" aria-label="Link to this section">
        #
      </a>
    </h3>
  );
}

type DocProps = {
  slug: string;
  /** Overrides the sidebar title, for pages whose heading reads better long. */
  title?: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
};

// A page: breadcrumb, title, lede, body, then the previous and next links.
export function Doc({ slug, title, lede, children }: DocProps) {
  const found = findPage(slug);
  if (!found) throw new Error(`No docs page for "${slug}"`);
  const { page, previous, next } = found;

  return (
    <article className="min-w-0">
      <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.06em] text-mist uppercase">
        <Link href="/docs" className="transition-colors hover:text-fog">
          Docs
        </Link>
        <span aria-hidden>/</span>
        <span>{page.group}</span>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-fog sm:text-[2.125rem] sm:leading-[2.5rem]">
        {title ?? page.title}
      </h1>
      {lede && <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-mist">{lede}</p>}
      <div className="doc mt-8">{children}</div>
      <nav className="doc-footer" aria-label="Previous and next">
        {previous ? (
          <Link href={docHref(previous.slug)} data-dir="previous">
            <small>Previous</small>
            <strong>{previous.title}</strong>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={docHref(next.slug)} data-dir="next">
            <small>Next</small>
            <strong>{next.title}</strong>
          </Link>
        )}
      </nav>
    </article>
  );
}

const callouts = { note: "i", tip: "✓", warn: "!" } as const;

export function Callout({ kind = "note", title, children }: { kind?: keyof typeof callouts; title?: string; children: React.ReactNode }) {
  return (
    <aside className="callout" data-kind={kind}>
      <span className="callout-icon" aria-hidden>
        {callouts[kind]}
      </span>
      <div className="min-w-0">
        {title && <p className="font-medium text-fog">{title}</p>}
        <div className={title ? "mt-1 text-mist" : "text-mist"}>{children}</div>
      </div>
    </aside>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="steps list-none p-0 pl-7">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="step m-0 p-0 pb-7">
      <h4>{title}</h4>
      {children}
    </li>
  );
}

export function Cards({ children }: { children: React.ReactNode }) {
  return <div className="doc-cards">{children}</div>;
}

export function Card({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="doc-card">
      <strong>{title}</strong>
      <span>{children}</span>
    </Link>
  );
}

export function Endpoint({ method, path, note }: { method: "GET" | "POST" | "DELETE"; path: string; note?: string }) {
  return (
    <p className="endpoint">
      <span className="method" data-method={method}>
        {method}
      </span>
      <span className="break-all">{path}</span>
      {note && <span className="font-sans text-xs text-mist">{note}</span>}
    </p>
  );
}

export function Params({ children }: { children: React.ReactNode }) {
  return <dl className="params">{children}</dl>;
}

export function Param({
  name,
  type,
  required,
  children,
}: {
  name: string;
  type: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="param">
      <dt>
        <span className="param-name">{name}</span>
        <span className="param-meta" data-required={required || undefined}>
          {type}
          {required ? " · required" : ""}
        </span>
      </dt>
      <dd>
        <p>{children}</p>
      </dd>
    </div>
  );
}

export function Table({ head, rows, min = "28rem" }: { head: string[]; rows: React.ReactNode[][]; min?: string }) {
  return (
    <div className="grid-table-wrap overflow-x-auto">
      <table className="grid-table" style={{ minWidth: min }}>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} className={cell.startsWith("#") ? "num" : undefined}>
                {cell.replace(/^#/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index} className={head[index]?.startsWith("#") ? "num" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="btn-sm mt-5">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

export const number = (value: number) => value.toLocaleString("en-US");
