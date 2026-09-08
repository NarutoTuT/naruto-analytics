import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return null;
};

export default function App() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.headline}>Naruto Analytics</h1>
        <p className={styles.subtext}>
          Compare your last 7 complete days of paid orders with the previous
          7 days. Review order value, product concentration and the numbers
          behind each operating signal.
        </p>
        <div className={styles.ctaSection}>
          <h2>Open from Shopify</h2>
          <p>In your Shopify admin, open Apps and select Naruto Analytics.</p>
          <a className={styles.button} href="https://admin.shopify.com/">
            Open Shopify admin
          </a>
          <p className={styles.trustLine}>
            Daily Brief: $19 USD every 30 days. A 7-day trial is available
            subject to Shopify eligibility. Daily emails require opt-in.
          </p>
          <a href="/privacy">Privacy policy</a>
        </div>
      </div>
    </main>
  );
}
