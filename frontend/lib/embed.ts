import "server-only";

export const EMBED_DIM = 1024;
// Corpus migrated to qwen3-embedding:0.6b (natively 1024-d). nomic was
// 768-d zero-padded to 1024 — different vector space, so cross-model
// queries return garbage. Keep `model` overrideable for ops/debug.
export const DEFAULT_EMBED_MODEL = "qwen3-embedding:0.6b";
const DEFAULT_TIMEOUT_MS = 30_000;

function ollamaUrl(): string {
  return (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
}

export async function embedQuery(
  text: string,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<number[]> {
  const model = opts.model ?? DEFAULT_EMBED_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${ollamaUrl()}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text().catch(() => "")}`);
    const j = (await r.json()) as { embedding?: number[] };
    const vec = j.embedding;
    if (!Array.isArray(vec) || vec.length === 0) throw new Error("empty embedding");
    if (vec.length > EMBED_DIM) throw new Error(`embedding too long: ${vec.length}`);
    // Legacy nomic path: 768-d → zero-pad to 1024. qwen3 returns 1024 natively
    // so this branch only fires when caller overrides `model` to nomic.
    if (vec.length < EMBED_DIM) {
      const padded = vec.slice();
      while (padded.length < EMBED_DIM) padded.push(0);
      return padded;
    }
    return vec;
  } finally {
    clearTimeout(t);
  }
}

export function toVecLiteral(vec: number[]): string {
  return "[" + vec.map((v) => v.toFixed(6)).join(",") + "]";
}
