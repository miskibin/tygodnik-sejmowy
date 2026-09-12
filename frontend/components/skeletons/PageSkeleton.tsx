import { Skeleton } from "@/components/ui/skeleton";

function Bar({ width = "100%", tall = false }: { width?: string; tall?: boolean }) {
  return <Skeleton className={`rounded-sm ${tall ? "h-8 md:h-10" : "h-3"}`} style={{ width }} />;
}

export function PageSkeleton({ variant = "page" }: { variant?: "page" | "document" | "weekly" }) {
  const weekly = variant === "weekly";
  const label = variant === "document" ? "Wczytywanie dokumentu…" : weekly ? "Wczytywanie tygodnika…" : "Wczytywanie strony…";
  return <div className={`mx-auto min-h-[70vh] ${weekly ? "max-w-[960px] px-5 md:px-8 py-8" : "max-w-[1280px] px-4 md:px-8 lg:px-14 py-7"}`}>
    <p role="status" className="text-[13px] text-muted-foreground mb-7">{label}</p>
    <div aria-hidden="true">
      <div className="max-w-[1000px] border-b border-border pb-7 space-y-4">
        {weekly ? <div className="text-[36px] font-semibold tracking-tight">Tygodnik</div> : <><Bar width="78%" tall /><Bar width="52%" tall /></>}
        <div className="flex gap-6 pt-2"><Bar width="90px" /><Bar width="140px" /></div>
      </div>
      {Array.from({ length: weekly ? 3 : 2 }, (_, i) => <div key={i} className="py-8 border-b border-border max-w-[760px] space-y-4">
        <Bar width={weekly ? "70%" : "160px"} tall={weekly} />
        <div className="pt-3 space-y-3"><Bar /><Bar width="96%" /><Bar width="88%" /><Bar width="64%" /></div>
      </div>)}
    </div>
  </div>;
}
