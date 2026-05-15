import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSittingView } from "@/lib/db/sittings";
import { SittingViewClient } from "../_components/SittingViewClient";

export const revalidate = 300;

const DEFAULT_TERM = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number: raw } = await params;
  const sittingNum = Number(raw);
  if (!Number.isFinite(sittingNum) || sittingNum < 1) return {};
  const data = await getSittingView(DEFAULT_TERM, sittingNum);
  if (!data) return {};
  const title = `${data.number}. posiedzenie Sejmu — Tygodnik Sejmowy`;
  const desc = data.title;
  const path = `/posiedzenie/${data.number}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: path, type: "article" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function PosiedzeniePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number: raw } = await params;
  const sittingNum = Number(raw);
  if (!Number.isFinite(sittingNum) || sittingNum < 1) notFound();

  const data = await getSittingView(DEFAULT_TERM, sittingNum);
  if (!data) notFound();

  return <SittingViewClient data={data} />;
}
