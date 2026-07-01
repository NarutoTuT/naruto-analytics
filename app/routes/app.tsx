import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import enTranslations from "@shopify/polaris/locales/en.json";
import { AppProvider as PolarisAppProvider, Frame, Navigation, TopBar, Layout, Page, Card, Text, BlockStack } from "@shopify/polaris";
import { HomeIcon, ProductIcon, OrderIcon, SettingsIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  const navItems = [
    { label: "Dashboard", icon: HomeIcon, url: "/app" },
    { label: "Products", icon: ProductIcon, url: "/app/products" },
    { label: "Orders", icon: OrderIcon, url: "/app/orders" },
    { label: "Settings", icon: SettingsIcon, url: "/app/settings" },
  ];

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <Frame
          navigation={
            <Navigation location="/app">
              <Navigation.Section
                title="Naruto AI"
                items={navItems}
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
