// GET /api/m/foods/barcode/<ean>
// Proxies Open Food Facts product-by-barcode v2.
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

const UA = "GymClassOS-Demo/0.1 (https://gymos.local; demo@gymos.local)";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireDemoMember(request);
  const ean = params.ean;
  if (!ean) throw new Response("Missing ean", { status: 400 });

  const offUrl =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}` +
    `?fields=code,product_name,brands,nutriments,serving_size`;

  const res = await fetch(offUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return { found: false };
  const json = (await res.json()) as { status: number; product?: any };
  if (json.status !== 1 || !json.product) return { found: false };

  const p = json.product;
  const kcal = Number(p.nutriments?.["energy-kcal_100g"] ?? 0);

  return {
    found: true,
    item: {
      id: String(p.code ?? ean),
      name: p.product_name ?? "Unknown",
      brand: p.brands ?? null,
      kcalPer100g: kcal,
      proteinPer100g: Number(p.nutriments?.proteins_100g ?? 0),
      carbsPer100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
      fatPer100g: Number(p.nutriments?.fat_100g ?? 0),
      servingSizeG: p.serving_size ?? null,
      // RESEARCH Pitfall #7 — surface missing-data signal to client
      hasNutritionData: kcal > 0,
    },
  };
}
