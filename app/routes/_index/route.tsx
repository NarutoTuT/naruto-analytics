import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function App() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Headline */}
        <h1 className={styles.headline}>
          Your store&#8217;s health<br />
          in one sentence.<br />
          <span className={styles.headlineAccent}>Every morning.</span>
        </h1>
        <p className={styles.subtext}>
          Connect your store. Get a daily summary of revenue, orders, and what needs attention. No setup.
        </p>

        {/* Live Preview Card */}
        <div className={styles.preview}>
          <div className={styles.previewStatus}>
            <span className={styles.greenDot} />
            Good morning. Your store is running smoothly.
          </div>
          <div className={styles.previewMetrics}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Revenue</div>
              <div className={styles.metricValue}>$1,847</div>
              <div className={styles.metricTrendUp}>&#8593;12%</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Orders</div>
              <div className={styles.metricValue}>23</div>
              <div className={styles.metricTrendDown}>&#8595;3%</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Avg Order</div>
              <div className={styles.metricValue}>$80</div>
              <div className={styles.metricTrendUp}>&#8593;5%</div>
            </div>
          </div>
          <div className={styles.previewAction}>
            <div className={styles.previewActionLabel}>Recommended action</div>
            Your AOV is above baseline. Consider testing a $299 free shipping threshold.
          </div>
        </div>

        {/* Three Benefits */}
        <div className={styles.benefits}>
          <div className={styles.benefit}>
            <div className={styles.benefitIcon}>&#x1F4CA;</div>
            <div className={styles.benefitTitle}>See business status instantly</div>
            <div className={styles.benefitDesc}>Open once. Know revenue, orders, and trends in 5 seconds.</div>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitIcon}>&#x1F514;</div>
            <div className={styles.benefitTitle}>Know what needs attention</div>
            <div className={styles.benefitDesc}>Get one priority issue and one recommended action every day.</div>
          </div>
          <div className={styles.benefit}>
            <div className={styles.benefitIcon}>&#x2709;&#xFE0F;</div>
            <div className={styles.benefitTitle}>Receive it in your inbox</div>
            <div className={styles.benefitDesc}>Opt in for a daily email brief. Read it before you open Shopify.</div>
          </div>
        </div>

        {/* CTA Section */}
        <div className={styles.ctaSection}>
          <Form className={styles.form} method="post" action="/auth/login">
            <input
              className={styles.input}
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              required
            />
            <button className={styles.button} type="submit">
              Connect Shopify &rarr;
            </button>
          </Form>
          <p className={styles.trustLine}>
            Secure via Shopify OAuth &bull; No credit card &bull; Uninstall anytime
          </p>
        </div>

      </div>
    </div>
  );
}
