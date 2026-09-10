import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  admitReviewShop,
  hasReviewAdmission,
} from "../lib/review-admission.server";
import { reviewConfig } from "../lib/review-policy.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const c = reviewConfig();
  return { enabled: !!c, admitted: await hasReviewAdmission(session.shop) };
}
export async function action({ request }: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  if (
    !process.env.SHOPIFY_APP_URL ||
    request.headers.get("Origin") !==
      new URL(process.env.SHOPIFY_APP_URL).origin
  )
    return data({ error: "Invalid origin" }, { status: 403 });
  const form = await request.formData();
  if (
    form.get("synthetic") !== "yes" ||
    !(await admitReviewShop(
      auth.session.shop,
      String(auth.sessionToken?.sub || ""),
      form.get("code"),
    ))
  )
    return data(
      {
        error:
          "Review access unavailable. Check the code or contact the developer.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  return auth.redirect("/app/agreement");
}
export default function Review() {
  const { enabled, admitted } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main style={{ maxWidth: 640, padding: 24 }}>
      <h1>Restricted app review access</h1>
      <p>
        Only verified development stores with synthetic data can use this review
        session. Access lasts at most 48 hours and ends when the review window
        closes. This does not activate a merchant agreement.
      </p>
      {!enabled ? (
        <p>Review access is currently closed.</p>
      ) : admitted ? (
        <a href="/app/agreement">Continue to the agreement</a>
      ) : (
        <Form method="post" style={{ display: "grid", gap: 16, marginTop: 24 }}>
          <label>
            Review access code
            <input
              name="code"
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                marginTop: 8,
                padding: 10,
              }}
              type="password"
              autoComplete="off"
              required
              maxLength={64}
            />
          </label>
          <label>
            <input type="checkbox" name="synthetic" value="yes" required />
            This development store contains synthetic test data only.
          </label>
          <button type="submit">Continue</button>
        </Form>
      )}
      {result && "error" in result ? <p role="alert">{result.error}</p> : null}
    </main>
  );
}
