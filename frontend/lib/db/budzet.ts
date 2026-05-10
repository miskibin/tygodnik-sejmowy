import "server-only";

import { supabase } from "@/lib/supabase";

// Table `infra_costs` may be empty during rollout. Caller renders the
// operator-declared monthly burn list when `isEmpty: true`.

export type InfraCostRow = {
  month: string;     // ISO date, first of month
  category: string;
  zl: number;
  note: string | null;
};

export type InfraCostsResult = { rows: InfraCostRow[]; isEmpty: boolean };

export async function getInfraCosts(): Promise<InfraCostsResult> {
  const sb = supabase();
  const { data, error } = await sb
    .from("infra_costs")
    .select("month, category, zl, note")
    .order("month", { ascending: false });
  if (error) throw error;
  type Row = { month: string; category: string; zl: number | string; note: string | null };
  const rows = ((data ?? []) as Row[]).map((r) => ({
    month: r.month,
    category: r.category,
    zl: typeof r.zl === "string" ? parseFloat(r.zl) : r.zl,
    note: r.note,
  }));
  return { rows, isEmpty: rows.length === 0 };
}

