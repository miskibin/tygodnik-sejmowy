import { supabase } from "@/lib/supabase";
import type { LinkedVoting } from "@/lib/types";

const ROLE_RANK: Record<string, number> = {
  main: 0,
  sprawozdanie: 1,
  autopoprawka: 2,
  poprawka: 3,
  joint: 4,
  other: 5,
};

type VotingRow = {
  id: number;
  voting_number: number;
  sitting: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
};

type LinkRow = {
  print_id: number;
  role: string;
  votings: VotingRow | VotingRow[] | null;
};

type Ranked = { role: string; v: VotingRow };

export async function getMainVotingByPrintIds(
  printIds: number[],
): Promise<Map<number, LinkedVoting>> {
  const out = new Map<number, LinkedVoting>();
  if (printIds.length === 0) return out;
  const sb = supabase();
  const { data, error } = await sb
    .from("voting_print_links")
    .select(
      "print_id, role, votings:voting_id(id, voting_number, sitting, date, title, yes, no, abstain, not_participating)",
    )
    .in("print_id", printIds);
  if (error) throw error;

  const grouped = new Map<number, LinkRow[]>();
  for (const r of (data ?? []) as LinkRow[]) {
    const list = grouped.get(r.print_id) ?? [];
    list.push(r);
    grouped.set(r.print_id, list);
  }

  for (const [pid, links] of grouped) {
    const ranked: Ranked[] = [];
    for (const l of links) {
      const v = Array.isArray(l.votings) ? l.votings[0] : l.votings;
      if (v) ranked.push({ role: l.role, v });
    }
    ranked.sort((a, b) => {
      const ra = ROLE_RANK[a.role] ?? 9;
      const rb = ROLE_RANK[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return (b.v.voting_number ?? 0) - (a.v.voting_number ?? 0);
    });
    if (ranked.length === 0) continue;
    const { role, v } = ranked[0];
    out.set(pid, {
      votingId: v.id,
      role: role as LinkedVoting["role"],
      votingNumber: v.voting_number ?? 0,
      sitting: v.sitting ?? 0,
      date: v.date ?? "",
      title: v.title ?? "",
      yes: v.yes ?? 0,
      no: v.no ?? 0,
      abstain: v.abstain ?? 0,
      notParticipating: v.not_participating ?? 0,
    });
  }

  return out;
}
