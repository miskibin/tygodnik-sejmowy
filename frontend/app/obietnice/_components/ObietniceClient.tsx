import type { HubCounts, PromiseHubRow } from "@/lib/db/promises";
import { PromiseSidebar } from "./PromiseSidebar";
import { PromiseSearch } from "./PromiseSearch";
import { PromiseToolbar } from "./PromiseToolbar";
import { PromiseList } from "./PromiseList";

export function ObietniceClient({
  rows,
  counts,
  total,
}: {
  rows: PromiseHubRow[];
  counts: HubCounts;
  total: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] lg:grid-cols-[220px_1fr] gap-x-10 gap-y-4">
      <PromiseSidebar counts={counts} />
      <div className="min-w-0">
        <div className="mb-4">
          <PromiseSearch />
        </div>
        <PromiseToolbar resultCount={rows.length} totalCount={total} />
        <PromiseList rows={rows} />
      </div>
    </div>
  );
}
