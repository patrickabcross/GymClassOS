// GET /api/m/whoami
// Nitro server route — delegates to the React Router resource route loader.
//
// Why this exists: the Nitro SSR handler explicitly blocks paths starting with
// /api/ (it returns 404 immediately) because it assumes /api/* are handled by
// dedicated Nitro server routes. Our /api/m/* endpoints are React Router
// resource routes, so they need to be wrapped in real Nitro H3 handlers.
import { defineEventHandler, setResponseStatus } from "h3";
import { loader } from "../../../../app/routes/api.m.whoami.js";

export default defineEventHandler(async (event) => {
  const request = event.req as unknown as Request;
  try {
    const result = await loader({ request, params: {}, context: {} } as any);
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
