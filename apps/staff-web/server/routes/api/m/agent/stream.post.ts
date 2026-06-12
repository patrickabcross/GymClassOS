// POST /api/m/agent/stream
// Nitro server route — delegates to the React Router resource route action.
// This is an SSE endpoint; the action returns a streaming Response.
// Nitro's sendWebResponse propagates the streaming body to the client.
import { defineEventHandler, sendWebResponse } from "h3";
import { action } from "../../../../../app/routes/api.m.agent.stream.js";

export default defineEventHandler(async (event) => {
  const request = event.req as unknown as Request;
  try {
    const result = await action({ request, params: {}, context: {} } as any);
    if (result instanceof Response) {
      // Delegate the full Response (including SSE stream) to Nitro's web response handler.
      return sendWebResponse(result);
    }
    return result;
  } catch (err) {
    if (err instanceof Response) {
      return sendWebResponse(err);
    }
    throw err;
  }
});
