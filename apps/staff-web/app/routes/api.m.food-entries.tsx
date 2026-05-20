// GET /api/m/food-entries?date=YYYY-MM-DD — list entries for the day
// POST /api/m/food-entries — log an entry; inserts foodItems cache row + foodEntries
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireDemoMember(request);
  const url = new URL(request.url);
  const date =
    url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const db = getDb();
  // guard:allow-unscoped — demo D-07
  const entries = await db
    .select({
      id: schema.foodEntries.id,
      loggedAt: schema.foodEntries.loggedAt,
      mealType: schema.foodEntries.mealType,
      quantityG: schema.foodEntries.quantityG,
      kcal: schema.foodEntries.kcal,
      proteinG: schema.foodEntries.proteinG,
      carbsG: schema.foodEntries.carbsG,
      fatG: schema.foodEntries.fatG,
      source: schema.foodEntries.source,
      foodName: schema.foodItems.name,
      foodBrand: schema.foodItems.brand,
    })
    .from(schema.foodEntries)
    .leftJoin(
      schema.foodItems,
      eq(schema.foodEntries.foodItemId, schema.foodItems.id),
    )
    .where(
      and(
        eq(schema.foodEntries.memberId, member.id),
        sql`substr(${schema.foodEntries.loggedAt}, 1, 10) = ${date}`,
      ),
    )
    .orderBy(asc(schema.foodEntries.loggedAt));

  return { entries, date };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const member = await requireDemoMember(request);
  const body = (await request.json()) as {
    foodItem: {
      id?: string;
      name: string;
      brand?: string | null;
      barcode?: string | null;
      kcalPer100g: number;
      proteinPer100g?: number;
      carbsPer100g?: number;
      fatPer100g?: number;
      servingSizeG?: number | null;
      source?: "openfoodfacts" | "custom";
    };
    quantityG: number;
    mealType: "breakfast" | "lunch" | "dinner" | "snack";
  };

  if (
    !body.foodItem?.name ||
    typeof body.quantityG !== "number" ||
    !body.mealType
  ) {
    return new Response(JSON.stringify({ error: "Bad input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const fiId = `fi_${crypto.randomUUID()}`;
  const feId = `fe_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const q = body.quantityG;
  const ki = body.foodItem.kcalPer100g;
  const pi = body.foodItem.proteinPer100g ?? 0;
  const ci = body.foodItem.carbsPer100g ?? 0;
  const fi = body.foodItem.fatPer100g ?? 0;

  // Insert a foodItems row each time for the demo (no cache yet — CAL-09 in P2).
  await db.insert(schema.foodItems).values({
    id: fiId,
    name: body.foodItem.name,
    brand: body.foodItem.brand ?? null,
    barcode: body.foodItem.barcode ?? null,
    kcalPer100g: ki,
    proteinPer100g: pi,
    carbsPer100g: ci,
    fatPer100g: fi,
    source: body.foodItem.source ?? "openfoodfacts",
    externalId: body.foodItem.id ?? null,
    verified: false,
  });

  // Snapshot macros into foodEntries
  await db.insert(schema.foodEntries).values({
    id: feId,
    memberId: member.id,
    foodItemId: fiId,
    loggedAt: now,
    mealType: body.mealType,
    quantityG: q,
    kcal: (ki * q) / 100,
    proteinG: (pi * q) / 100,
    carbsG: (ci * q) / 100,
    fatG: (fi * q) / 100,
    source: body.foodItem.barcode ? "barcode" : "search",
  });

  return new Response(JSON.stringify({ entryId: feId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
