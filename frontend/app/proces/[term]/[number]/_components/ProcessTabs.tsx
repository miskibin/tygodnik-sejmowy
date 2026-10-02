"use client";

import { useRef, useSyncExternalStore, type ReactNode, type KeyboardEvent } from "react";
import styles from "./process.module.css";

type Tab = { id: string; label: string; count?: number };
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function getHash() { return window.location.hash.slice(1); }

export function ProcessTabs({ tabs, panels }: { tabs: Tab[]; panels: Record<string, ReactNode> }) {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const active = tabs.some(tab => tab.id === hash) ? hash : tabs[0]?.id;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (id: string) => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next].id);
    buttons.current[next]?.focus();
  };
  return <div className={styles.tabs}>
    <div role="tablist" aria-label="Szczegóły sprawy" className={styles.tabList}>
      {tabs.map((tab, index) => <button key={tab.id} ref={node => { buttons.current[index] = node; }} type="button"
        role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} aria-selected={tab.id === active}
        tabIndex={tab.id === active ? 0 : -1} onClick={() => select(tab.id)} onKeyDown={event => onKeyDown(event, index)}>
        {tab.label}{tab.count != null && tab.count > 0 && <span>{tab.count}</span>}
      </button>)}
    </div>
    {tabs.map(tab => <section key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}
      hidden={tab.id !== active} className={styles.panel} tabIndex={0}>{panels[tab.id]}</section>)}
  </div>;
}
