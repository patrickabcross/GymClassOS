import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  ssr: true,
  // "initial" loads ALL routes with the initial HTML load (vs "lazy" which discovers
  // routes as the user navigates). Mobile resource routes (/api/m/*) are hit directly
  // by apiFetch() so "initial" is the correct mode — all routes are bundled.
  routeDiscovery: { mode: "initial" },
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
