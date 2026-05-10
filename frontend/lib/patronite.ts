import "server-only";

// Patronite Author API client. Server-only — the token is sensitive and the
// raw response carries patron PII (email, full name, phone). Never return
// individual records to the client; aggregate first.

const BASE = "https://patronite.pl/author-api";

type PatronRow = {
  id: number;
  amount: number; // PLN per month
  status: string;
  totalAmount: number;
  totalMonths: number;
};

type ListResponse = {
  results?: PatronRow[];
};

export type PatroniteStats = {
  activeCount: number;
  monthlyAmount: number;       // PLN/mc, sum of active patron amounts
  inactiveCount: number;       // ever-supported, currently lapsed
  totalEverCount: number;      // active + inactive
  fetchedAt: string;           // ISO
  ok: boolean;                 // false → fall back to mock in caller
};

async function fetchPage(path: string, page: number, token: string): Promise<PatronRow[]> {
  const r = await fetch(`${BASE}${path}?page=${page}`, {
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 3600 }, // cache 1h — Patronite numbers change slowly
  });
  if (r.status === 404) return [];      // pagination end
  if (!r.ok) throw new Error(`patronite ${path} p${page} → HTTP ${r.status}`);
  const j = (await r.json()) as ListResponse;
  return j.results ?? [];
}

async function fetchAll(path: string, token: string): Promise<PatronRow[]> {
  const out: PatronRow[] = [];
  for (let p = 1; p <= 50; p++) {
    const rows = await fetchPage(path, p, token);
    if (rows.length === 0) break;
    out.push(...rows);
  }
  return out;
}

export async function getPatroniteStats(): Promise<PatroniteStats> {
  const token = process.env.PATRONITE_TOKEN;
  if (!token) {
    return {
      activeCount: 0,
      monthlyAmount: 0,
      inactiveCount: 0,
      totalEverCount: 0,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }
  try {
    const [active, inactive] = await Promise.all([
      fetchAll("/patrons/active", token),
      fetchAll("/patrons/inactive", token),
    ]);
    const monthlyAmount = active.reduce((s, p) => s + (p.amount ?? 0), 0);
    return {
      activeCount: active.length,
      monthlyAmount,
      inactiveCount: inactive.length,
      totalEverCount: active.length + inactive.length,
      fetchedAt: new Date().toISOString(),
      ok: true,
    };
  } catch {
    return {
      activeCount: 0,
      monthlyAmount: 0,
      inactiveCount: 0,
      totalEverCount: 0,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }
}
