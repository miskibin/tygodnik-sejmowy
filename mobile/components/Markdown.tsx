import RNMarkdown from "react-native-markdown-display";

import { colors, fonts, fontSize } from "@/theme";

const STYLES = {
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.55,
    color: colors.inkSoft,
  },
  heading1: {
    fontFamily: fonts.serif,
    fontSize: fontSize.lg,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 6,
  },
  heading2: {
    fontFamily: fonts.serif,
    fontSize: fontSize.md,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 4,
  },
  strong: { fontFamily: fonts.sansBold, color: colors.ink },
  em: { fontStyle: "italic" as const },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  link: { color: colors.accent, textDecorationLine: "underline" as const },
  code_inline: {
    fontFamily: "monospace",
    backgroundColor: colors.muted,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  blockquote: {
    backgroundColor: colors.muted,
    paddingLeft: 12,
    paddingVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
};

export function Markdown({ children }: { children: string }) {
  return <RNMarkdown style={STYLES}>{children}</RNMarkdown>;
}
