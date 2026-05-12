"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { FTS_KIND_LABEL, type FtsHit, type FtsKind } from "@/lib/db/fts-types";

const GROUP_ORDER: FtsKind[] = ["mp", "voting", "print", "committee", "promise", "statement"];
const MAX_PER_KIND = 4;

function renderHeadline(html: string): ReactNode {
  // RPC returns ts_headline output with <mark>...</mark>. Parse safely:
  // split on <mark> tags and render text segments + highlighted spans.
  // Strips any other HTML tags defensively (ts_headline emits no others).
  if (!html) return null;
  const parts: ReactNode[] = [];
  let cursor = 0;
  const re = /<mark>(.*?)<\/mark>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) parts.push(html.slice(cursor, m.index));
    parts.push(
      <strong
        key={`m-${m.index}`}
        className="font-medium text-foreground bg-accent/40 rounded-sm px-0.5"
      >
        {m[1]}
      </strong>,
    );
    cursor = re.lastIndex;
  }
  if (cursor < html.length) parts.push(html.slice(cursor));
  return parts;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FtsHit[]>([]);
  const [isPending, startTransition] = useTransition();
  const reqIdRef = useRef(0);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  // Debounced search. Route Handler (GET /api/search) lets the browser
  // dedupe in-flight requests and we get to abort stale ones cleanly.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    const myId = ++reqIdRef.current;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          const resp = await fetch(
            `/api/search?q=${encodeURIComponent(trimmed)}&limit=20`,
            { signal: controller.signal },
          );
          if (!resp.ok) throw new Error(`status ${resp.status}`);
          const body = (await resp.json()) as { hits?: FtsHit[] };
          if (myId === reqIdRef.current) setHits(body.hits ?? []);
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          console.error("[GlobalSearch] fetch failed", err);
          if (myId === reqIdRef.current) setHits([]);
        }
      });
    }, 220);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<FtsKind, FtsHit[]>();
    for (const h of hits) {
      const arr = map.get(h.kind) ?? [];
      arr.push(h);
      map.set(h.kind, arr);
    }
    return GROUP_ORDER
      .map((k) => {
        const all = map.get(k) ?? [];
        return { kind: k, items: all.slice(0, MAX_PER_KIND), more: Math.max(0, all.length - MAX_PER_KIND) };
      })
      .filter((g) => g.items.length > 0);
  }, [hits]);

  const trimmed = query.trim();
  const showAllHref = trimmed.length >= 2 ? `/szukaj?q=${encodeURIComponent(trimmed)}` : null;

  function navigate(href: string) {
    onOpenChange(false);
    if (href.startsWith("http")) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wyszukaj w Tygodniku"
      description="Szukaj druków, posłów, głosowań, komisji, obietnic i wystąpień."
      className="max-w-[min(960px,92vw)] sm:max-w-[min(960px,92vw)]"
    >
      <Command shouldFilter={false} className="rounded-xl">
      <CommandInput
        placeholder="Szukaj — np. 'Tusk', 'CIT', 'rolnictwo'…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[70vh]">
        {trimmed.length < 2 ? (
          <CommandEmpty>
            <span className="text-muted-foreground text-[12px]">
              Wpisz co najmniej 2 znaki — szukamy w drukach, posłach, głosowaniach, komisjach, obietnicach i wystąpieniach.
            </span>
          </CommandEmpty>
        ) : isPending && hits.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Szukam…</div>
        ) : grouped.length === 0 ? (
          <CommandEmpty>
            <span className="text-muted-foreground text-[12px]">
              Brak wyników dla „{trimmed}”. Spróbuj innej frazy.
            </span>
          </CommandEmpty>
        ) : (
          grouped.map((g, gi) => (
            <div key={g.kind}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={FTS_KIND_LABEL[g.kind]}>
                {g.items.map((h) => {
                  const disabled = !h.href;
                  return (
                    <CommandItem
                      key={`${h.kind}:${h.id}`}
                      value={`${h.kind} ${h.id} ${h.label}`}
                      disabled={disabled}
                      onSelect={() => h.href && navigate(h.href)}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <div className="flex w-full items-baseline justify-between gap-3">
                        <span className="font-serif text-[14px] text-foreground line-clamp-1">
                          {h.label}
                        </span>
                        {h.meta && (
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                            {h.meta}
                          </span>
                        )}
                      </div>
                      {h.headline && h.headline !== h.label && (
                        <span className="text-[12px] text-muted-foreground line-clamp-2">
                          {renderHeadline(h.headline)}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))
        )}
      </CommandList>
      {showAllHref && (
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            <kbd className="font-mono px-1 border border-border rounded">↵</kbd> aby otworzyć
            <span className="mx-1.5">·</span>
            <kbd className="font-mono px-1 border border-border rounded">esc</kbd> zamknij
          </span>
          <button
            type="button"
            onClick={() => navigate(showAllHref)}
            className="font-sans hover:text-foreground transition-colors"
          >
            Wszystkie wyniki →
          </button>
        </div>
      )}
      </Command>
    </CommandDialog>
  );
}
