// GET /api/m/foods/search?q=<query>
// Proxies Open Food Facts search. Server-side so we attribute correctly (ODbL)
// and can drop in a cache table later without changing the mobile client.
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

const UA = "RunStudio-Demo/0.1 (https://gymos.local; demo@gymos.local)";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireDemoMember(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return { results: [] };

  const offUrl =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20`;

  const res = await fetch(offUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    return { results: [], error: `OFF ${res.status}` };
  }
  const json = (await res.json()) as { products?: any[] };
  const results = (json.products ?? []).slice(0, 20).map((p) => ({
    id: String(p.code ?? p._id ?? ""),
    name: p.product_name ?? p.product_name_en ?? "Unknown",
    brand: p.brands ?? null,
    kcalPer100g: Number(p.nutriments?.["energy-kcal_100g"] ?? 0),
    proteinPer100g: Number(p.nutriments?.proteins_100g ?? 0),
    carbsPer100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
    fatPer100g: Number(p.nutriments?.fat_100g ?? 0),
    servingSizeG: p.serving_size ?? null,
  }));
  return { results };
}
