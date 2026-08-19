# Naruto AI

Naruto AI is a Shopify embedded app that gives merchants a daily operating brief. It answers three questions every morning: Is my store healthy? What changed? What should I do first?

This is not an analytics dashboard. The home page is a 10-second Daily Decision View: status first, one top priority, one recommended action, with supporting data collapsed behind details.

## Features

- Today Decision View with health status, priority issue, estimated revenue impact, recommended action, and collapsed supporting data
- Daily Email Brief via Resend with daily preferences and test send
- Validation tracking: `app_open`, `view_details`, `feedback`, `email_click`
- Interview queue endpoint for finding merchants worth contacting
- i18n: English default, Simplified Chinese available; manual switch persisted in localStorage
- Shopify Polaris UI

## Stack

- React Router v7 + Vite
- Shopify Polaris v13
- Prisma + PostgreSQL (Neon)
- Resend
- i18next / react-i18next
- Vercel Cron

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values.
3. Run `npx shopify app dev`.

## Environment Variables

`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`, `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`

Never commit real values. Keep production secrets in Vercel and the Shopify Partner Dashboard.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page before OAuth |
| `/app` | Today Decision View (embedded app) |
| `/api/preferences` | Save/load email brief preferences |
| `/api/test-email` | Send a test daily brief |
| `/api/track` | Record validation events |
| `/api/interview-queue` | List interview candidates |
| `/api/cron/daily-brief` | Cron endpoint for daily email sends |

## Deployment

Vercel deployment uses `npm run vercel-build`, which runs `prisma db push` before the app build. The cron job in `vercel.json` calls `/api/cron/daily-brief` daily at 07:00 UTC and should be protected with `CRON_SECRET`.

## Validation Events

- `app_open`: once per session
- `view_details`: when supporting details expand
- `feedback`: thumbs up or thumbs down
- `email_click`: click from the email brief

These events exist only to answer whether merchants are returning, whether the brief is useful, and who should be interviewed.

## Docs

- `AI_DEPLOY_GUIDE.md` - Chinese deployment guide
- `Naruto_AI_Product_Document.docx` - Product document
