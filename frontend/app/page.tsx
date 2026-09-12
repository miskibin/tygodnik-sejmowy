import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function canonicalTygodnikUrl(searchParams: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  const encoded = query.toString();
  return encoded ? `/tygodnik?${encoded}` : "/tygodnik";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirect(canonicalTygodnikUrl(await searchParams));
}
