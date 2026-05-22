---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 05
type: execute
wave: 2
depends_on: ["D2-01"]
files_modified:
  - templates/mail/app/routes/api.m.foods.search.tsx
  - templates/mail/app/routes/api.m.foods.barcode.$ean.tsx
  - templates/mail/app/routes/api.m.food-entries.tsx
  - packages/mobile-app/components/BarcodeScanner.tsx
  - packages/mobile-app/app/(tabs)/food.tsx
  - packages/mobile-app/app/food-add.tsx
  - packages/mobile-app/app/food-barcode.tsx
autonomous: true
requirements: [CAL-01, CAL-02, CAL-03]
must_haves:
  truths:
    - "GET /api/m/foods/search?q=banana returns a list of OFF products with id, name, brand, kcalPer100g + macro per 100g"
    - "GET /api/m/foods/barcode/<ean> returns {found: true, item: {...}} for a valid OFF barcode, or {found: false} otherwise"
    - "POST /api/m/food-entries with {foodItem, quantityG, mealType} inserts a foodItems row (one-off cache) + a foodEntries row snapshotting kcal/macros at log time"
    - "GET /api/m/food-entries?date=YYYY-MM-DD returns the list of entries for that date for the current member"
    - "Food tab renders: today totals (kcal + macros), meal-type sections (Breakfast / Lunch / Dinner / Snacks), each entry showing food name + quantity + kcal, and a floating '+ Add' button"
    - "Tap '+ Add' → modal with two buttons: 'Search' (navigates to food-add screen) and 'Scan barcode' (navigates to food-barcode screen)"
    - "Search screen: text input → debounced search → list of results → tap result → meal-type picker → confirm → entry logged + return to Food tab + today's totals update optimistically"
    - "Barcode screen: camera permission prompt → live camera with overlay → on-scan looks up OFF → on-found shows meal-type picker + Log button → on-not-found shows 'Couldn't find — try a different name'"
    - "Camera permission denied → in-screen explanation + 'Grant permission' button (NOT a stuck black screen — RESEARCH Pitfall #6)"
  artifacts:
    - path: "templates/mail/app/routes/api.m.foods.search.tsx"
      provides: "GET — proxy to Open Food Facts cgi/search.pl with attribution User-Agent"
      exports: ["loader"]
      min_lines: 40
    - path: "templates/mail/app/routes/api.m.foods.barcode.$ean.tsx"
      provides: "GET — proxy to OFF v2 product-by-barcode endpoint"
      exports: ["loader"]
      min_lines: 40
    - path: "templates/mail/app/routes/api.m.food-entries.tsx"
      provides: "GET (today list) + POST (log entry — inserts foodItems cache row + foodEntries snapshot)"
      exports: ["loader", "action"]
      min_lines: 80
    - path: "packages/mobile-app/components/BarcodeScanner.tsx"
      provides: "expo-camera CameraView wrapper with permission flow + EAN/UPC scanner settings + one-shot onScanned callback"
      exports: ["default"]
      min_lines: 50
    - path: "packages/mobile-app/app/(tabs)/food.tsx"
      provides: "Food tab — today totals + meal-type sections + entries list + '+ Add' button"
      exports: ["default"]
      min_lines: 150
    - path: "packages/mobile-app/app/food-add.tsx"
      provides: "Search screen — text input, debounced OFF search, result list, meal-type picker, confirm to log"
      exports: ["default"]
      min_lines: 120
    - path: "packages/mobile-app/app/food-barcode.tsx"
      provides: "Barcode scanner screen — uses BarcodeScanner component, calls OFF barcode endpoint, lets user confirm + log"
      exports: ["default"]
      min_lines: 80
  key_links:
    - from: "packages/mobile-app/components/BarcodeScanner.tsx"
      to: "expo-camera CameraView + useCameraPermissions"
      via: "barcodeScannerSettings.barcodeTypes = ['ean13','ean8','upc_a','upc_e'] + onBarcodeScanned one-shot"
      pattern: "barcodeScannerSettings"
    - from: "templates/mail/app/routes/api.m.foods.search.tsx"
      to: "world.openfoodfacts.org/cgi/search.pl"
      via: "server-side fetch with User-Agent attribution"
      pattern: "openfoodfacts\\.org/cgi/search"
    - from: "templates/mail/app/routes/api.m.food-entries.tsx action"
      to: "schema.foodItems + schema.foodEntries"
      via: "two inserts in sequence (foodItems first; foodEntries references food_item_id NOT NULL)"
      pattern: "insert\\(schema\\.foodItems\\)"
    - from: "packages/mobile-app/app/(tabs)/food.tsx"
      to: "GET /api/m/food-entries + GET /api/m/profile (for targets)"
      via: "two useQuery hooks; entries refetched on focus + after add mutation"
      pattern: "useQuery.*food-entries"
---

<objective>
Build the calorie-counter surface: server endpoints for OFF search, OFF barcode lookup, and food entry CRUD; mobile screens for the Today view, search-add flow, and barcode-scan flow. The "wow" of the demo hinges on the barcode flow working live.

Purpose: Demo Sprint deliverable for CAL-01 (search OFF + log), CAL-02 (barcode scan + log), CAL-03 (today totals). Macro targets are hardcoded per D-10 (already encoded in `/api/m/profile`).

Output:
- 3 server endpoints under `templates/mail/app/routes/api.m.foods.*` and `.../api.m.food-entries.tsx`
- 1 reusable BarcodeScanner component with permission flow
- 3 mobile screens: Food tab (Today) + food-add (search) + food-barcode (scan)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-01-mobile-shell-auth-PLAN.md
@templates/mail/server/db/schema.ts

<interfaces>
From templates/mail/server/db/schema.ts:
```typescript
// food_items — cache of OFF/USDA/custom; foodEntries.foodItemId is NOT NULL
export const foodItems: { id, name, brand, barcode, kcalPer100g: number, proteinPer100g, carbsPer100g, fatPer100g, fibrePer100g, sugarPer100g, sodiumMgPer100g, servingSizeG, source: "openfoodfacts"|"usda"|"custom"|"llm_estimate", externalId, verified: boolean, createdAt }

// food_entries — append-only diary; snapshots kcal/macros at log time
export const foodEntries: { id, memberId, foodItemId, loggedAt, mealType: "breakfast"|"lunch"|"dinner"|"snack", quantityG: number, kcal: number, proteinG, carbsG, fatG, source: "manual"|"barcode"|"search"|"favourite"|"agent", createdAt }
```

From templates/mail/server/lib/demo-member.ts (D2-01 Task 4):
```typescript
export async function requireDemoMember(request: Request): Promise<DemoMember>;
```

OFF endpoints (verified by RESEARCH §Pattern 4):
- Search: `https://world.openfoodfacts.org/cgi/search.pl?search_terms={q}&search_simple=1&action=process&json=1&page_size=20`
- Barcode: `https://world.openfoodfacts.org/api/v2/product/{ean}?fields=code,product_name,brands,nutriments,serving_size`
- Attribution: `User-Agent: GymClassOS-Demo/0.1 (https://gymos.local; demo@gymos.local)` (ODbL — required)

expo-camera (verified by RESEARCH §Pattern 3):
- Import: `import { CameraView, useCameraPermissions } from "expo-camera"`
- Use `barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}`
- `onBarcodeScanned` may fire many times — guard with a one-shot ref
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create the 3 server endpoints — OFF search proxy, OFF barcode proxy, food entries GET/POST</name>
  <files>
    - templates/mail/app/routes/api.m.foods.search.tsx
    - templates/mail/app/routes/api.m.foods.barcode.$ean.tsx
    - templates/mail/app/routes/api.m.food-entries.tsx
  </files>
  <read_first>
    - templates/mail/server/db/schema.ts lines 261-302 (foodItems + foodEntries shape)
    - templates/mail/server/lib/demo-member.ts (the gate helper)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 4: Open Food Facts proxy" (the search + barcode loader source)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #7 (OFF returns null nutriments — always cast with Number(...) ?? 0)
  </read_first>
  <action>
**File 1 — `templates/mail/app/routes/api.m.foods.search.tsx`:**

```ts
// GET /api/m/foods/search?q=<query>
// Proxies Open Food Facts search. Server-side so we attribute correctly (ODbL)
// and can drop in a cache table later without changing the mobile client.
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

const UA = "GymClassOS-Demo/0.1 (https://gymos.local; demo@gymos.local)";

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
```

**File 2 — `templates/mail/app/routes/api.m.foods.barcode.$ean.tsx`:**

```ts
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
```

**File 3 — `templates/mail/app/routes/api.m.food-entries.tsx`:**

```ts
// GET /api/m/food-entries?date=YYYY-MM-DD — list entries for the day
// POST /api/m/food-entries — log an entry; inserts foodItems cache row + foodEntries
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireDemoMember(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

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
    .leftJoin(schema.foodItems, eq(schema.foodEntries.foodItemId, schema.foodItems.id))
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

  if (!body.foodItem?.name || typeof body.quantityG !== "number" || !body.mealType) {
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
```

Run `npx prettier --write templates/mail/app/routes/api.m.foods.search.tsx templates/mail/app/routes/api.m.foods.barcode.\$ean.tsx templates/mail/app/routes/api.m.food-entries.tsx`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const checks=[['templates/mail/app/routes/api.m.foods.search.tsx','openfoodfacts.org/cgi/search'],['templates/mail/app/routes/api.m.foods.search.tsx','GymClassOS-Demo'],['templates/mail/app/routes/api.m.foods.barcode.$ean.tsx','api/v2/product'],['templates/mail/app/routes/api.m.foods.barcode.$ean.tsx','hasNutritionData'],['templates/mail/app/routes/api.m.food-entries.tsx','export async function loader'],['templates/mail/app/routes/api.m.food-entries.tsx','export async function action'],['templates/mail/app/routes/api.m.food-entries.tsx','db.insert(schema.foodItems)'],['templates/mail/app/routes/api.m.food-entries.tsx','db.insert(schema.foodEntries)']];for(const[f,s] of checks){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}"</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: `api.m.foods.search.tsx`, `api.m.foods.barcode.$ean.tsx`, `api.m.food-entries.tsx`
    - `grep -c 'openfoodfacts.org/cgi/search' templates/mail/app/routes/api.m.foods.search.tsx` returns 1
    - `grep -c 'GymClassOS-Demo' templates/mail/app/routes/api.m.foods.search.tsx` returns 1 (ODbL UA)
    - `grep -c 'api/v2/product' templates/mail/app/routes/api.m.foods.barcode.$ean.tsx` returns 1
    - `grep -c 'hasNutritionData' templates/mail/app/routes/api.m.foods.barcode.$ean.tsx` returns 1 (Pitfall #7 signal)
    - `grep -c 'export async function action' templates/mail/app/routes/api.m.food-entries.tsx` returns 1
    - `grep -c 'db.insert(schema.foodItems)' templates/mail/app/routes/api.m.food-entries.tsx` returns 1
    - `grep -c 'db.insert(schema.foodEntries)' templates/mail/app/routes/api.m.food-entries.tsx` returns 1
    - `grep -c 'requireDemoMember' templates/mail/app/routes/api.m.food-entries.tsx` returns at least 2 (loader + action)
    - `npx tsc --noEmit -p templates/mail` returns 0 errors
  </acceptance_criteria>
  <done>3 server endpoints serve OFF search, OFF barcode lookup, and food-entries GET/POST; all gated by requireDemoMember; ODbL attribution UA in place; foodItems cache row created on each log (CAL-09 cache optimization deferred to P2)</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create BarcodeScanner component with permission flow</name>
  <files>
    - packages/mobile-app/components/BarcodeScanner.tsx
  </files>
  <read_first>
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 3: expo-camera barcode scanning" (the complete component source)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #6 (3-state permission render: loading / denied / granted)
  </read_first>
  <action>
Create new file `packages/mobile-app/components/BarcodeScanner.tsx`. Full content:

```tsx
import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

type Props = { onScanned: (ean: string) => void };

/**
 * Full-screen camera with EAN/UPC barcode detection.
 *
 * 3-state render (Pitfall #6):
 *   - permissions loading (perm === null) → null (parent decides loader UX)
 *   - denied (!perm.granted) → in-screen explanation + Grant button
 *   - granted → CameraView
 *
 * `onScanned` is invoked at most once — `onBarcodeScanned` fires many times
 * per second in expo-camera so we self-guard.
 */
export default function BarcodeScanner({ onScanned }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const [done, setDone] = useState(false);

  if (!perm) return null;
  if (!perm.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>Camera permission is required to scan barcodes.</Text>
        <Pressable onPress={requestPerm} style={styles.btn}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={(result) => {
          if (done) return;
          if (!result?.data) return;
          setDone(true);
          onScanned(result.data);
        }}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Centre the barcode in the frame</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  copy: { color: "#fff", textAlign: "center", fontSize: 16 },
  btn: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "600" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 24 },
  frame: {
    width: 280,
    height: 140,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "transparent",
  },
  hint: { color: "#fff", fontSize: 14, opacity: 0.9, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 4 },
});
```

Run `npx prettier --write packages/mobile-app/components/BarcodeScanner.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/components/BarcodeScanner.tsx','utf8');const checks=['CameraView','useCameraPermissions','barcodeScannerSettings','barcodeTypes','ean13','onBarcodeScanned','requestPerm','export default function BarcodeScanner'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}const oneShot=s.includes('if (done) return');if(!oneShot){console.error('Missing one-shot guard');process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/mobile-app/components/BarcodeScanner.tsx` exists
    - `grep -c 'CameraView' packages/mobile-app/components/BarcodeScanner.tsx` returns at least 2 (import + JSX)
    - `grep -c 'useCameraPermissions' packages/mobile-app/components/BarcodeScanner.tsx` returns at least 2
    - `grep -c 'barcodeScannerSettings' packages/mobile-app/components/BarcodeScanner.tsx` returns 1
    - `grep -c 'ean13' packages/mobile-app/components/BarcodeScanner.tsx` returns 1
    - `grep -c 'onBarcodeScanned' packages/mobile-app/components/BarcodeScanner.tsx` returns 1
    - `grep -c 'if (done) return' packages/mobile-app/components/BarcodeScanner.tsx` returns 1 (one-shot guard against expo-camera multi-fire)
    - `grep -c 'Grant permission' packages/mobile-app/components/BarcodeScanner.tsx` returns 1 (Pitfall #6 — non-stuck permission state)
    - File has at least 50 lines
  </acceptance_criteria>
  <done>Reusable BarcodeScanner exposes a one-shot onScanned(ean) callback, handles all three permission states (loading/denied/granted) without leaving a stuck black screen</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Build Food tab — today totals + meal-type sections + entries list + add button</name>
  <files>
    - packages/mobile-app/app/(tabs)/food.tsx
  </files>
  <read_first>
    - packages/mobile-app/app/(tabs)/food.tsx (D2-01 placeholder — we overwrite it)
    - packages/mobile-app/lib/api.ts (apiFetch helper)
    - templates/mail/app/routes/api.m.food-entries.tsx (GET response shape — entries[].{loggedAt, mealType, quantityG, kcal, foodName, foodBrand})
    - templates/mail/app/routes/api.m.profile.tsx (today.{targetKcal, targetProteinG, ...})
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas" (meal-type section headers: Breakfast / Lunch / Dinner / Snacks; "+ Add" button label)
  </read_first>
  <action>
REPLACE the placeholder `packages/mobile-app/app/(tabs)/food.tsx` with:

```tsx
import { useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Modal } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

type Entry = {
  id: string;
  loggedAt: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  quantityG: number;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  foodName: string | null;
  foodBrand: string | null;
};

const MEAL_LABELS: Record<Entry["mealType"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};
const MEAL_ORDER: Entry["mealType"][] = ["breakfast", "lunch", "dinner", "snack"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FoodScreen() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const dateKey = todayStr();

  const entriesQ = useQuery<{ entries: Entry[]; date: string }>({
    queryKey: ["food-entries", dateKey],
    queryFn: () => apiFetch(`/api/m/food-entries?date=${dateKey}`),
  });

  const profileQ = useQuery<any>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  useFocusEffect(
    useCallback(() => {
      entriesQ.refetch();
      profileQ.refetch();
    }, [entriesQ, profileQ]),
  );

  const grouped = useMemo(() => {
    const out: Record<Entry["mealType"], Entry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const e of entriesQ.data?.entries ?? []) {
      out[e.mealType].push(e);
    }
    return out;
  }, [entriesQ.data]);

  const totals = useMemo(() => {
    let k = 0, p = 0, c = 0, f = 0;
    for (const e of entriesQ.data?.entries ?? []) {
      k += e.kcal ?? 0;
      p += e.proteinG ?? 0;
      c += e.carbsG ?? 0;
      f += e.fatG ?? 0;
    }
    return { kcal: k, proteinG: p, carbsG: c, fatG: f };
  }, [entriesQ.data]);

  const target = profileQ.data?.today ?? { targetKcal: 2100, targetProteinG: 130, targetCarbsG: 250, targetFatG: 60 };
  const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

  if (entriesQ.isLoading && !entriesQ.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <Text style={styles.heading}>Today</Text>
        <Text style={styles.kcalTotal}>
          {fmt(totals.kcal)} / {fmt(target.targetKcal)} kcal
        </Text>
        <Text style={styles.macroLine}>
          P {fmt(totals.proteinG)}g  C {fmt(totals.carbsG)}g  F {fmt(totals.fatG)}g
        </Text>

        {MEAL_ORDER.map((m) => (
          <View key={m} style={styles.section}>
            <Text style={styles.sectionHeader}>{MEAL_LABELS[m]}</Text>
            {grouped[m].length === 0 ? (
              <Text style={styles.emptyRow}>Nothing logged</Text>
            ) : (
              grouped[m].map((e) => (
                <View key={e.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foodName}>{e.foodName ?? "Unknown"}</Text>
                    <Text style={styles.foodMeta}>
                      {Math.round(e.quantityG)}g · {Math.round(e.kcal)} kcal
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add food</Text>
            <Pressable
              style={styles.addOption}
              onPress={() => {
                setAddOpen(false);
                router.push("/food-add");
              }}
            >
              <Feather name="search" size={20} color="#fff" />
              <Text style={styles.addOptionText}>Search</Text>
            </Pressable>
            <Pressable
              style={styles.addOption}
              onPress={() => {
                setAddOpen(false);
                router.push("/food-barcode");
              }}
            >
              <Feather name="camera" size={20} color="#fff" />
              <Text style={styles.addOptionText}>Scan barcode</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  heading: { color: "#fff", fontSize: 32, fontWeight: "700" },
  kcalTotal: { color: "#fff", fontSize: 24, fontWeight: "600", marginTop: 8, fontVariant: ["tabular-nums"] },
  macroLine: { color: "#999", fontSize: 14, marginTop: 4, fontVariant: ["tabular-nums"] },
  section: { marginTop: 24 },
  sectionHeader: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: { backgroundColor: "#1a1a1a", padding: 12, borderRadius: 10, marginBottom: 6 },
  foodName: { color: "#fff", fontSize: 15 },
  foodMeta: { color: "#666", fontSize: 12, marginTop: 2 },
  emptyRow: { color: "#444", fontSize: 13, paddingHorizontal: 4 },
  fab: {
    position: "absolute",
    bottom: 96,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1a1a1a", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 12 },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#333", marginBottom: 8 },
  sheetTitle: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#252525",
    padding: 16,
    borderRadius: 12,
  },
  addOptionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
```

Run `npx prettier --write packages/mobile-app/app/\(tabs\)/food.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/food.tsx','utf8');const checks=['useQuery','/api/m/food-entries','/api/m/profile','useFocusEffect','MEAL_ORDER','router.push(\"/food-add\")','router.push(\"/food-barcode\")','Breakfast','Lunch','Dinner','Snacks','+ Add' /* sheet button */ || true];const missing=['useQuery','/api/m/food-entries','/api/m/profile','useFocusEffect','router.push(\"/food-add\")','router.push(\"/food-barcode\")','Breakfast','Lunch','Dinner','Snacks'].filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '/api/m/food-entries' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c '/api/m/profile' packages/mobile-app/app/(tabs)/food.tsx` returns 1 (target macros)
    - `grep -c 'useFocusEffect' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c 'router.push("/food-add")' packages/mobile-app/app/(tabs)/food.tsx` returns 1
    - `grep -c 'router.push("/food-barcode")' packages/mobile-app/app/(tabs)/food.tsx` returns 1
    - `grep -c 'Breakfast' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c 'Lunch' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c 'Dinner' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c 'Snacks' packages/mobile-app/app/(tabs)/food.tsx` returns at least 1
    - `grep -c 'Scan barcode' packages/mobile-app/app/(tabs)/food.tsx` returns 1
    - File has at least 150 lines
  </acceptance_criteria>
  <done>Food tab shows today's totals against targets, lists entries grouped by meal type, exposes a "+ Add" FAB that opens a modal with Search and Scan options routing to /food-add and /food-barcode</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Build /food-add search screen + /food-barcode scan screen</name>
  <files>
    - packages/mobile-app/app/food-add.tsx
    - packages/mobile-app/app/food-barcode.tsx
  </files>
  <read_first>
    - packages/mobile-app/components/BarcodeScanner.tsx (Task 2 — the scanner component)
    - packages/mobile-app/lib/api.ts (apiFetch helper)
    - packages/mobile-app/app/(tabs)/food.tsx (Task 3 — the entry-list shape we feed into via cache invalidation)
    - templates/mail/app/routes/api.m.food-entries.tsx (POST body shape: { foodItem, quantityG, mealType })
    - packages/mobile-app/app/_layout.tsx (D2-01 — needs a Stack.Screen registration for food-add + food-barcode; this task ALSO updates _layout.tsx)
  </read_first>
  <action>
**Step A — Register the two new screens in `packages/mobile-app/app/_layout.tsx`.**

Read the current `_layout.tsx` (D2-01 Task 3 output). In the `<Stack>` block, add these two screens AFTER the existing `Stack.Screen name="pick-member"`:

```tsx
<Stack.Screen
  name="food-add"
  options={{ title: "Add food", headerShown: true, presentation: "modal" }}
/>
<Stack.Screen
  name="food-barcode"
  options={{ title: "Scan barcode", headerShown: true, presentation: "modal" }}
/>
```

Preserve every other existing screen registration.

**Step B — Create `packages/mobile-app/app/food-add.tsx`:**

```tsx
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";

type Result = {
  id: string;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSizeG: string | null;
};

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export default function FoodAddScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<Result | null>(null);
  const [mealType, setMealType] = useState<MealType>("snack");
  const [quantity, setQuantity] = useState("100");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isLoading } = useQuery<{ results: Result[] }>({
    queryKey: ["food-search", debouncedQ],
    queryFn: () => apiFetch(`/api/m/foods/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.length >= 2,
  });

  async function logEntry() {
    if (!selected) return;
    setLogging(true);
    setError(null);
    const qtyG = Number(quantity);
    if (!Number.isFinite(qtyG) || qtyG <= 0) {
      setError("Quantity must be a positive number of grams");
      setLogging(false);
      return;
    }
    try {
      await apiFetch("/api/m/food-entries", {
        method: "POST",
        body: JSON.stringify({
          foodItem: {
            id: selected.id,
            name: selected.name,
            brand: selected.brand,
            kcalPer100g: selected.kcalPer100g,
            proteinPer100g: selected.proteinPer100g,
            carbsPer100g: selected.carbsPer100g,
            fatPer100g: selected.fatPer100g,
            source: "openfoodfacts",
          },
          quantityG: qtyG,
          mealType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["food-entries"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLogging(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Feather name="search" size={18} color="#999" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search foods (e.g. banana)"
          placeholderTextColor="#666"
          style={styles.input}
          autoFocus
        />
      </View>

      {selected ? (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmName}>{selected.name}</Text>
          {selected.brand && <Text style={styles.confirmBrand}>{selected.brand}</Text>}
          <Text style={styles.confirmKcal}>
            {Math.round(selected.kcalPer100g)} kcal / 100g
          </Text>

          <Text style={styles.label}>Quantity (g)</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            style={styles.qtyInput}
          />

          <Text style={styles.label}>Meal</Text>
          <View style={styles.mealRow}>
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
              <Pressable
                key={m}
                style={[styles.mealPill, mealType === m && styles.mealPillActive]}
                onPress={() => setMealType(m)}
              >
                <Text style={[styles.mealPillText, mealType === m && styles.mealPillTextActive]}>
                  {m[0].toUpperCase() + m.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={logEntry}
            disabled={logging}
            style={[styles.logBtn, logging && { opacity: 0.6 }]}
          >
            <Text style={styles.logBtnText}>{logging ? "Logging…" : "Log entry"}</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(null)} style={{ alignSelf: "center", padding: 12 }}>
            <Text style={{ color: "#999" }}>Pick a different food</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {isLoading && debouncedQ && (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <FlatList
            data={data?.results ?? []}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => setSelected(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  {item.brand && <Text style={styles.resultBrand}>{item.brand}</Text>}
                </View>
                <Text style={styles.resultKcal}>{Math.round(item.kcalPer100g)} kcal/100g</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              debouncedQ.length >= 2 && !isLoading ? (
                <Text style={styles.empty}>No matches in Open Food Facts</Text>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 16 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  input: { flex: 1, color: "#fff", paddingVertical: 12, fontSize: 16 },
  resultRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, borderRadius: 10 },
  resultName: { color: "#fff", fontSize: 15 },
  resultBrand: { color: "#777", fontSize: 12, marginTop: 2 },
  resultKcal: { color: "#999", fontSize: 13 },
  empty: { color: "#666", padding: 16 },
  confirmCard: { backgroundColor: "#1a1a1a", padding: 16, borderRadius: 12, marginTop: 12, gap: 8 },
  confirmName: { color: "#fff", fontSize: 18, fontWeight: "700" },
  confirmBrand: { color: "#999", fontSize: 14 },
  confirmKcal: { color: "#999", fontSize: 13, marginBottom: 8 },
  label: { color: "#999", fontSize: 12, marginTop: 12, fontWeight: "600" },
  qtyInput: { backgroundColor: "#252525", color: "#fff", padding: 12, borderRadius: 8, fontSize: 16 },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealPill: { backgroundColor: "#252525", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  mealPillActive: { backgroundColor: "#3b82f6" },
  mealPillText: { color: "#999", fontSize: 14 },
  mealPillTextActive: { color: "#fff", fontWeight: "600" },
  logBtn: { backgroundColor: "#3b82f6", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 16 },
  logBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#f88", marginTop: 8 },
});
```

**Step C — Create `packages/mobile-app/app/food-barcode.tsx`:**

```tsx
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import BarcodeScanner from "../components/BarcodeScanner";
import { apiFetch } from "../lib/api";

type Lookup =
  | { status: "scanning" }
  | { status: "loading"; ean: string }
  | { status: "found"; ean: string; item: any }
  | { status: "notfound"; ean: string }
  | { status: "error"; ean: string; message: string };

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export default function FoodBarcodeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [state, setState] = useState<Lookup>({ status: "scanning" });
  const [mealType, setMealType] = useState<MealType>("snack");
  const [logging, setLogging] = useState(false);

  async function onEan(ean: string) {
    setState({ status: "loading", ean });
    try {
      const res = await apiFetch(`/api/m/foods/barcode/${encodeURIComponent(ean)}`);
      if (res?.found) {
        setState({ status: "found", ean, item: res.item });
      } else {
        setState({ status: "notfound", ean });
      }
    } catch (e: any) {
      setState({ status: "error", ean, message: String(e?.message ?? e) });
    }
  }

  async function logEntry() {
    if (state.status !== "found") return;
    setLogging(true);
    try {
      await apiFetch("/api/m/food-entries", {
        method: "POST",
        body: JSON.stringify({
          foodItem: {
            id: state.item.id,
            name: state.item.name,
            brand: state.item.brand,
            barcode: state.ean,
            kcalPer100g: state.item.kcalPer100g,
            proteinPer100g: state.item.proteinPer100g,
            carbsPer100g: state.item.carbsPer100g,
            fatPer100g: state.item.fatPer100g,
            source: "openfoodfacts",
          },
          quantityG: 100, // demo default; CAL-04 lets user adjust in P2
          mealType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["food-entries"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } finally {
      setLogging(false);
    }
  }

  if (state.status === "scanning") {
    return <BarcodeScanner onScanned={onEan} />;
  }

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.copy}>Looking up {state.ean}…</Text>
      </View>
    );
  }

  if (state.status === "notfound" || state.status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>
          {state.status === "notfound"
            ? "Couldn't find that barcode in Open Food Facts."
            : `Error: ${state.message}`}
        </Text>
        <Text style={styles.sub}>Try a different product or search by name.</Text>
        <Pressable
          style={styles.btn}
          onPress={() => setState({ status: "scanning" })}
        >
          <Text style={styles.btnText}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  // state.status === "found"
  const item = state.item;
  const hasNutrition = (item.kcalPer100g ?? 0) > 0;
  return (
    <View style={styles.foundContainer}>
      <Text style={styles.foundName}>{item.name}</Text>
      {item.brand && <Text style={styles.foundBrand}>{item.brand}</Text>}
      {hasNutrition ? (
        <Text style={styles.foundKcal}>{Math.round(item.kcalPer100g)} kcal / 100g</Text>
      ) : (
        <Text style={styles.warn}>
          Open Food Facts has this product but no nutrition values — logging will record 0 kcal.
        </Text>
      )}

      <Text style={styles.label}>Meal</Text>
      <View style={styles.mealRow}>
        {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.mealPill, mealType === m && styles.mealPillActive]}
            onPress={() => setMealType(m)}
          >
            <Text style={[styles.mealPillText, mealType === m && styles.mealPillTextActive]}>
              {m[0].toUpperCase() + m.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={logEntry} disabled={logging} style={[styles.btn, logging && { opacity: 0.6 }]}>
        <Text style={styles.btnText}>{logging ? "Logging…" : "Log 100g"}</Text>
      </Pressable>
      <Pressable onPress={() => setState({ status: "scanning" })} style={{ alignSelf: "center", padding: 12 }}>
        <Text style={{ color: "#999" }}>Scan a different barcode</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  copy: { color: "#fff", textAlign: "center", fontSize: 16 },
  sub: { color: "#999", textAlign: "center" },
  btn: { backgroundColor: "#3b82f6", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  foundContainer: { flex: 1, backgroundColor: "#111", padding: 24, gap: 12 },
  foundName: { color: "#fff", fontSize: 24, fontWeight: "700" },
  foundBrand: { color: "#999", fontSize: 16 },
  foundKcal: { color: "#999", fontSize: 14 },
  warn: { color: "#fbbf24", fontSize: 13 },
  label: { color: "#999", fontSize: 12, marginTop: 12, fontWeight: "600" },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealPill: { backgroundColor: "#252525", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  mealPillActive: { backgroundColor: "#3b82f6" },
  mealPillText: { color: "#999", fontSize: 14 },
  mealPillTextActive: { color: "#fff", fontWeight: "600" },
});
```

Run `npx prettier --write packages/mobile-app/app/food-add.tsx packages/mobile-app/app/food-barcode.tsx packages/mobile-app/app/_layout.tsx`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const c=[['packages/mobile-app/app/food-add.tsx','/api/m/foods/search'],['packages/mobile-app/app/food-add.tsx','/api/m/food-entries'],['packages/mobile-app/app/food-add.tsx','invalidateQueries'],['packages/mobile-app/app/food-barcode.tsx','BarcodeScanner'],['packages/mobile-app/app/food-barcode.tsx','/api/m/foods/barcode/'],['packages/mobile-app/app/food-barcode.tsx','/api/m/food-entries'],['packages/mobile-app/app/_layout.tsx','name=\"food-add\"'],['packages/mobile-app/app/_layout.tsx','name=\"food-barcode\"']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}"</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/mobile-app/app/food-add.tsx` exists with >= 120 lines
    - `grep -c '/api/m/foods/search' packages/mobile-app/app/food-add.tsx` returns 1
    - `grep -c '/api/m/food-entries' packages/mobile-app/app/food-add.tsx` returns 1
    - `grep -c 'invalidateQueries' packages/mobile-app/app/food-add.tsx` returns at least 2 (food-entries + profile)
    - File `packages/mobile-app/app/food-barcode.tsx` exists with >= 80 lines
    - `grep -c 'BarcodeScanner' packages/mobile-app/app/food-barcode.tsx` returns at least 2 (import + render)
    - `grep -c '/api/m/foods/barcode/' packages/mobile-app/app/food-barcode.tsx` returns 1
    - `grep -c "notfound" packages/mobile-app/app/food-barcode.tsx` returns at least 1 (state branch)
    - `grep -c 'name="food-add"' packages/mobile-app/app/_layout.tsx` returns 1
    - `grep -c 'name="food-barcode"' packages/mobile-app/app/_layout.tsx` returns 1
    - Manual smoke (need real device): tap "+ Add" on Food tab → modal opens → tap "Search" → type "banana" → see OFF results → tap → pick meal → "Log entry" → return to Food tab → today's totals increment
    - Manual smoke (real device): tap "+ Add" → "Scan barcode" → grant permission → point at a packaged food barcode → OFF lookup → meal pick → "Log 100g" → return to Food tab → entry visible
  </acceptance_criteria>
  <done>Search flow logs a manual-quantity entry; barcode flow logs a 100g entry (CAL-04 will let users adjust); both invalidate the food-entries + profile caches so the Food tab and Home tab refresh on return</done>
</task>

</tasks>

<verification>
**Automated:**

```bash
node -e "const fs=require('fs');const c=[['templates/mail/app/routes/api.m.foods.search.tsx','openfoodfacts.org/cgi/search'],['templates/mail/app/routes/api.m.foods.barcode.$ean.tsx','api/v2/product'],['templates/mail/app/routes/api.m.food-entries.tsx','db.insert(schema.foodEntries)'],['packages/mobile-app/components/BarcodeScanner.tsx','barcodeScannerSettings'],['packages/mobile-app/app/(tabs)/food.tsx','Snacks'],['packages/mobile-app/app/food-add.tsx','/api/m/foods/search'],['packages/mobile-app/app/food-barcode.tsx','BarcodeScanner']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

pnpm --filter mail exec tsc --noEmit
pnpm --filter @agent-native/mobile-app exec tsc --noEmit
```

**Manual smoke test:**
1. Food tab → see 4 meal sections (empty initially) + "+ Add" FAB
2. Tap "+ Add" → modal shows "Search" + "Scan barcode" buttons
3. Tap "Search" → type "banana" → wait ~350ms → results appear → tap one → meal picker shows → set quantity → "Log entry" → back on Food tab with the entry under chosen meal type + totals incremented
4. Tap "+ Add" → "Scan barcode" → camera permission flow → scan a real barcode → see the product + meal picker → "Log 100g" → entry appears on Food tab
5. Home tab → kcal ring shows updated total
6. CAL-02 critical: scan a barcode for a product OFF doesn't have → see the "Couldn't find" branch (NOT a stuck screen)
</verification>

<success_criteria>
- [ ] 3 server endpoints serve OFF search, OFF barcode, food entries CRUD
- [ ] BarcodeScanner handles loading / denied / granted states cleanly
- [ ] Food tab today totals correct, meal sections show entries
- [ ] Search screen: debounced input, OFF results, meal-pick, optimistic log via cache invalidation
- [ ] Barcode screen: 5-state machine (scanning / loading / found / notfound / error)
- [ ] Both food flows invalidate food-entries + profile caches so Home/Food update on return
- [ ] No `react-native-svg` introduced (KcalRing from D2-04 stays SVG-free; this plan does not need SVG either)
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-05-food-calorie-counter-SUMMARY.md` documenting:
- Files created/modified (3 server endpoints, 1 component, 3 screens, 1 layout edit)
- Demo limitations: barcode logs at 100g default (CAL-04 adjust in P2), no USDA fallback (CAL-05), no recents/favourites (CAL-07), no foodItems cache (CAL-09), no ODbL UI attribution (CAL-11 — UA is set but in-UI badge deferred)
- Pitfall #7 handling: hasNutritionData flag surfaced; UI shows a warning when kcal=0 instead of silently logging junk
- Smoke test outcome (what barcodes worked; latency of OFF API)
</output>
</content>
</invoke>