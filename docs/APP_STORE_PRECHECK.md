# Shopify pre-submission review — 2026-09-08

Source fetched live: https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements.md

## Summary

- ✅ Likely passing: 27
- ❌ Likely failing: 0 after the local fixes below
- ⚠️ Needs review: 4
- ⏭️ Groups skipped: 10

This is Shopify's selected subset of locally checkable requirements, not App Store approval. Public deployment, privacy/data-access review, listing assets and runtime acceptance are separate gates.

## Requirements that need review

### ⚠️ 1.1.1

SDK session-token authentication is present; Chrome incognito with blocked third-party storage still needs runtime acceptance.

### ⚠️ 1.2.2

Development install, cancellation and free resubscription passed; decline, expiry and frozen states remain unverified.

### ⚠️ 2.3.3

Local embedded post-install return works; the released normal entry still points to Example Domain until public configuration is deployed.

### ⚠️ 3.1.1

Local trusted TLS works; no public production application endpoint has been deployed and verified.

## Fixes completed locally

- 2.3.1: Removed manual shop-domain entry from the landing and fallback login pages. Shopify-initiated authentication still uses the official SDK. Public entry links to Shopify admin; no unpublished App Store listing link is invented.
- 1.1.4: Removed unlabeled fixed revenue/orders and unsupported overall-health statements from the old landing page. It now describes actual seven-day comparisons and opt-in emails.
- Removed Naruto AI naming from navigation/privacy in favor of the registered Naruto Analytics name.
- Docker context now excludes environment secrets, local certificates, .shopify, .vercel and Git metadata. No Docker image was built or published.

## Evaluation ledger

| ID | Status | Evidence |
|---|---|---|
| 1.1.1 | Needs review | SDK session-token authentication is present; Chrome incognito with blocked third-party storage still needs runtime acceptance. |
| 1.1.2 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.3 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.4 | Likely passing | Landing revised; analytics-core uses observed orders and labels cohort metrics. |
| 1.1.6 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.7 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.8 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.9 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.10 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.13 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.14 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.15 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.1.16 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 1.2.1 | Likely passing | billing.server.ts uses Shopify hosted pricing; one public plan; no external app-charge integration. |
| 1.2.2 | Needs review | Development install, cancellation and free resubscription passed; decline, expiry and frozen states remain unverified. |
| 1.2.3 | Likely passing | billing.server.ts uses Shopify hosted pricing; one public plan; no external app-charge integration. |
| 2.2.1 | Likely passing | analytics.server.ts uses authenticated GraphQL Admin queries. |
| 2.2.3 | Likely passing | Official Shopify React Router AppProvider includes the CDN app-bridge.js script; no legacy @shopify/app-bridge dependency. |
| 2.2.4 | Likely passing | analytics.server.ts uses authenticated GraphQL Admin queries. |
| 2.2.6 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 2.2.7 | Likely passing | Reviewed app routes, scopes and dependencies: no checkout/payment/theme/POS/marketplace/lending/promotion/refund or Max modal implementation triggering this prohibition. |
| 2.3.1 | Likely passing | Official SDK auth in app/shopify.server.ts and auth routes; no manual domain input remains. |
| 2.3.2 | Likely passing | Official SDK auth in app/shopify.server.ts and auth routes; no manual domain input remains. |
| 2.3.3 | Needs review | Local embedded post-install return works; the released normal entry still points to Example Domain until public configuration is deployed. |
| 2.3.4 | Likely passing | Official SDK auth in app/shopify.server.ts and auth routes; no manual domain input remains. |
| 3.1.1 | Needs review | Local trusted TLS works; no public production application endpoint has been deployed and verified. |
| 3.2.1 | Likely passing | shopify.app.toml requests only read_orders; these sensitive scopes are absent. |
| 3.2.2 | Likely passing | shopify.app.toml requests only read_orders; these sensitive scopes are absent. |
| 3.2.3 | Likely passing | shopify.app.toml requests only read_orders; these sensitive scopes are absent. |
| 3.2.4 | Likely passing | shopify.app.toml requests only read_orders; these sensitive scopes are absent. |
| 3.2.5 | Likely passing | shopify.app.toml requests only read_orders; these sensitive scopes are absent. |

## Skipped groups

- 5.1 Online store — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.2 Payment — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.3 Payment facilitator — Opt-in was not requested.
- 5.4 Purchase option — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.5 Product sourcing — Opt-in was not requested.
- 5.6 Checkout customization — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.7 Sales channel — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.8 Post purchase — No matching extension type or specialized scopes detected; the app is an embedded order analytics application.
- 5.9 Mobile app builders — Opt-in was not requested.
- 5.10 Donation — Opt-in was not requested.

## Additional release blockers

- Public PostgreSQL staging instance and hosted app not provisioned. Never copy the localhost database URL into deployment settings.
- Vercel paid upgrade remains paused. Official Hobby terms restrict use to noncommercial personal projects; the configured five-minute cron also needs an eligible plan. Do not deploy this paid company app to Hobby as a workaround.
- Privacy policy must name actual production database provider/regions/retention once selected. Protected order-data approval and live public compliance webhook delivery remain pending.
- Actual listing icon, screenshots and reviewer materials remain draft/incomplete.
- One email was delivered using explicitly labeled sample data; in-app authenticated email route and scheduled delivery are not yet end-to-end accepted.

## Resources

- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [Billing](https://shopify.dev/docs/apps/launch/billing)
- [Submission](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Validation of this pass

13 regression tests passed, TypeScript passed, production build passed and git diff --check passed. Chrome inspected the revised public landing page; trusted HTTPS readback verified the fallback login contains the Shopify entry and no manual shop field. No public deployment or additional email was performed.
