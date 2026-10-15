import type { LoaderFunctionArgs } from "react-router";
import { Link, data } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return data(null, { status: 404 });
}

export default function UnknownAppPage() {
  return (
    <main style={{ maxWidth: 640, padding: 24 }}>
      <h1>Page unavailable / 页面暂时无法打开</h1>
      <p>
        This address does not match an available Naruto Analytics page. /
        此地址不对应可用的 Naruto Analytics 页面。
      </p>
      <Link to="/app">Return to Today / 返回 Today</Link>
    </main>
  );
}
