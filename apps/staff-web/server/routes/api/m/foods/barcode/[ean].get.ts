// GET /api/m/foods/barcode/:ean
// Nitro server route — delegates to the React Router resource route loader.
// The :ean param is extracted from the Nitro router and passed to the loader.
import {
  defineEventHandler,
  setResponseStatus,
  getRouterParam,
} from "h3";
import { loader } from "../../../../../../app/routes/api.m.foods.barcode.$ean.js";

export default defineEventHandler(async (event) => {
  const request = event.req as unknown as Request;
  const ean = getRouterParam(event, "ean") ?? "";
  try {
    const result = await loader({ request, params: { ean }, context: {} } as any);
    if (result instanceof Response) {
      setResponseStatus(event, result.status);
      const text = await result.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return result;
  } catch (err) {
    if (err instanceof Response) {
      setResponseStatus(event, err.status);
      const text = await err.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }
    throw err;
  }
});
