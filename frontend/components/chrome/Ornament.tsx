export function Ornament({ char = "✶", pad = 18 }: { char?: string; pad?: number }) {
  return (
    <div
      className="flex items-center gap-3.5 text-destructive font-serif"
      style={{ padding: `${pad}px 0` }}
    >
      <div className="flex-1 h-px bg-current opacity-35" />
      <span className="text-sm opacity-60">{char}</span>
      <div className="flex-1 h-px bg-current opacity-35" />
    </div>
  );
}
