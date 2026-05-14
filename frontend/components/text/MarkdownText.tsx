import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Render LLM-enriched plain text with limited inline markdown.
// Idempotent on plain text: no markdown -> renders identically to {text}.
//
// Hard rules (security + design):
//   - NO rehype-raw. Plaintext-with-markdown only; raw HTML is dropped.
//   - Only inline marks pass through: strong, em, code, a.
//   - Block elements (lists, headings, blockquotes, code blocks, tables)
//     are flattened to inline text via the `unwrap` renderer below — the
//     LLM occasionally emits "1." / "-" patterns that remark parses as a
//     list; we don't want those reflowing the layout.
//   - Internal links use Next <Link> (client routing); external get
//     target=_blank + rel=noopener noreferrer + small ↗ glyph.

type MarkdownTextProps = {
  text: string | null | undefined;
  className?: string;
  // When true (default) the outer <p> renders as a fragment so the caller
  // controls block wrapping. When false, paragraphs render as <p>.
  inline?: boolean;
  // When true, render <ul>/<ol>/<li> as proper block lists instead of
  // unwrapping them inline. Use for long-form fields (print summary_plain)
  // where the LLM emits "- item" enumerations and visual list structure
  // aids scanability. Default false preserves legacy inline-only contract.
  allowLists?: boolean;
};

// Internal route prefixes used across sejmograf. External = anything else.
const INTERNAL_PREFIXES = [
  "/proces/",
  "/mowa/",
  "/glosowanie/",
  "/posel/",
  "/atlas/",
  "/obietnice/",
  "/komisja/",
  "/tygodnik",
  "/szukaj",
  "/o-projekcie",
  "/budzet",
  "/manifest",
  "/alerty",
];

function isInternalHref(href: string): boolean {
  if (href.startsWith("/")) {
    return INTERNAL_PREFIXES.some((p) => href === p || href.startsWith(p));
  }
  return false;
}

// Drop block wrappers, keep their children inline. Used for ul/ol/li/blockquote
// /pre so the LLM accidentally producing them doesn't break the typography.
function unwrap({ children }: { children?: ReactNode }): ReactNode {
  return <>{children}</>;
}

// Headings degrade to <span> — the LLM should never emit them, but if it does
// we don't want a giant H1 mid-paragraph.
function asSpan({ children }: { children?: ReactNode }): ReactNode {
  return <span>{children}</span>;
}

function buildComponents(inline: boolean, allowLists: boolean): Components {
  return {
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="font-mono text-destructive text-[0.95em]">{children}</code>
    ),
    a: ({ href, children }) => {
      const url = href ?? "";
      if (!url) return <>{children}</>;
      if (isInternalHref(url)) {
        return (
          <Link
            href={url}
            className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {children}
          </Link>
        );
      }
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          {children}
          <span aria-hidden className="ml-0.5 text-[0.85em]">↗</span>
        </a>
      );
    },
    p: inline
      ? ({ children }) => <>{children}</>
      : ({ children }) => <p>{children}</p>,
    h1: asSpan,
    h2: asSpan,
    h3: asSpan,
    h4: asSpan,
    h5: asSpan,
    h6: asSpan,
    ul: allowLists
      ? ({ children }) => (
          <ul className="my-3 pl-5 list-disc marker:text-muted-foreground space-y-1">
            {children}
          </ul>
        )
      : unwrap,
    ol: allowLists
      ? ({ children }) => (
          <ol className="my-3 pl-5 list-decimal marker:text-muted-foreground space-y-1">
            {children}
          </ol>
        )
      : unwrap,
    li: allowLists ? ({ children }) => <li>{children}</li> : unwrap,
    blockquote: unwrap,
    pre: unwrap,
    hr: () => null,
    img: () => null,
  };
}

const INLINE_COMPONENTS = buildComponents(true, false);
const BLOCK_COMPONENTS = buildComponents(false, false);
const BLOCK_LIST_COMPONENTS = buildComponents(false, true);
const INLINE_LIST_COMPONENTS = buildComponents(true, true);

export function MarkdownText({ text, className, inline = true, allowLists = false }: MarkdownTextProps) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const components = allowLists
    ? inline
      ? INLINE_LIST_COMPONENTS
      : BLOCK_LIST_COMPONENTS
    : inline
      ? INLINE_COMPONENTS
      : BLOCK_COMPONENTS;
  const node = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {text}
    </ReactMarkdown>
  );

  if (!className) return node;
  // Wrap to apply a class without injecting a paragraph element.
  const Wrapper = inline ? "span" : "div";
  return <Wrapper className={className}>{node}</Wrapper>;
}
