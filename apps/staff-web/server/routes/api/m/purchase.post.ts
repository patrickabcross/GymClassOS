// POST /api/m/purchase
// Nitro server route — delegates to the React Router resource route action.
// Creates a member-scoped Stripe Connect Checkout session.
import { defineEventHandler, setResponseStatus } from "h3";
import { action } from "../../../../app/routes/api.m.purchase.js";

export default defineEventHandler(async (event) => {
  const request = event.req as unknown as Request;
  try {
    const result = await action({ request, params: {}, context: {} } as any);
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
