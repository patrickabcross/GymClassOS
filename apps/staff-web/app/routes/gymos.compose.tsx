// Resource route: hosts the inbox send-text / send-template action on a
// PATH-OWNING URL (/gymos/compose). No default export -> action-only route.
//
// WHY this exists: React Router single-fetch POSTs to an *index* route resolve
// to "/gymos.data?index", which 404s on this Nitro + Vercel build ("Cannot find
// any route matching [POST] /gymos.data?index"). Path-owning routes work fine
// (that's why gymos.forms.$id submits cleanly). So the inbox composer <Form>
// and the TemplatesDialog submit here instead of to the /gymos index route.
//
// The action implementation itself lives in gymos.messages.tsx (optimistic insert
// + best-effort enqueue) and is re-exported so there is a single source of
// truth for the send logic. Updated from gymos._index → gymos.inbox in P3-04,
// then gymos.inbox → gymos.messages in R3-04 (NAME-03 route rename).
export { action } from "./gymos.messages";
