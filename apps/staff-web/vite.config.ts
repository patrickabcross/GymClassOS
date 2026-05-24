import { reactRouter } from "@react-router/dev/vite";
import { defineConfig as defineAgentNativeConfig } from "@agent-native/core/vite";
import { mergeConfig } from "vite";

const PG_EXTERNALS = [
  "pg",
  "pg-native",
  "pg-cloudflare",
  "pg-protocol",
  "pg-pool",
  "pg-types",
  "pg-boss",
  "pgpass",
];

const baseConfig = defineAgentNativeConfig({
  plugins: [reactRouter()],
  // shiki only runs in AssistantChat's useEffect — keep it out of the
  // CF Pages Functions bundle (25 MiB limit).
  ssrStubs: ["shiki"],
  nitro: {
    externals: {
      // pg + pg-boss stay external (see ssr.external below) so their CJS
      // class hierarchies aren't broken by Vite tree-shaking. Tell Nitro
      // to include them in the traced node_modules so Vercel ships them.
      traceInclude: PG_EXTERNALS,
    },
  },
});

export default mergeConfig(baseConfig, {
  ssr: {
    // pg's CJS class hierarchy (Pool extends Client) doesn't survive Vite's
    // SSR bundling — produces `TypeError: Class extends value #<Object> is
    // not a constructor or null` at module load on Vercel. Keep pg + its
    // family external so Node loads them from node_modules at runtime.
    // Reaches the SSR bundle via app/lib/queue-client.ts → @gymos/queue → pg-boss → pg.
    external: PG_EXTERNALS,
  },
});
