// POST /api/m/admin/check-in
// Nitro server route — delegates to the React Router resource route action.
// Nested one directory deeper than /api/m/* siblings → FIVE `../` to reach app/.
// The action's requireAdmin() throws a Response 401/403 for non-admins;
// the catch branch forwards those as clean HTTP statuses.
import { defineEventHandler, setResponseStatus } from "h3";
import { action } from "../../../../../app/routes/api.m.admin.check-in.js";

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
