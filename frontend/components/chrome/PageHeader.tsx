import type { ReactNode } from "react";

/** One heading and optional evidence/scope line, shared by section directories. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="mb-8 border-b border-border pb-6">
    <h1 className="font-display text-[clamp(32px,4vw,44px)] font-normal leading-tight tracking-tight">{title}</h1>
    {children && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>}
  </header>;
}
