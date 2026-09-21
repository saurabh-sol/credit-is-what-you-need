// The top of every dashboard page: what this page is, and the one or two things to do on it.
export function PageHeader({ title, lede, children }: { title: string; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {lede && <p className="page-lede">{lede}</p>}
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </header>
  );
}

// Older dashboard sections space themselves with a top margin; inside a page the stack sets the rhythm.
export function Stack({ children }: { children: React.ReactNode }) {
  return <div className="stagger space-y-4 [&>section]:mt-0">{children}</div>;
}
