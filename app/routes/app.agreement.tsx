import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { Page, Card, BlockStack, Text, Banner, Button } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DPA_VERSION, DPA_SHA256, AGREEMENT_TEXT } from "../lib/dpa";
import { dpaEnabled, dpaTestEnabled } from "../lib/dpa.server";
import { testAgreementVersion } from "../lib/test-store-policy.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const enabled = dpaEnabled();
  const testMode = await dpaTestEnabled(session.shop);
  const recordVersion = testMode
    ? testAgreementVersion(DPA_VERSION)
    : DPA_VERSION;
  const record =
    enabled || testMode
      ? await db.legalAcceptance.findUnique({
          where: {
            shopDomain_version: {
              shopDomain: session.shop,
              version: recordVersion,
            },
          },
        })
      : null;
  return {
    enabled,
    testMode,
    version: recordVersion,
    hash: DPA_SHA256,
    acceptedAt:
      record && !record.revokedAt && record.documentHash === DPA_SHA256
        ? record.acceptedAt.toISOString()
        : null,
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  const testMode = await dpaTestEnabled(auth.session.shop);
  const recordVersion = testMode
    ? testAgreementVersion(DPA_VERSION)
    : DPA_VERSION;
  if (!dpaEnabled() && !testMode)
    return Response.json(
      { error: "This draft is not open for acceptance." },
      { status: 409 },
    );
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(process.env.SHOPIFY_APP_URL!).origin)
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const form = await request.formData();
  if (form.get("version") !== recordVersion || form.get("hash") !== DPA_SHA256)
    return Response.json(
      { error: "The agreement changed. Reload and review it again." },
      { status: 409 },
    );
  if (testMode && form.get("testOnly") !== "yes")
    return Response.json(
      { error: "Explicit test-only acknowledgement is required." },
      { status: 400 },
    );
  if (form.get("accept") !== "yes")
    return Response.json(
      { error: "Confirm that you are authorized and accept the agreement." },
      { status: 400 },
    );
  const actor = auth.sessionToken?.sub;
  if (!actor)
    return Response.json(
      { error: "A verified Shopify user is required." },
      { status: 403 },
    );
  await db.legalAcceptance.upsert({
    where: {
      shopDomain_version: {
        shopDomain: auth.session.shop,
        version: recordVersion,
      },
    },
    create: {
      shopDomain: auth.session.shop,
      version: recordVersion,
      documentHash: DPA_SHA256,
      actorUserId: String(actor),
    },
    update: {
      documentHash: DPA_SHA256,
      actorUserId: String(actor),
      acceptedAt: new Date(),
      revokedAt: null,
    },
  });
  return auth.redirect(testMode ? "/app/agreement" : "/app");
}
export default function Agreement() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<{ error: string }>();
  const navigation = useNavigation();
  return (
    <Page title="Merchant Agreement and DPA">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p">
              深圳市知策先见智能科技有限公司 · Naruto Analytics · Version{" "}
              {d.version}
            </Text>
            {!d.enabled && (
              <Banner tone="warning">
                This agreement is a draft. Formal acceptance is not enabled.
                Approved development stores may rehearse the form; TEST_ONLY
                records have no contractual effect.
              </Banner>
            )}
            {d.acceptedAt && (
              <Banner tone="success">
                {d.testMode ? "Test-only rehearsal recorded on" : "Accepted on"}{" "}
                {d.acceptedAt}
              </Banner>
            )}
            <Button url="/legal/terms" external>
              Open Merchant Agreement
            </Button>
            <Button url="/legal/dpa" external>
              Open DPA
            </Button>
            <details>
              <summary>Read agreement here</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  overflowWrap: "anywhere",
                }}
              >
                {AGREEMENT_TEXT}
              </pre>
            </details>
            {result?.error && <Banner tone="critical">{result.error}</Banner>}
            {(d.enabled || d.testMode) && !d.acceptedAt && (
              <Form method="post">
                <input type="hidden" name="version" value={d.version} />
                <input type="hidden" name="hash" value={d.hash} />
                {d.testMode && (
                  <label>
                    <input
                      type="checkbox"
                      name="testOnly"
                      value="yes"
                      required
                    />{" "}
                    This is a synthetic-data test only, not formal agreement
                    acceptance.
                  </label>
                )}
                <label>
                  <input type="checkbox" name="accept" value="yes" required />{" "}
                  {d.testMode
                    ? "I have reviewed the draft Merchant Agreement and DPA for this test rehearsal."
                    : "I am authorized to bind this merchant and agree to both the Merchant Agreement and Data Processing Agreement shown above."}
                </label>
                <p>
                  <button type="submit" disabled={navigation.state !== "idle"}>
                    {d.testMode
                      ? "Record test rehearsal"
                      : "Agree and continue"}
                  </button>
                </p>
              </Form>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
