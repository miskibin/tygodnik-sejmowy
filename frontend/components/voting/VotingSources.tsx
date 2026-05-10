import Link from "next/link";
import type {
  VotingHeader,
  LinkedPrintRich,
  VotingPageData,
} from "@/lib/db/voting";
import ShareCopyButton from "./ShareCopyButton";

type Props = {
  header: VotingHeader;
  linkedPrint: LinkedPrintRich | null;
  relatedVotings: VotingPageData["relatedVotings"];
  promiseLink: VotingPageData["promiseLink"];
};

const PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 14px",
  border: "1px solid #2e2820",
  borderRadius: 9999,
  fontSize: 12,
  color: "#b5a99a",
  background: "transparent",
  textDecoration: "none",
  fontFamily: "var(--font-jetbrains-mono), monospace",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap" as const,
};

function GhostExt({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={PILL}
       className="hover:border-[#5a4e3c] hover:!text-[#e8ddd0] transition-colors">
      {children}
    </a>
  );
}

function GhostInt({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={PILL} className="hover:border-[#5a4e3c] hover:!text-[#e8ddd0] transition-colors">
      {children}
    </Link>
  );
}

export default function VotingSources({
  header,
  linkedPrint,
  relatedVotings,
  promiseLink,
}: Props) {
  const term = header.term;
  const sejmDrukUrl = (nr: string) =>
    `https://www.sejm.gov.pl/Sejm${term}.nsf/druk.xsp?nr=${encodeURIComponent(nr)}`;
  const sejmGlosUrl = `https://www.sejm.gov.pl/Sejm${term}.nsf/agent.xsp?symbol=glosowania&NrKadencji=${term}&NrPosiedzenia=${header.sitting}&NrGlosowania=${header.voting_number}`;
  const slug = `tw.sejm/g/${header.sitting}/${header.voting_number}`;

  return (
    <footer
      className="px-4 sm:px-6 md:px-8"
      style={{ background: "#0c0b09", borderTop: "1px solid #1e1a15", paddingTop: 28, paddingBottom: 36 }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        <div
          className="font-mono"
          style={{ fontSize: 10, color: "#3d3530", letterSpacing: "0.18em", marginBottom: 18, textTransform: "uppercase" }}
        >
          {slug}
        </div>

        <div className="flex flex-wrap" style={{ gap: 8, alignItems: "center" }}>
          {linkedPrint && (
            <GhostExt href={sejmDrukUrl(linkedPrint.number)}>
              druk nr {linkedPrint.number} ↗
            </GhostExt>
          )}
          {linkedPrint?.parent_number && (
            <GhostExt href={sejmDrukUrl(linkedPrint.parent_number)}>
              druk pierwotny {linkedPrint.parent_number} ↗
            </GhostExt>
          )}
          <GhostExt href={sejmGlosUrl}>
            wynik na sejm.gov.pl ↗
          </GhostExt>
          {linkedPrint && (
            <GhostInt href={`/druk/${term}/${linkedPrint.number}`}>
              wątek ustawy →
            </GhostInt>
          )}
          {promiseLink && (
            <GhostInt href={`/obietnice/${promiseLink.party_code}`}>
              obietnice {promiseLink.party_code} →
            </GhostInt>
          )}
          {relatedVotings.length > 0 && (
            <GhostInt href={`/glosowanie/${relatedVotings[0].id}`}>
              powiązane głosowania ({relatedVotings.length}) →
            </GhostInt>
          )}

          <span
            aria-hidden
            style={{ width: 1, height: 16, background: "#2a2520", margin: "0 6px", flexShrink: 0 }}
          />

          <ShareCopyButton />
        </div>

        <div
          className="font-mono"
          style={{ marginTop: 28, fontSize: 9, color: "#2a2520", letterSpacing: "0.2em", textTransform: "uppercase" }}
        >
          sejmograf.vercel.app
        </div>

      </div>
    </footer>
  );
}
