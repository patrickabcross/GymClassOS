import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { useDbSync } from "@agent-native/core";
import { ClientOnly, DefaultSpinner, appPath } from "@agent-native/core/client";
import { getThemeInitScript } from "@agent-native/core/client";
import { appApiPath } from "@/lib/api-path";
import { TAB_ID } from "@/lib/tab-id";
import { markExternalEmailRefresh } from "@/hooks/use-emails";
import { Button } from "@/components/ui/button";
import type { LinksFunction } from "react-router";
import type { Route } from "./+types/root";
import { getSkinConfig, type SkinName } from "./skins/config";
import stylesheet from "./global.css?url";
import { configureTracking } from "@agent-native/core/client";
configureTracking({
  getDefaultProps: (_name, properties) => ({
    ...properties,
    app: "agent-native-mail",
  }),
});

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

const THEME_INIT_SCRIPT_SELECTOR = "script[data-agent-native-theme-init]";

function getHydrationStableThemeInitScript() {
  if (typeof document !== "undefined") {
    const existing = document.querySelector<HTMLScriptElement>(
      THEME_INIT_SCRIPT_SELECTOR,
    );
    if (existing?.innerHTML) return existing.innerHTML;
  }
  return getThemeInitScript();
}

const THEME_INIT_SCRIPT = getHydrationStableThemeInitScript();

export async function loader(_args: Route.LoaderArgs) {
  const skinName = (process.env.GYMOS_STUDIO_SKIN ?? "default") as SkinName;
  const skin = getSkinConfig(skinName);
  // accentHex drives the <meta name="theme-color"> below — keep in sync with
  // the skin's --primary value. This is the ONE place a brand hex lives outside
  // the skin CSS, because a <meta> attribute is not a CSS context (no var()).
  const accentHex =
    skinName === "hustle"
      ? "#7C3AED" // guard:allow-color — theme-color <meta> hex; CSS vars not valid in HTML attribute context
      : "#F97316"; // guard:allow-color — theme-color <meta> hex; CSS vars not valid in HTML attribute context

  // SWEB-07: Admin email allowlist. Comma-separated admin emails surfaced to
  // the client so GymosTopNav can gate admin-only tabs. Non-sensitive: these
  // are role hints, not secrets. When unset/empty, adminOpen=true means
  // "treat everyone as admin" (single-pilot default — mirrors the
  // CUSTOMER_ALLOWED_EMAILS empty-list-passes-everyone pattern in auth.ts).
  const adminEmails = (process.env.GYMOS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const adminOpen = adminEmails.length === 0;

  // Operator allowlist for framework settings access (RunStudio operator only —
  // distinct from GYMOS_ADMIN_EMAILS / studio managers). Comma-separated env;
  // when unset/empty, fall back to the Patrick default so the operator keeps
  // access before the env var is configured on Vercel. NOT "everyone" on empty.
  const operatorEmailsFromEnv = (process.env.RUNSTUDIO_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const operatorEmails =
    operatorEmailsFromEnv.length > 0
      ? operatorEmailsFromEnv
      : ["patrickalexanderross@outlook.com"];

  return {
    skin: { name: skinName, ...skin },
    accentHex,
    adminEmails,
    adminOpen,
    operatorEmails,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const studioName = data?.skin?.name ?? "default";
  const themeColor = data?.accentHex ?? "#F97316"; // guard:allow-color — theme-color <meta> fallback hex; HTML attribute context
  return (
    <html lang="en" suppressHydrationWarning data-studio={studioName}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <script
          data-agent-native-theme-init
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <link rel="icon" type="image/svg+xml" href={appPath("/favicon.svg")} />
        <link rel="manifest" href={appPath("/manifest.json")} />
        <meta name="theme-color" content={themeColor} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Mail" />
        <link rel="apple-touch-icon" href={appPath("/icon-180.svg")} />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          href="/fonts/inter-variable.woff2"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Ensure the app window has focus so keyboard shortcuts work immediately */
function AutoFocus() {
  useEffect(() => {
    window.focus();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") window.focus();
    };
    const handleFocusRestore = () => window.focus();
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("click", handleFocusRestore, true);
    // Restore focus when cursor re-enters the app (e.g. after using the agent chat panel)
    document.documentElement.addEventListener("mouseenter", handleFocusRestore);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("click", handleFocusRestore, true);
      document.documentElement.removeEventListener(
        "mouseenter",
        handleFocusRestore,
      );
    };
  }, []);
  return null;
}

/** Trigger automation processing on window focus and initial load */
function AutomationTrigger() {
  const lastTrigger = useRef(0);
  useEffect(() => {
    const trigger = () => {
      const now = Date.now();
      if (now - lastTrigger.current < 30_000) return;
      lastTrigger.current = now;
      fetch(appApiPath("/api/automations/trigger"), { method: "POST" }).catch(
        () => {},
      );
    };
    // Trigger on load
    trigger();
    // Trigger on window focus
    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return null;
}

/** Invalidate email queries when the window regains focus or visibility */
function VisibilityRefresh() {
  const qc = useQueryClient();
  const lastRefresh = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < 60_000) return;
      lastRefresh.current = now;
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["labels"] });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [qc]);
  return null;
}

function DbSyncSetup() {
  const qc = useQueryClient();

  useDbSync({
    queryClient: qc,
    queryKeys: [],
    // Skip events this tab caused — our mutations already handle cache updates
    ignoreSource: TAB_ID,
    onEvent: (data: {
      source?: string;
      type: string;
      path?: string;
      key?: string;
      requestSource?: string;
    }) => {
      // Ignore events we caused — the mutation's onSettled handles our own updates
      const isOwnEvent = data.requestSource === TAB_ID;
      const invalidateSettingsSurfaces = () => {
        qc.invalidateQueries({ queryKey: ["scheduled-jobs"] });
        qc.invalidateQueries({ queryKey: ["automations"] });
        qc.invalidateQueries({ queryKey: ["gmail-filters"] });
        qc.invalidateQueries({ queryKey: ["apollo-status"] });
        qc.invalidateQueries({ queryKey: ["integration-status"] });
        qc.invalidateQueries({ queryKey: ["integration-data"] });
        qc.invalidateQueries({ queryKey: ["google-status"] });
        qc.invalidateQueries({ queryKey: ["automation-settings"] });
        qc.invalidateQueries({ queryKey: ["framework-triggers-mail"] });
        qc.invalidateQueries({ queryKey: ["agent-engines"] });
      };

      if (data.source === "app-state") {
        if (
          (data.key?.startsWith("compose-") || data.key === "*") &&
          !isOwnEvent
        ) {
          qc.invalidateQueries({
            queryKey: ["compose-drafts"],
            refetchType: "all",
          });
        }
        if (data.key === "refresh-signal" && !isOwnEvent) {
          markExternalEmailRefresh();
          qc.invalidateQueries({ queryKey: ["emails"] });
          qc.invalidateQueries({ queryKey: ["email"] });
          qc.invalidateQueries({ queryKey: ["labels"] });
        }
        if (!isOwnEvent) {
          qc.invalidateQueries({ queryKey: ["navigate-command"] });
        }
      } else if (data.source === "settings") {
        if (!isOwnEvent) {
          qc.invalidateQueries({ queryKey: ["settings"] });
          qc.invalidateQueries({ queryKey: ["aliases"] });
          qc.invalidateQueries({ queryKey: ["labels"] });
          qc.invalidateQueries({ queryKey: ["emails"] });
          qc.invalidateQueries({ queryKey: ["email"] });
          invalidateSettingsSurfaces();
        }
      } else if (data.source === "action") {
        if (!isOwnEvent) {
          qc.invalidateQueries({ queryKey: ["action"] });
          qc.invalidateQueries({ queryKey: ["emails"] });
          qc.invalidateQueries({ queryKey: ["email"] });
          qc.invalidateQueries({ queryKey: ["labels"] });
          invalidateSettingsSurfaces();
        }
      } else if (!isOwnEvent) {
        qc.invalidateQueries({ queryKey: ["action"] });
        qc.invalidateQueries({ queryKey: ["emails"] });
        qc.invalidateQueries({ queryKey: ["email"] });
        qc.invalidateQueries({ queryKey: ["labels"] });
        qc.invalidateQueries({ queryKey: ["settings"] });
        qc.invalidateQueries({ queryKey: ["aliases"] });
        invalidateSettingsSurfaces();
      }
    },
  });
  return null;
}

export default function Root() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <ClientOnly fallback={<DefaultSpinner />}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute={["class", "data-theme"]}
          defaultTheme="light"
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>
            <Toaster richColors position="bottom-left" />
            <AutoFocus />
            <AutomationTrigger />
            <VisibilityRefresh />
            <DbSyncSetup />
            <AppLayout>
              <Outlet />
            </AppLayout>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClientOnly>
  );
}

function routeErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === "string" && error.data.trim()) {
      return error.data;
    }
    if (
      error.data &&
      typeof error.data === "object" &&
      "message" in error.data &&
      typeof error.data.message === "string"
    ) {
      return error.data.message;
    }
    return error.statusText || `Request failed (${error.status})`;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Something went wrong while loading Mail.";
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = routeErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-semibold">Mail could not load this view.</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.back()}
          >
            Back
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
