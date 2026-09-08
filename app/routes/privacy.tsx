import { useLoaderData } from "react-router";
export async function loader() {
  const operator = process.env.APP_OPERATOR_NAME,
    email = process.env.APP_SUPPORT_EMAIL;
  if (!operator || !email)
    throw new Response(
      "Privacy information is being prepared. Please contact the app developer through Shopify.",
      { status: 503 },
    );
  return { operator, email };
}
export default function Privacy() {
  const { operator, email } = useLoaderData<typeof loader>();
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 24,
        fontFamily: "system-ui",
        lineHeight: 1.7,
      }}
    >
      <h1>Naruto Analytics privacy policy</h1>
      <p>Last updated: September 8, 2026</p>
      <p>
        {operator} operates Naruto Analytics. Contact:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
      <h2>Information we process</h2>
      <p>
        We process store identity, store contact details, currency and timezone,
        and recent order amounts, product names and quantities to prepare
        operating briefs. We store aggregate snapshots, email preferences and
        basic usage feedback. Shopify session tokens are stored server-side to
        authenticate the app and prepare scheduled briefs.
      </p>
      <p>
        The current brief does not query buyer names, buyer email addresses or
        buyer addresses. Records retained by earlier versions may contain buyer
        details; these are covered by our access and deletion procedures.
      </p>
      <h2>Purpose and providers</h2>
      <p>
        We use this information to deliver the service, manage access to the
        paid plan and understand whether merchants find briefs useful. We do not
        sell personal information. Shopify handles subscriptions. Vercel hosts
        the service, the configured PostgreSQL provider stores application data,
        and Resend delivers email reports. These providers may process data
        outside your country.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Aggregate snapshots and usage events are retained for up to 90 days,
        followed by scheduled deletion. Delivery records, including the report
        and recipient retained for safe retries, and fulfilled data requests are
        removed after 30 days. Store settings and authentication data are
        retained while required for the installation. Uninstalling stops
        scheduled emails and removes authentication sessions. On Shopify&apos;s
        shop deletion request, we delete the store&apos;s retained application
        records. Infrastructure backups may follow the infrastructure
        provider&apos;s separate retention schedule.
      </p>
      <h2>Your choices</h2>
      <p>
        You can disable daily emails in the app, manage your subscription
        through Shopify and uninstall the app. Contact us to request access to
        or deletion of retained data. We verify requests before providing
        information and process Shopify&apos;s customer data requests and
        deletion webhooks. Essential browser storage remembers your selected
        language and a session identifier for usage tracking.
      </p>
      <h2>Changes</h2>
      <p>
        We update this policy when our data practices change. Contact us with
        any questions before using the service.
      </p>
    </main>
  );
}
