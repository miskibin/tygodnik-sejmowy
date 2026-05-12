type SupportedPublisher = "DU" | "MP";

export type ActRef = {
  publisher: SupportedPublisher;
  year: string;
  position: string;
};

const ELI_ACT_RE = /^(DU|MP)\/(\d{4})\/(\d+)$/;

export function parseActRef(eliId: string | null | undefined): ActRef | null {
  if (!eliId) return null;
  const match = ELI_ACT_RE.exec(eliId.trim().toUpperCase());
  if (!match) return null;
  return {
    publisher: match[1] as SupportedPublisher,
    year: match[2],
    position: match[3],
  };
}

export function buildActApiUrl(ref: ActRef): string {
  return `https://api.sejm.gov.pl/eli/acts/${ref.publisher}/${ref.year}/${ref.position}`;
}

export function buildIsapAddress(ref: ActRef): string {
  const prefix = ref.publisher === "MP" ? "WMP" : "WDU";
  return `${prefix}${ref.year}${ref.position.padStart(7, "0")}`;
}

export function buildIsapDocDetailsUrlFromAddress(address: string): string {
  return `https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=${encodeURIComponent(address)}`;
}

export function buildIsapDocDetailsUrl(ref: ActRef): string {
  return buildIsapDocDetailsUrlFromAddress(buildIsapAddress(ref));
}

export function buildActDisplayAddress(eliId: string | null | undefined): string | null {
  const ref = parseActRef(eliId);
  if (!ref) return null;
  return `${ref.publisher === "MP" ? "M.P." : "Dz.U."} ${ref.year} poz. ${Number(ref.position)}`;
}

export function buildIsapPdfUrlFromAddress(address: string, fileName: string): string {
  return `https://isap.sejm.gov.pl/isap.nsf/download.xsp/${encodeURIComponent(address)}/O/${encodeURIComponent(fileName)}`;
}

export function buildActTextHref(eliId: string | null | undefined): string | null {
  const ref = parseActRef(eliId);
  if (!ref) return null;
  return `/api/isap/acts/${ref.publisher}/${ref.year}/${ref.position}`;
}

export function normalizeActSourceUrl(
  sourceUrl: string | null | undefined,
  eliId: string | null | undefined,
): string | null {
  return buildActTextHref(eliId) ?? sourceUrl ?? null;
}
