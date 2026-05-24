// Barrel re-export of the dispatch table. The queue handler in
// apps/worker/src/queues/stripe-event.ts imports from this file so the
// import surface stays stable even if we move dispatch.ts later.
export { reducers } from "./dispatch.js";
export type { ReducerKey } from "./dispatch.js";
