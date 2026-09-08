import type { LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import enTranslations from "@shopify/polaris/locales/en.json";
import zhCNTranslations from "@shopify/polaris/locales/zh-CN.json";
import {
  AppProvider as PolarisAppProvider,
  Frame,
  Navigation,
} from "@shopify/polaris";
import { HomeIcon, LanguageIcon } from "@shopify/polaris-icons";
import { useTranslation } from "react-i18next";
import { useEffect, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";
import type { ComponentProps } from "react";

type LinkLikeComponentProps = ComponentProps<
  NonNullable<ComponentProps<typeof PolarisAppProvider>["linkComponent"]>
>;

function AppLink({ url, external, ...props }: LinkLikeComponentProps) {
  if (external || /^(?:[a-z]+:|\/\/)/i.test(url)) {
    return <a {...props} href={url} />;
  }
  return <Link {...props} to={url} />;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation();

  const switchLanguage = useCallback(() => {
    const next = i18n.language === "zh-CN" ? "en" : "zh-CN";
    i18n.changeLanguage(next);
    localStorage.setItem("naruto-language", next);
    document.documentElement.lang = next;
  }, [i18n]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n]);

  const polarisTranslations = useMemo(
    () => (i18n.language === "zh-CN" ? zhCNTranslations : enTranslations),
    [i18n.language],
  );

  const langLabel = i18n.language === "zh-CN" ? "English" : "简体中文";

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={polarisTranslations} linkComponent={AppLink}>
        <Frame
          navigation={
            <Navigation location="/app">
              <Navigation.Section
                title="Naruto Analytics"
                items={[
                  { label: t("nav.today"), icon: HomeIcon, url: "/app" },
                  {
                    label: i18n.language === "zh-CN" ? "订阅" : "Subscription",
                    url: "/app/billing",
                  },
                  {
                    label:
                      i18n.language === "zh-CN"
                        ? "支持与隐私"
                        : "Support & privacy",
                    url: "/app/support",
                  },
                ]}
              />
              <Navigation.Section
                separator
                items={[
                  {
                    label: langLabel,
                    icon: LanguageIcon,
                    onClick: switchLanguage,
                  },
                ]}
              />
            </Navigation>
          }
        >
          <Outlet />
        </Frame>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
