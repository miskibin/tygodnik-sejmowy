// "Postal date stamp" flourish for late_interpellation cards. Replaces the
// inline numeric index in the meta column with a circular oxblood badge —
// makes the delay-days the single most visible thing on the card.

export function DelayStamp({ days }: { days: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center font-serif italic text-destructive"
      style={{
        width: 72,
        height: 72,
        border: "2px solid var(--destructive)",
        borderRadius: "50%",
        transform: "rotate(-6deg)",
      }}
      aria-label={`opóźnienie ${days} dni`}
    >
      <span style={{ fontSize: 28, lineHeight: 1, fontWeight: 600 }}>{days}</span>
      <span
        className="font-mono not-italic absolute"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          bottom: 12,
          color: "var(--destructive)",
        }}
      >
        dni
      </span>
    </div>
  );
}
