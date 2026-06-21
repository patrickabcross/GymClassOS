// /m/checkout-return — mobile-friendly Stripe checkout return page.
//
// Stripe success_url and cancel_url for the member purchase flow land here.
// This is a public SSR page (no staff session required) so members can reach
// it after completing or cancelling a purchase on their phone browser.
//
// ?result=success  — payment completed; encourage member to return to the app.
// ?result=cancelled — payment cancelled; soft message to try again.
//
// P2: Add a pass-balance fetch (with a retry timer) so members can see their
// updated credits without reopening the native app.
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

export const meta: MetaFunction = ({ data }) => {
  const result = (data as { result: string })?.result;
  return [
    {
      title:
        result === "success"
          ? "Payment complete — RunStudio"
          : "Checkout — RunStudio",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const result = url.searchParams.get("result") ?? "unknown";
  return { result };
}

export default function CheckoutReturn() {
  const { result } = useLoaderData<typeof loader>();
  const isSuccess = result === "success";

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#111",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: isSuccess ? "#16a34a" : "#374151",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          marginBottom: 8,
        }}
      >
        {isSuccess ? "✓" : "×"}
      </div>

      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          margin: 0,
          color: isSuccess ? "#fff" : "#9ca3af",
        }}
      >
        {isSuccess ? "Payment complete!" : "Checkout cancelled"}
      </h1>

      <p
        style={{
          fontSize: 16,
          color: "#9ca3af",
          margin: 0,
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        {isSuccess
          ? "Your purchase is being processed. Your pass credits will appear in the app shortly."
          : "No worries — your purchase was not completed. Return to the app to try again."}
      </p>

      <p
        style={{
          fontSize: 14,
          color: "#6b7280",
          marginTop: 8,
        }}
      >
        You can now close this window and return to the RunStudio app.
      </p>
    </div>
  );
}
