# Naruto AI 部署指南

Naruto AI 是面向 Shopify 商家的 AI 每日经营简报 App。它不是分析仪表盘；首页在 10 秒内回答：店铺是否健康、今天最应该处理什么。

## 项目信息

- 仓库：`git@github.com:NarutoTuT/naruto-analytics.git`
- 生产环境：`https://naruto-analytics.vercel.app`
- 技术栈：React Router v7 + Vite + Shopify Polaris + Prisma + PostgreSQL + Resend
- 数据库：Neon PostgreSQL

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `SHOPIFY_API_KEY` | Shopify 应用 API Key |
| `SHOPIFY_API_SECRET` | Shopify 应用 API Secret |
| `SHOPIFY_APP_URL` | App 生产 URL |
| `SCOPES` | Shopify 权限范围 |
| `DATABASE_URL` | Neon PostgreSQL 连接串 |
| `RESEND_API_KEY` | Resend API Key，用于每日邮件 |
| `EMAIL_FROM` | 邮件发送地址，默认 `onboarding@resend.dev` |
| `CRON_SECRET` | 保护每日邮件 Cron 端点的密钥 |

真实值只放在 Vercel 和 Shopify Partner Dashboard，不要提交到 GitHub。示例见 `.env.example`。

## 本地开发

1. `git clone git@github.com:NarutoTuT/naruto-analytics.git`
2. `cd naruto-analytics`
3. `npm install`
4. 复制 `.env.example` 为 `.env` 并填写
5. `npx shopify app dev`

## 部署到 Vercel

1. 推送 `main` 分支；如果 Vercel 已连接 GitHub，会自动部署
2. 手动部署：`npx vercel deploy --prod --yes`
3. 在 Vercel Production 环境设置上面的环境变量
4. 构建命令使用 `npm run vercel-build`（先 `prisma db push`，再构建）

## 每日邮件

- Vercel Cron 配置在 `vercel.json`，每天 07:00 UTC 调用 `/api/cron/daily-brief`
- 该端点要求 `Authorization: Bearer $CRON_SECRET`；未配置 `CRON_SECRET` 时不会强制校验，启用真实 Cron 前必须配置
- Resend 域名验证后，把 `EMAIL_FROM` 改为自己的已验证域名
- `lastDailyAt` 防止同一天重复发送

## 验证数据

- 事件：`app_open`、`view_details`、`feedback`、`email_click`
- 面试候选接口：`/api/interview-queue`
- 当前阶段是 10 商家验证冲刺，优先观察回访、邮件打开率、反馈和访谈

## 常见问题

- GraphQL 语法错误：已通过移除 `#graphql` 标签和 `totalCount` 字段修复，并使用 2026-04 API 版本
- 侧边栏 404：当前只保留 `Today (/app)` 导航
- 页面空白：检查 `SHOPIFY_API_KEY`、`SHOPIFY_API_SECRET`、`SHOPIFY_APP_URL`、`SCOPES` 和 OAuth 回调配置

## 安全

- 不提交 `.env`、私钥、证书
- `CRON_SECRET` 不写入前端
- 所有真实凭证只存 Vercel 和 Shopify Partner Dashboard
