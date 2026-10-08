"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LawTocEntry } from "@/lib/law-reader";
import styles from "./reader.module.css";

function subscribeScreen(callback: () => void) {
  const query = matchMedia("(min-width: 1024px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const getScreen = () => matchMedia("(min-width: 1024px)").matches;
const getServerScreen = () => false;
const subscribeReady = () => () => {};
const getReady = () => true;

type Group = { key: string; label: string; entries: LawTocEntry[] };

export function LawContents({ entries }: { entries: LawTocEntry[] }) {
  const desktop = useSyncExternalStore(subscribeScreen, getScreen, getServerScreen);
  const ready = useSyncExternalStore(subscribeReady, getReady, getServerScreen);
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [active, setActive] = useState(entries[0]?.id ?? "");
  const list = useRef<HTMLElement>(null);
  const groups: Group[] = [];
  for (const entry of entries) {
    const key = entry.context.join(" / ");
    if (groups.at(-1)?.key !== key) groups.push({ key, label: entry.context.at(-1) || "Artykuły", entries: [] });
    groups[groups.length - 1].entries.push(entry);
  }
  const needle = query.trim().toLocaleLowerCase("pl").replace(/^art\.?\s*/, "");
  const filtered = groups.map(g => ({ ...g, entries: g.entries.filter(e => !needle ||
    [e.label.replace(/^Art\.\s*/, ""), ...e.context].some(t => t.toLocaleLowerCase("pl").includes(needle))) })).filter(g => g.entries.length);
  useEffect(() => {
    const reveal = (hash: string) => {
      let target: HTMLElement | null;
      try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
    };
    const onHash = () => reveal(location.hash);
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      if (link) reveal(link.hash);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("hashchange", onHash); document.removeEventListener("click", onClick); };
  }, []);
  useEffect(() => {
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const readingLine = desktop ? 114 : 129;
      observer = new IntersectionObserver(changes => {
        const current = changes.find(entry => entry.isIntersecting);
        if (current) setActive(current.target.id);
      }, { rootMargin: `-${readingLine}px 0px -${Math.max(0, innerHeight - readingLine - 1)}px 0px` });
      for (const entry of entries) {
        const element = document.getElementById(entry.id);
        if (element) observer.observe(element);
      }
    };
    observe();
    window.addEventListener("resize", observe);
    return () => { observer.disconnect(); window.removeEventListener("resize", observe); };
  }, [entries, desktop]);
  useEffect(() => {
    const link = list.current?.querySelector<HTMLAnchorElement>('a[aria-current="location"]');
    if (link && desktop) {
      const rect = link.getBoundingClientRect(), nav = list.current!.getBoundingClientRect();
      if (rect.top < nav.top || rect.bottom > nav.bottom) list.current!.scrollTop += rect.top - nav.top - 80;
    }
  }, [active, desktop]);
  return <aside className={styles.contents} aria-label="Spis treści" data-reader-ready={ready || undefined}>
    <h2 className={styles.contentsTitle}>Spis treści</h2>
    <details open={desktop || open} onToggle={event => { if (!desktop) setOpen(event.currentTarget.open); }}>
      <summary className={styles.mobileSummary}>Spis treści <span>{entries.length} artykułów</span></summary>
      <label className={styles.contentsSearch}><span className="sr-only">Znajdź artykuł lub rozdział w spisie treści</span>
        <input type="search" name="article-navigation" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" placeholder="Artykuł lub rozdział…" />
      </label>
      <nav ref={list} className={styles.contentsList} aria-label="Artykuły dokumentu">
        {filtered.length ? filtered.map((group, index) => <details key={`${group.key}-${index}`} open={!!needle || group.entries.some(e => e.id === active)} className={styles.contentsGroup}>
          <summary title={group.key}>{group.label}</summary>
          <ol>{group.entries.map(entry => <li key={entry.id}><a href={`#${encodeURIComponent(entry.id)}`} aria-current={active === entry.id ? "location" : undefined}
            onClick={() => { setActive(entry.id); if (!desktop) setOpen(false); }}>{entry.label}</a></li>)}</ol>
        </details>) : <p className={styles.noMatch} role="status">Nie ma takiego artykułu lub rozdziału w tym dokumencie.</p>}
      </nav>
    </details>
  </aside>;
}
