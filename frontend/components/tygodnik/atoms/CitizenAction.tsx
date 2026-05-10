// "→ co możesz zrobić" footer block for prints. Hidden when LLM didn't
// produce a concrete citizen-side action.

export function CitizenAction({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-baseline gap-3.5 pt-3.5 mt-1.5 border-t border-dotted border-border font-sans">
      <span className="text-[10px] tracking-[0.16em] uppercase text-destructive font-medium min-w-[130px]">
        → co możesz zrobić
      </span>
      <span className="text-sm leading-[1.5] text-secondary-foreground flex-1">
        {text}
      </span>
    </div>
  );
}
