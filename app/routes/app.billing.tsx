import type { HeadersFunction } from "react-router";
import {
  Form,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Card, BlockStack, Text, Button, Banner } from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/analytics.server";
import { getSubscription, pricingUrl } from "../lib/billing.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const shop = await ensureShop(admin);
  return getSubscription(shop.id);
}
export async function action({ request }: ActionFunctionArgs) {
  const { session, redirect } = await authenticate.admin(request);
  return redirect(pricingUrl(session.shop), { target: "_top" });
}
export default function Billing() {
  const { active, contract } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const { i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  return (
    <Page title={zh ? "订阅" : "Subscription"}>
      <Card>
        <BlockStack gap="400">
          <Text as="h1" variant="headingLg">
            Daily Brief
          </Text>
          <Text as="p" variant="headingXl">
            $19 USD / {zh ? "月 / 店铺" : "month / store"}
          </Text>
          <Text as="p">
            {zh
              ? "7 天免费试用。试用资格、收费日期及取消方式以 Shopify 确认页为准。"
              : "7-day free trial. Shopify confirms trial eligibility, billing dates and cancellation terms."}
          </Text>
          <Text as="p">
            {zh
              ? "包含经营简报、重点事项、支撑数据，以及发送到一个邮箱的每日邮件。"
              : "Includes operating briefs, priority signals, supporting data and a daily email to one inbox."}
          </Text>
          {active && (
            <Banner tone="success">
              <p>
                {zh ? "订阅有效" : "Subscription active"}
                {contract?.cancelAtEndOfCycle
                  ? zh
                    ? "，已安排在当前周期结束时取消。"
                    : ". Cancellation is scheduled at the end of the current cycle."
                  : ""}
              </p>
            </Banner>
          )}
          <Form method="post">
            <Button submit variant="primary" loading={nav.state !== "idle"}>
              {active
                ? zh
                  ? "在 Shopify 管理订阅"
                  : "Manage in Shopify"
                : zh
                  ? "在 Shopify 查看并选择套餐"
                  : "Choose your plan in Shopify"}
            </Button>
          </Form>
          {active && (
            <Button url="/app">
              {zh ? "打开经营简报" : "Open daily brief"}
            </Button>
          )}
          <Text as="p" tone="subdued">
            {zh
              ? "由 Shopify 处理订阅。无需向本应用提供信用卡。"
              : "Subscriptions are handled by Shopify. No credit card details are collected by this app."}
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
