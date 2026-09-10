import "server-only";
import { supabase } from "@/lib/supabase";
import { isNetworkSnapshot, type NetworkSnapshot } from "@/lib/network";

export async function getNetworkPageData() {
  try {
    const snapshot = await getNetworkSnapshot();
    return { snapshot, unavailable: false, stale: !!snapshot && Date.now() - Date.parse(snapshot.generated_at) > 48 * 3600000 };
  } catch {
    return { snapshot: null, unavailable: true, stale: false };
  }
}

export async function getNetworkSnapshot(term = 10): Promise<NetworkSnapshot | null> {
  // Explicit local research preview, disabled in production. No bundled sample data.
  if (process.env.NODE_ENV === "development" && process.env.SUPAGRAF_NETWORK_PREVIEW_FILE) {
    const { readFile } = await import("node:fs/promises");
    const value: unknown = JSON.parse(await readFile(process.env.SUPAGRAF_NETWORK_PREVIEW_FILE, "utf8"));
    if (!isNetworkSnapshot(value) || value.term !== term) throw new Error("Invalid network preview");
    return value;
  }
  const { data, error } = await supabase().from("politician_network_snapshots")
    .select("payload").eq("term", term).maybeSingle();
  if (error) throw new Error("Network snapshot unavailable");
  if (!data) return null;
  if (!isNetworkSnapshot(data.payload) || data.payload.term !== term) throw new Error("Invalid network snapshot");
  return data.payload;
}
