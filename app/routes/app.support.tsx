import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Page, Card, BlockStack, Text, Button } from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { email: process.env.APP_SUPPORT_EMAIL || null };
}
export default function Support() {
  const { email } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  return (
    <Page title={zh ? "支持与隐私" : "Support & privacy"}>
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Naruto Analytics
          </Text>
          <Text as="p">
            {zh
              ? "经营简报使用店铺数据和固定规则，不构成收益保证。"
              : "Briefs use store data and review rules. They do not guarantee business outcomes."}
          </Text>
          {email ? (
            <Button url={`mailto:${email}`}>
              {zh ? "联系支持" : "Contact support"}
            </Button>
          ) : (
            <Text as="p">
              {zh
                ? "请通过 Shopify 联系应用开发者。"
                : "Contact the app developer through Shopify."}
            </Text>
          )}
          <Button url="/privacy" external>
            {zh ? "隐私政策" : "Privacy policy"}
          </Button>
          <Button url="/app/agreement">
            {zh ? "数据处理协议" : "Data processing agreement"}
          </Button>
          <Button url="/app/billing">
            {zh ? "管理订阅" : "Manage subscription"}
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
