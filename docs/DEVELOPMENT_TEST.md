# Development-store acceptance

## Target verified 2026-09-08

- Organization: 深圳市知策先见智能科技有限公司 (`166531398`).
- App: Naruto Analytics, client ID `d68250b2098d95f0b840de5d3814707a`.
- Existing development store: Naruto-dev (`naruto-dev-ts8dqzla.myshopify.com`).
- Vercel Pro upgrade is paused. No production deployment or paid hosting purchase is part of this test session.
- Run Shopify CLI locally with its development tunnel; the computer and CLI must remain running for the temporary URL to work.

## Progress

- 13 regression tests passed.
- Current app client secret is stored in ignored, permission-0600 `.env`; no production environment values were changed.
- Shopify CLI login succeeded; `shopify app config validate --json` returned `valid: true` with no issues. Development preview startup targets Naruto-dev; installation acceptance is pending.
- Isolated Prisma local PostgreSQL-compatible instance `naruto-analytics-test` is running on loopback port 51314. Both migrations applied successfully to this empty test database. No production database migration has run.
- Local app at `http://localhost:3015`: privacy page returned 200 with the configured company name; unauthenticated cron and privacy-request endpoints returned 401. This is HTTP verification, not embedded installation acceptance.
- macOS file watching initially reported EMFILE. Local testing uses `CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=1000` to avoid the watcher limit without changing production configuration.

## Acceptance gates

1. Complete CLI authentication and `shopify app config validate --json`.
2. Start the isolated local database; apply both migrations only to that empty test database.
3. Run `shopify app dev --store naruto-dev-ts8dqzla.myshopify.com`.
4. Confirm install target and permissions, then verify embedded authentication and session persistence.
5. Configure the real Partner API entitlement credentials and exact app/item identifiers. Use a Shopify-supported no-charge development subscription; do not infer entitlement from URL parameters or disable server checks.
6. Verify the hosted pricing page and return path, active/trial/declined/cancelled states, analytics, and uninstall.
7. Trigger email tests manually only with a verified sender and explicitly selected recipient. No production cron is enabled by this workflow.

The current automated tests and builds are local evidence, not proof of real OAuth, billing, email delivery, or App Store acceptance.

## Installation attempt after CLI authorization

- CLI login and config validation succeeded. Development preview was prepared for Naruto-dev with the correct app client ID. Shopify Admin showed the Naruto Analytics embedded container (observed handle `naruto-analytics-2`), but application content did not load. This does not establish completed OAuth or subscription acceptance.
- The generated trycloudflare HTTPS hostname failed TLS connections through both direct and local-proxy requests; the local CLI proxy privacy route returned 200. The tunnel preview process was stopped.
- Local PGlite compatibility required `pgbouncer=true` and `connection_limit=1` in the local-only database URL. Session/shop count queries now succeed; both counts were zero before installation.
- Switching to official localhost mode required mkcert certificates. The official v1.4.4 macOS arm64 binary and license were downloaded to ignored `.shopify`; localhost startup is being verified. No production URL/config release or paid subscription was performed.

## Localhost acceptance after certificate setup

- User completed mkcert installation. Certificate/key exist; Chrome loaded `https://localhost:3458/privacy` successfully.
- Default config localhost preview failed because Shopify rejects localhost webhook delivery URIs. Added `shopify.app.local.toml` solely for local preview, without webhook subscriptions; never release this config. Production `shopify.app.toml` retains all webhook subscriptions.
- `shopify app dev --config local --store naruto-dev-ts8dqzla.myshopify.com --use-localhost` reached Ready. Activating the Chrome admin tab loaded the embedded application navigation.
- The authenticated app reports `Subscription verification is temporarily unavailable`, as expected while Partner billing credentials/identifiers are not configured. This is not successful subscription acceptance.
- Next: configure actual Partner entitlement access and verify no-charge development subscriptions. Webhooks require a reachable public HTTPS test endpoint and remain untested.

## Live development subscription acceptance — 2026-09-08

- User explicitly approved creating `Naruto Analytics subscription verification` Partner API client. Created with Manage apps only; financial, subscription-management and theme permissions remain off. Token stored only in private ignored local `.env`.
- Partner app lookup confirmed `gid://partners/App/420574298113` matches the expected client ID. ActiveSubscription accepts `gid://shopify/App/420574298113`; do not confuse these two API ID namespaces.
- Before selection, live Partner API returned activeSubscription null. Hosted plan page explicitly showed Daily Brief $19/30 days, effective development price $0/30 days and 7-day trial. Approval page explicitly stated no charge. Approved the free test subscription.
- After approval, live API returned EVERY_30_DAYS, trialEndsAt 2026-09-15T13:47:58Z, item handle daily-brief, cancelAtEndOfCycle false. Saved verified app/item identifiers locally.
- Corrected entitlement logic: price.active identifies whether a catalog price is current, not contract validity. The live development contract returned price.active false. Access now requires the matching item on the authoritative activeSubscription response; missing contracts, wrong items and API errors remain denied. Regression coverage includes non-current price and empty items.
- Chrome embedded Daily Brief page loaded successfully after subscription verification. This establishes the positive install/auth/subscription/access path, not cancellation/expiry/uninstall/webhook/email acceptance. 13 tests, typecheck and build passed.
- Production configuration and Vercel upgrade remain untouched; no real charge was approved.

- Navigation regression found during acceptance: default Polaris anchor navigation dropped embedded auth context. Added a React Router link adapter for internal Polaris links. Chrome verified Daily Brief → Subscription stays authenticated and displays `Subscription active`; external links retain normal anchor behavior. Typecheck and build passed after this fix.

## Callback and email follow-up

- `node scripts/test-webhooks-local.mjs` passed with isolated synthetic fixtures on the loopback database and trusted localhost TLS. Covered invalid HMAC rejection, duplicate customer data request deduplication, customer privacy-request deletion, uninstall session cleanup/email opt-out, repeated shop deletion; fixtures cleaned afterward. This is local signed-request verification, not Shopify public delivery acceptance.
- Real development uninstall was blocked by automatic approval review pending explicit authorization; the test subscription remains installed and active.
- User authorized one real test email to the confirmed support inbox. No email has been sent. Existing Vercel environment metadata did not return the Resend key value, so no secret was imported. Resend is logged in; a new sending-only key form is prepared for whaleleap.studio but has not been submitted. Explicit credential creation approval is pending.

## Authorized uninstall and email result — 2026-09-08

- Explicit follow-up approval authorized development-store uninstall/reinstall and a whaleleap.studio sending-only Resend key. Shopify Admin confirmed Naruto Analytics was successfully uninstalled only from Naruto-dev. Live Partner response changed cancelAtEndOfCycle to true; the active trial contract remained returned. This establishes scheduled cancellation, not immediate contract expiry.
- Reinstallation is pending Cloudflare human verification at the Shopify developer-dashboard install redirect. User was asked to complete the human verification. The development store currently remains uninstalled.
- Created the approved domain-restricted Sending access key and saved it only to private ignored .env (0600). Resend Domains displayed whaleleap.studio as Verified. EMAIL_FROM is Naruto Analytics <notifications@whaleleap.studio>. No Vercel production environment changes were made.
- Sent exactly one explicitly authorized email to liaoshenyuan1999053@gmail.com using the application's sendDailyBrief function and template, with empty synthetic analytics clearly labeled TEST / sample data / 测试样例. Used a fixed idempotency key and a private attempt receipt to avoid duplicate sends. Resend accepted it and its dashboard reported Delivered, email ID 7b0540c6-8532-45df-a404-ce243a369ecc.
- This verifies template rendering and actual transport/delivery, not the authenticated in-app Send test email route, real-store analytics content, or scheduled delivery. Links point to the local test app and are not publicly reachable. No second email is authorized by this one-email approval.
- Reinstall/subscription restoration, public webhook delivery, public deployment and App Store submission remain outstanding. Vercel paid upgrade remains paused.

- Follow-up: human verification completed; developer install redirect reached the Naruto-dev installation grant page for Naruto Analytics by the confirmed company. Automatic approval review rejected the Install click, requiring explicit approval of the displayed data access. Expanded permission details list store-owner name, email address, phone number and physical address under staff/collaborator data. No installation click succeeded; awaiting this specific approval.

## Reinstall restored after explicit data-access approval

- User explicitly approved store-owner name, email, phone and physical-address access. Naruto Analytics was reinstalled on Naruto-dev successfully.
- The normal app initially displayed the existing Example Domain placeholder. Restarted only the localhost development preview using shopify.app.local.toml; CLI reached Ready with read_orders auto-granted. Production release was not changed.
- Hosted pricing showed the previous subscription expiring September 15, then Daily Brief free testing ($0/30 days). The approval page explicitly stated no charge. Approved the free test plan.
- Live Partner response after approval: EVERY_30_DAYS, cancelAtEndOfCycle false, trialEndsAt 2026-09-15T14:17:35Z, item daily-brief. A transient Partner 500 occurred before approval; it was not treated as no subscription.
- Chrome confirmed the embedded Daily Brief restored, with September 1–7 America/New_York reporting period and Connected development preview. Daily email remains disabled; no additional test email was sent.
- Installation, scheduled cancellation and free resubscription are verified in the development store. Production hosting/public webhooks/App Store submission remain outstanding.

## Mail flow hardening

- Test-email requests now require the UI email to match a saved preference; no fallback to the store contact. The UI disables sending for an unsaved recipient. Server-side validation protects direct calls as well.
- A durable BriefDelivery test namespace allows at most one attempt per shop per fixed five-minute UTC window (two adjacent windows can meet at a boundary; this is not a rolling five-minute limit). Unique DB claims block concurrent processes, and the provider receives a stable idempotency key. Uncertain failures consume the slot and are not automatically resent.
- Daily email links now target the exact shop and app in Shopify admin, with validated identifiers. Preferences links open the same app; these links contain no auth secrets. Browser acceptance from an actual mailbox remains pending.
- Scheduled attempts freeze report/recipient data in BriefDelivery.payloadJson before sending; retries reuse it. Opt-out, recipient changes or lost entitlement prevent sending after analytics retrieval. Payloads follow the existing 30-day delivery retention.
- Added migration 20260908000200_delivery_payload and applied ONLY to the guarded loopback test database. Production must apply this additive migration before the new code serves scheduled requests.
- Automated route tests use mocked authentication, billing, analytics and email services: duplicate clicks, unsaved recipients, provider timeout, one daily send, scheduled time, opt-out, lost subscription and retry payload stability. They do not establish provider/webhook production acceptance. Separate local PostgreSQL concurrency check accepted one of eight claims and rejected seven duplicates; fixtures removed.
- Remaining real acceptance: mailbox links, authenticated real test send, cron scheduler invocation, rejected/expired/frozen Shopify contracts, blocked-storage/incognito flow, public webhooks and app review assets. No real mail sent and no paid hosting purchased in this pass.

- Final validation: 24 tests passed and TypeScript passed; build passed after the main implementation. Local DB uniqueness check passed. Browser navigation initially timed out; retry and foreground activation recovered the embedded page. Confirmed test button disabled with no saved email, enabled after saving the approved support inbox, then disabled on an unsaved edit. Restored the saved inbox text. Daily delivery remains off; no send button was clicked. Mailbox-link and live scheduler acceptance remain pending.
