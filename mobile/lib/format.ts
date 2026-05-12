export function formatDateRange(first: string, last: string): string {
  if (!first) return "";
  const f = new Date(first);
  const l = last ? new Date(last) : f;
  const months = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
  ];
  if (f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear()) {
    if (f.getDate() === l.getDate()) {
      return `${f.getDate()} ${months[f.getMonth()]} ${f.getFullYear()}`;
    }
    return `${f.getDate()}–${l.getDate()} ${months[f.getMonth()]} ${f.getFullYear()}`;
  }
  return `${f.getDate()} ${months[f.getMonth()]} – ${l.getDate()} ${months[l.getMonth()]} ${l.getFullYear()}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
