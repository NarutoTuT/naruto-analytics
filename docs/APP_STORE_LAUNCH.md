# Naruto AI — paid launch runbook

Plan: **Daily Brief — USD 19 per month per shop, 7-day trial**.
Status: development-store install, cancellation, free resubscription and local embedded access verified; one sample-template email delivered. Not publicly deployed or submitted. See DEVELOPMENT_TEST.md for chronological evidence and APP_STORE_PRECHECK.md for the latest release blockers.

## Developer registration progress — 2026-09-08

- Created **Naruto Analytics** under **Naruto-Coder** (Dev organization `166531398`, Partner organization `4279762`).
- App dashboard ID: `420574298113`; Client ID: `d68250b2098d95f0b840de5d3814707a`. Local `shopify.app.toml` now matches this new app. Client secret remains hidden; deployment credentials have not been configured.
- Selected and confirmed public App Store distribution. Shopify generated the initial default version; the production app configuration and application code have not been deployed.
- Manage submission redirects to `https://partners.shopify.com/4279762/apps/register`. User confirmed organization registration, operator 深圳市知策先见智能科技有限公司, no other associated developer accounts, and public support email liaoshenyuan1999053@gmail.com. Organization and only-account options are selected in the form. The page has no company-name/email fields at this step; these values are prepared in `.env.example`, not yet saved to the remote company profile or deployment environment.
- After explicit user confirmation of the declaration and one-time USD 19 registration fee, submitted registration once. Shopify returned `apps?success` with "感谢您的注册" and account settings show "已注册". No separate bank settlement verification was performed.
- Saved company name and support email in Partner account settings. User-provided emergency email and phone were entered with the same save. Login/business email was preserved.
- Created the public Shopify App Pricing plan **Daily Brief**, handle `daily-brief`, monthly USD 19, 7-day trial, redirect `/app`, no usage charges. The listing now shows `$19/month, 7-day trial`. The pre-existing private `shopify-test` plan was preserved. Exact subscription item handle and runtime entitlement behavior remain unverified.
- Primary listing language is English. Saved initial listing name, factual introduction/details, three features, support/review/submission emails, Daily Brief display name, subtitle and search term. Listing remains a draft, not submitted. Screenshots, icon, privacy URL, category, data-access review and real installation validation remain outstanding.
- Deployment access restored on 2026-09-08 using an explicitly approved project-scoped token expiring 2026-09-09. Authenticated API lookup confirms the original locally linked `naruto-analytics` project exists. Earlier connector 404/empty-list results did not establish deletion. Six production environment variable keys exist (Shopify credentials/URL/scopes, database, Resend); validate their decrypted values against the new application before reuse. Partner billing identifiers/token and internal endpoint secrets are still missing. No deployment or database migration was performed.
- Vercel billing UI currently shows Hobby. Production commercial use and the five-minute cron require a suitable paid plan; no upgrade has been purchased. React Router now enables the Vercel preset when `VERCEL` is set while preserving the standard local/Docker server entry. Type checking and builds passed locally.
- App: https://dev.shopify.com/dashboard/166531398/apps/420574298113

## Implementation

- Shopify App Pricing hosted plan selection; live Partner API activeSubscription checked on each protected request and before scheduled email. No custom charge creation, no local trial reset or test-mode bypass.
- Compare 7 complete shop-local days with the prior 7 days. Paginate orders and line items. Paid order totals include tax/shipping; exclude test/cancelled/refunded/partially refunded orders. Product totals are gross before discounts, counted once. These are deliberately labeled order-cohort metrics, not Shopify net sales or profit.
- No speculative revenue impact. Review thresholds are explicitly described as rules. New brief queries no longer fetch buyer names/emails or persist raw orders.
- Authenticated compliance webhooks; durable customer data requests and scoped deletion; uninstall disables email and deletes sessions.
- Internal interview/data-request endpoints require a separate secret. Cron fails closed without its secret, respects preferences, checks subscription, claims each shop/day atomically and uses Resend idempotency keys. Provider errors are not recorded as sent.
- Email preferences default to opt-out for new records. Existing preferences remain unchanged. Email content is currently English, disclosed in the UI. App interface supports English and Chinese.
- Public privacy route requires real operator/support environment values. Do not publish before reviewing the policy against actual providers, processing locations, backup retention and business contact details.

## Required Partner Dashboard configuration

1. Verify app identity matches the local Shopify client ID. Confirm public/App Store distribution. Do not change a pre-existing distribution choice blindly.
2. In App Store listing pricing, use **Shopify App Pricing**. Create one public plan: Daily Brief, USD 19 monthly, 7-day free trial, no annual/usage pricing. Confirm the exact billing interval shown by Shopify.
3. Record the real app handle, App GID and subscription **item** handle (not an assumed plan slug). Set the welcome link to the embedded app root. Verify the callback using a development store.
4. Create a Partner API client with Manage apps permission. Configure its organization ID and token server-side. Do not use the Shopify client ID in place of the App GID.
5. Configure a no-charge development-store test. Verify trial, active, rejection, cancellation at cycle end, expiry/frozen state and uninstall/reinstall. Confirm activeSubscription behavior for each state; never infer paid access from a query-string plan_handle.
6. Review protected customer data requirements for order access even though buyer identity fields were removed. Request only necessary access before review.

Required environment: existing Shopify/DB/Resend/cron variables plus SHOPIFY_PARTNER_ORG_ID, SHOPIFY_PARTNER_API_TOKEN, SHOPIFY_APP_GID, SHOPIFY_APP_HANDLE, SHOPIFY_PRICING_ITEM_HANDLE, INTERNAL_ADMIN_SECRET, APP_OPERATOR_NAME, APP_SUPPORT_EMAIL. Use real values in the deployment secret manager, never in Git/chat.

## Database release

Production builds now **do not mutate the database**. `vercel-build` only builds.

There were no migrations in this repository. Added:
- `20260908000000_baseline`: original schema for a new empty database.
- `20260908000100_paid_launch`: additive privacy/delivery tables, event dedupe index and opt-out default.
- `20260908000200_delivery_payload`: frozen scheduled-email payload for safe retry; deploy this migration before the new application code.

For an **existing database**, back it up and compare its actual schema with the original baseline first. If and only if they match, mark the baseline applied with `prisma migrate resolve --applied 20260908000000_baseline`, then apply the additive migration with `prisma migrate deploy`. Never run the baseline CREATE statements against an existing database. Resolve drift before continuing.

For an **empty database**, use `prisma migrate deploy` to apply both migrations. Verify on a staging database first. Generated SQL has not been executed in this task.

The added tables are compatible with the old code; rollback can restore the previous app build without dropping them. Do not reset the production database.

## Deployment and operations

- Run tests, typecheck, build, Shopify app config validation. Deploy a preview with a staging DB, then verify embedded install/auth flows on a development store.
- Cron is every 5 minutes to honor local delivery times. Confirm the Vercel plan supports this frequency and enough execution time; monitor duration, failures and stale delivery claims. A per-store Shopify scan is currently synchronous; large catalogs/high order volume require an observed load test and likely queued processing before accepting those stores.
- Resend uses a verified sender/domain. Test accepted and rejected messages and actual inbox delivery. Email is opt-in, one inbox per shop. Failed/ambiguous deliveries keep the same shop/day idempotency key and are retried within 23 hours of the original record; payload changes can result in idempotency conflicts requiring investigation, never a blind new key.
- Monitor privacy requests every day. `GET /api/privacy-requests` with INTERNAL_ADMIN_SECRET lists pending requests. `GET ...?id=<encoded-id>` exports retained matching legacy customer/order records. Deliver through a verified secure channel; only then `POST {id, delivered:true}` to mark fulfilled. Process within Shopify's deadline; an acknowledgement alone does not fulfill a data request.
- Cron removes aggregates/events after 90 days and delivery/fulfilled-request records after 30 days. Alert on cron failures so retention is enforced. Verify actual infrastructure backup retention and disclose it accurately.
- Existing legacy raw order snapshots are not silently migrated or erased. Inspect and clean historical personal data via an approved production data operation before launch if it is no longer needed.

## Listing draft (verify against accepted product name)

Name: Naruto AI
Subtitle: Daily operating briefs for your store
Description: Review your store's recent paid order performance in a short daily brief. Compare complete weekly periods, see product concentration signals and inspect supporting numbers. Opt in to receive the brief by email at your chosen local time.
Features:
- Compare the latest 7 complete days with the previous 7 days.
- Review clear operating signals and the numbers behind them.
- Receive a daily email in one inbox at your selected time.
- Manage a USD 19 monthly subscription through Shopify, with a 7-day trial subject to Shopify eligibility.

Do not advertise AI chat, predictive revenue gains, profit/attribution tracking or net sales reconciliation. None is implemented. Ensure permission to use the final product name and artwork. Create real screenshots from a development store, a 1200×1200 icon, verified support details and reviewer instructions. Do not submit fixture screenshots as real Shopify integration evidence.

## Reviewer walkthrough draft

Install on an eligible development store → view hosted Shopify plan and approve test subscription → open Daily Brief → expand details → verify displayed period and currency → configure an inbox/timezone → send a test email → change UI language → manage/cancel subscription → verify access according to Shopify live contract → uninstall → verify scheduled email stopped and authenticated privacy webhook deletion works.

## Verification evidence and remaining gates

Completed locally: 13 unit regression tests, TypeScript check, Prisma schema validation, lint (0 errors; existing i18next warning), production build, Admin GraphQL schema validation, browser fixture checks at 1440px and 390px (details expansion/no overflow, billing price/trial, Chinese billing, no page errors).

Browser fixture is not OAuth/API/payment acceptance. Real subscription, DB migration, compliance webhook payload/HMAC handling, email delivery, production cron and reinstall remain unverified.

Shopify CLI config validation reached login and was stopped; not passed. Partner skill validator embeds `partner_2026-04.json.gz` and rejects activeSubscription; official 2026-07 documentation explicitly supports it. Do not claim schema validation passed. Confirm with the real Partner API before deployment.

## Official references checked 2026-09-08

- https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing
- https://shopify.dev/docs/api/partner/latest/active-subscription
- https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- https://shopify.dev/docs/apps/launch/privacy-requirements
