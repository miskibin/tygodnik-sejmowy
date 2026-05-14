import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ProfileProvider } from "@/lib/profile";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ChromeSlot } from "@/components/chrome/ChromeSlot";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import "./globals.css";

const UMAMI_WEBSITE_ID = "85d3ab78-6c6b-4d21-8552-351cd900cd71";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
});

const SITE_URL = "https://tygodniksejmowy.pl";
const SITE_NAME = "Tygodnik Sejmowy";
const SITE_DESC =
  "Tygodnik obywatelski. Piątkowy przegląd prac Sejmu RP: głosowania, druki, komisje. Wydanie dopasowane do Twojego okręgu.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — piątkowy skrót posiedzenia`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  generator: "Next.js",
  keywords: [
    "Sejm",
    "Tygodnik Sejmowy",
    "polityka",
    "ustawy",
    "głosowania",
    "posłowie",
    "obietnice wyborcze",
    "obywatelski",
    "X kadencja",
    "Polska",
  ],
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [
        { url: "/rss.xml", title: "Tygodnik Sejmowy — druki" },
      ],
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — piątkowy skrót posiedzenia`,
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — piątkowy skrót posiedzenia`,
    description: SITE_DESC,
  },
  category: "news",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcf8" },
    { media: "(prefers-color-scheme: dark)", color: "#161310" },
  ],
};

// JSON-LD Organization schema. Helps Google understand site identity for
// the Knowledge Graph and surfaces a rich-results card on brand searches.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: SITE_NAME,
  alternateName: "Twój Sejm",
  url: SITE_URL,
  logo: `${SITE_URL}/icon`,
  description: SITE_DESC,
  inLanguage: "pl-PL",
  sameAs: ["https://patronite.pl/tygodniksejmowy"],
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "pl-PL",
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/szukaj?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pl"
      className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={["light", "dark", "slate"]}
          enableSystem={false}
          disableTransitionOnChange
        >
          <ProfileProvider>
            <Suspense fallback={null}>
              <ChromeSlot />
            </Suspense>
            {children}
            <SiteFooter />
          </ProfileProvider>
        </ThemeProvider>
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id={UMAMI_WEBSITE_ID}
          strategy="lazyOnload"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
      </body>
    </html>
  );
}
