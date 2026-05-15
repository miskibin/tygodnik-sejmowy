// "Iskry i renegaci" — three biggest verbal clashes + four MPs who voted
// against their klub. Both sides use the same warm-paper palette and the
// destructive accent as the friction-marker.

import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { MOCK, type Starcie, type Rebel } from "../data";
import { Kicker, SectionHead } from "./SectionHead";

function StarcieCard({ s }: { s: Starcie }) {
  return (
    <div
      style={{
        padding: "22px 24px",
        background: "var(--secondary)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.14em",
          }}
        >
          pkt {s.punktOrd} · {s.punktShort}
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--destructive-deep)",
            letterSpacing: "0.14em",
          }}
        >
          ↯ {s.exchanges} starcia
        </span>
      </div>

      <div
        className="grid items-center mb-4 gap-3"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}
      >
        <div className="text-right">
          <div
            className="font-serif font-medium"
            style={{ fontSize: 17, color: "var(--foreground)" }}
          >
            {s.a}
          </div>
          <div className="mt-1 inline-block">
            <ClubBadge klub={s.aClub} size="sm" withLabel />
          </div>
        </div>
        <div
          className="font-serif italic"
          style={{
            fontSize: 22,
            color: "var(--destructive-deep)",
            lineHeight: 1,
          }}
          aria-hidden
        >
          vs.
        </div>
        <div>
          <div
            className="font-serif font-medium"
            style={{ fontSize: 17, color: "var(--foreground)" }}
          >
            {s.b}
          </div>
          <div className="mt-1 inline-block">
            <ClubBadge klub={s.bClub} size="sm" withLabel />
          </div>
        </div>
      </div>

      <p
        className="font-serif italic m-0"
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--secondary-foreground)",
          textWrap: "pretty",
        }}
      >
        {s.snippet}
      </p>
    </div>
  );
}

function RebelRow({ r, first }: { r: Rebel; first: boolean }) {
  const actualLabel =
    r.actual === "WS" ? "WSTRZ." : r.actual === "PR" ? "PRZECIW" : "ZA";
  const actualBg =
    r.actual === "ZA"
      ? "var(--success)"
      : r.actual === "PR"
        ? "var(--destructive)"
        : "var(--warning)";
  return (
    <div
      className="py-4"
      style={{
        borderTop: first ? "2px solid var(--rule)" : "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3.5 mb-2 flex-wrap">
        <MPAvatarPhoto name={r.name} size={40} />
        <div className="flex-1 min-w-0">
          <div
            className="font-serif font-medium"
            style={{ fontSize: 17, color: "var(--foreground)", lineHeight: 1.1 }}
          >
            {r.name}
          </div>
          <div
            className="font-sans mt-1 flex items-center gap-1.5 flex-wrap"
            style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}
          >
            <ClubBadge klub={r.club} size="xs" />
            <span>· pkt {r.punktOrd} — {r.punktShort}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 font-mono" style={{ fontSize: 10 }}>
          <span
            style={{
              padding: "3px 7px",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              textDecoration: "line-through",
            }}
          >
            klub: {r.expectedClub}
          </span>
          <span style={{ color: "var(--destructive-deep)" }}>→</span>
          <span
            style={{
              padding: "3px 7px",
              background: actualBg,
              color: "var(--background)",
              fontWeight: 700,
            }}
          >
            {actualLabel}
          </span>
        </div>
      </div>
      <p
        className="font-serif italic m-0 pl-[54px]"
        style={{
          fontSize: 13.5,
          color: "var(--secondary-foreground)",
          lineHeight: 1.5,
          textWrap: "pretty",
        }}
      >
        {r.note}
      </p>
    </div>
  );
}

export function Friction() {
  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={8}
          title="Iskry i renegaci"
          sub="Gdzie sala zapalała się najmocniej — i kto zagłosował wbrew swojemu klubowi."
          anchor="iskry"
        />

        <div className="grid gap-10 md:gap-14 md:grid-cols-[1.1fr_1fr]">
          <div>
            <Kicker
              color="var(--destructive-deep)"
              className="mb-3.5"
            >
              trzy największe starcia
            </Kicker>
            <div className="flex flex-col gap-4">
              {MOCK.starcia.map((s, i) => (
                <StarcieCard key={i} s={s} />
              ))}
            </div>
          </div>

          <div>
            <Kicker
              color="var(--destructive-deep)"
              className="mb-3.5"
            >
              głosowali wbrew klubowi
            </Kicker>
            <div>
              {MOCK.renegaci.map((r, i) => (
                <RebelRow key={i} r={r} first={i === 0} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
