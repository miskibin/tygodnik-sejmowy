"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function PromiseSearch() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlSearch = sp.get("q") ?? "";
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);

  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setValue(urlSearch);
  }

  useEffect(() => {
    if (value === urlSearch) return;
    const handle = setTimeout(() => {
      startTransition(() => {
        const params = new URLSearchParams(Array.from(sp.entries()));
        if (value.trim()) params.set("q", value);
        else params.delete("q");
        const qs = params.toString();
        router.push(qs ? `/obietnice?${qs}` : "/obietnice", { scroll: false });
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [value, urlSearch, sp, router]);

  return (
    <label className="block">
      <span className="sr-only">Szukaj w obietnicach</span>
      <div className="relative">
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-destructive font-sans text-[14px]"
        >
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="np. CPK, mieszkanie, podatek, służba zdrowia…"
          className="w-full font-sans text-[14px] pl-9 pr-3 py-2.5 rounded-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive"
        />
      </div>
    </label>
  );
}
