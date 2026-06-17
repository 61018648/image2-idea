# 多用户付费生图平台商业化改造方案

本文档面向当前 `gpt-image-playground` 项目，目标是把现有纯前端个人工具改造成可注册、可付费、可控成本、可运营的多用户生图平台。

## 当前实施进度

更新时间：2026-06-17。

### 已完成

- 已新增独立平台后端骨架，位置为 `server/`，包含账户、余额、账本、套餐、订单、支付回调和平台托管生图接口。
- 已完成平台托管模式前端入口，`src/lib/api.ts` 可按 `platform` 服务商分发到 `/api/platform/images/generations`。
- 已完成平台托管同步生图 MVP：后端校验会话、估算积分、预扣积分、调用上游 OpenAI 兼容图片接口，失败时自动退款。
- 已完成 PostgreSQL/Prisma 持久化账本代码准备，新增 `server/prisma/schema.prisma`、初始 migration、`PrismaBillingStore` 和 `DATABASE_URL` 自动切换逻辑。
- 已保留未安装数据库时的开发模式：未设置 `DATABASE_URL` 时继续使用内存存储或 `PLATFORM_DATA_FILE` JSON 存储。
- 已验证后端测试和构建：`npm test` 通过 2 个测试文件、6 个测试；`npm run build` 通过。
- 已开始实现任务化生图 MVP：新增 `/api/platform/generations` 创建/查询任务接口，当前先用内存任务存储，后台异步执行并复用积分预扣/失败退款流程。
- 已完成前端平台模式的任务化 API 适配：`platform` 服务商会创建平台任务并轮询任务结果，成功后继续复用现有本地任务展示链路。
- 已完成 `generation_jobs` 持久化代码准备：Prisma schema 和 migration 已包含任务表，后端可根据 `DATABASE_URL` 在 Prisma 任务 store 与内存任务 store 间自动切换。
- 已完成本地资产存储接入：后端新增 asset storage 抽象和资产读取路由，平台任务成功结果会保存为 `/api/platform/assets/...` URL，前端会下载该 URL 并复用现有 IndexedDB 展示链路。
- 已完成最小平台余额展示：当前 API 配置为 `platform` 时，Header 会调用 `/api/platform/balance` 并展示积分余额，为后续用户中心和充值入口做准备。
- 已完成平台账单中心 MVP：Header 固定展示“平台版/登录/积分”入口，首页新增商业化状态卡并支持一键启用/创建平台托管配置，入口可打开账单弹窗，展示用户、余额、商业化状态、运营概览、套餐、最近订单、最近平台任务和最近流水；开发态支持创建订单和模拟支付入账，真实登录态已接入 checkout 占位订单契约。
- 已完成真实登录/注册 MVP 代码接入：后端新增 email/password 注册登录、HttpOnly Cookie session 和退出接口；前端新增平台登录/注册弹窗，未登录时 Header 显示登录入口。真实登录需要 `DATABASE_URL` 和 `PLATFORM_SESSION_SECRET`，开发模式仍可无数据库运行。

### 当前限制

- 当前机器尚未安装 PostgreSQL，也未配置 `DATABASE_URL`，因此 Prisma migration 尚未连接真实数据库执行。
- 当前任务化生图已经有内存版 API 骨架、前端轮询适配和 Prisma 持久化代码，但由于本机尚未安装 PostgreSQL，尚未在真实数据库中执行 migration。
- 当前已开始将平台任务结果从 base64/data URL 改为本地 asset URL，但尚未接正式对象存储和 CDN。
- 当前真实注册登录已具备 MVP 代码，但由于本机尚未安装 PostgreSQL，尚未在真实数据库环境执行 migration 和端到端验证；legacy 网关注入 token/user id 仍保留为兼容 fallback。
- 当前支付只具备回调骨架和幂等入账逻辑，尚未接入 Stripe、微信或支付宝真实验签。

### 下一步执行顺序

1. 安装 PostgreSQL 后在 `server/` 下执行 `npm run db:migrate`，把用户、账本、订单和任务数据落到真实数据库。
2. 配置 `PLATFORM_SESSION_SECRET`，在真实数据库环境端到端验证注册、登录、退出、余额、账单中心和平台生图任务链路。
3. 把开发态购买替换为真实支付收银台，并接入 Stripe、微信或支付宝服务端验签。
4. 把本地 asset storage 替换为正式对象存储（S3/R2/OSS/COS）和 CDN。
5. 增加管理后台：用户、订单、任务、额度调整、成本统计和风控。

## 1. 当前项目现状

当前项目适合作为商业化平台的前端基础，但不适合直接收费上线。

### 1.1 技术栈

- 前端框架：Vite + React + TypeScript。
- 状态管理：Zustand。
- 本地数据：IndexedDB。
- 图像接口：OpenAI 兼容接口、Responses API、fal.ai、自定义 HTTP 服务商。
- 部署形态：静态站点、Vercel、Cloudflare Workers、Docker + Nginx。

### 1.2 当前核心链路

现有流程是：

```text
用户输入 prompt
  -> 前端 submitTask 创建本地任务
  -> 前端从 IndexedDB 读取参考图/遮罩图
  -> 浏览器直接调用上游图像 API
  -> 浏览器下载或解析返回图片
  -> 图片 data URL 写入 IndexedDB
  -> 前端本地展示历史记录
```

这个链路适合个人使用，不适合商业运营，原因是：

- API Key 在浏览器侧配置和使用，无法作为平台密钥安全托管。
- 用户可以绕过前端逻辑，无法可靠扣费。
- 历史记录和图片只在用户浏览器本地，不能跨设备、不能后台管理。
- 无服务端任务队列，难以限流、重试、排队、熔断。
- 无支付、订单、余额、套餐、发票、退款、对账能力。
- 无内容审核、风控、用户封禁和审计日志。

## 2. 商业化目标

平台应支持以下能力：

1. 用户注册、登录、找回密码、第三方登录。
2. 购买积分、购买套餐、订阅会员。
3. 每次生图按模型、尺寸、数量、质量、参考图数量计算费用。
4. 后端统一调用模型服务，前端不再暴露平台 API Key。
5. 生成任务排队、执行、失败重试、失败退费。
6. 图片保存到对象存储，历史记录云端同步。
7. 管理员查看用户、订单、任务、成本和异常。
8. 内容安全审核、频率限制、黑名单、敏感词策略。
9. 可统计收入、成本、毛利和模型调用量。

## 3. 推荐总体架构

```text
┌──────────────────────────┐
│         Web 前端          │
│ React / Vite / Zustand    │
└────────────┬─────────────┘
             │ HTTPS / SSE / WebSocket
┌────────────▼─────────────┐
│        平台后端 API       │
│ Auth / Billing / Jobs     │
└──────┬────────────┬──────┘
       │            │
       │            │
┌──────▼──────┐ ┌───▼──────────┐
│ PostgreSQL  │ │ Redis / Queue │
│ 用户/订单/任务 │ │ BullMQ/RQ/SQS │
└──────┬──────┘ └───┬──────────┘
       │            │
       │       ┌────▼──────────┐
       │       │  Worker 生成服务 │
       │       │ OpenAI/fal/自建 │
       │       └────┬──────────┘
       │            │
┌──────▼────────────▼──────┐
│     对象存储 + CDN         │
│ S3 / R2 / OSS / COS       │
└──────────────────────────┘
```

### 3.1 前端职责

前端继续保留现有优秀体验：

- Prompt 输入栏。
- 参数选择。
- 参考图上传。
- 遮罩编辑。
- 任务卡片和瀑布流。
- Agent 对话模式。
- 历史查看、收藏夹、下载。

但要新增或改造：

- 登录/注册页。
- 用户中心。
- 钱包/余额/套餐页。
- 订单列表。
- 云端历史同步。
- 生成任务状态轮询或 SSE。
- API Key 设置页对普通用户隐藏。

### 3.2 后端 API 职责

后端成为平台的可信边界，负责：

- 用户身份认证。
- 权限和套餐校验。
- 额度预扣、确认扣费、失败退费。
- 调用模型服务。
- 保存任务和图片。
- 支付回调处理。
- 管理后台 API。
- 内容审核和风控。

### 3.3 Worker 职责

生成任务不应由 HTTP 请求直接长时间阻塞完成，建议使用队列：

- API 创建任务后快速返回 `jobId`。
- Worker 从队列取任务。
- Worker 调用 OpenAI/fal/custom provider。
- Worker 上传图片到对象存储。
- Worker 更新任务状态。
- 前端通过轮询/SSE/WebSocket 获取状态。

## 4. 后端技术选型建议

### 4.1 快速 MVP 推荐

适合尽快上线验证付费：

- 后端：Next.js API Routes 或 NestJS。
- 数据库：PostgreSQL。
- ORM：Prisma。
- 队列：BullMQ + Redis。
- 存储：Cloudflare R2 或阿里云 OSS。
- 支付：Stripe（海外）/ 微信支付 + 支付宝（国内）。
- 鉴权：NextAuth/Auth.js、Clerk、Supabase Auth，或自建 JWT + Refresh Token。

### 4.2 国内商业化推荐

如果主要面向国内用户：

- 后端：NestJS。
- 数据库：PostgreSQL 或 MySQL。
- 队列：Redis + BullMQ。
- 存储：阿里云 OSS / 腾讯云 COS / Cloudflare R2。
- 支付：微信支付、支付宝。
- 短信：阿里云短信 / 腾讯云短信。
- 部署：Docker Compose 起步，后续 Kubernetes。

### 4.3 海外商业化推荐

如果主要面向海外用户：

- 后端：Next.js + Server Actions/API Routes 或 NestJS。
- 数据库：Supabase/Postgres/Neon。
- 队列：Upstash Redis + BullMQ / Cloudflare Queues。
- 存储：Cloudflare R2 / AWS S3。
- 支付：Stripe。
- 鉴权：Clerk / Auth.js / Supabase Auth。

## 5. 核心数据模型

以下为建议表结构，字段可按实际技术栈调整。

### 5.1 users

```sql
create table users (
  id uuid primary key,
  email text unique,
  phone text unique,
  password_hash text,
  display_name text,
  avatar_url text,
  role text not null default 'user', -- user/admin/support
  status text not null default 'active', -- active/disabled/deleted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.2 plans

```sql
create table plans (
  id uuid primary key,
  name text not null,
  type text not null, -- credit/subscription/enterprise
  price_cents integer not null,
  currency text not null default 'CNY',
  credits integer not null default 0,
  duration_days integer,
  daily_limit integer,
  monthly_limit integer,
  features jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### 5.3 orders

```sql
create table orders (
  id uuid primary key,
  user_id uuid not null references users(id),
  plan_id uuid references plans(id),
  order_no text unique not null,
  provider text not null, -- stripe/wechat/alipay/manual
  amount_cents integer not null,
  currency text not null default 'CNY',
  status text not null default 'pending', -- pending/paid/failed/refunded/closed
  provider_trade_no text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.4 credit_ledger

余额不要只存在 `users.balance` 一个字段，必须有账本，便于追踪、退款、对账。

```sql
create table credit_ledger (
  id uuid primary key,
  user_id uuid not null references users(id),
  type text not null, -- purchase/consume/refund/grant/expire/adjust
  amount integer not null, -- 正数增加，负数扣减
  balance_after integer not null,
  related_order_id uuid references orders(id),
  related_job_id uuid,
  note text,
  created_at timestamptz not null default now()
);
```

### 5.5 user_entitlements

```sql
create table user_entitlements (
  id uuid primary key,
  user_id uuid not null references users(id),
  plan_id uuid references plans(id),
  status text not null default 'active', -- active/expired/cancelled
  credits_granted integer not null default 0,
  started_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 5.6 generation_jobs

```sql
create table generation_jobs (
  id uuid primary key,
  user_id uuid not null references users(id),
  status text not null default 'queued', -- queued/running/succeeded/failed/cancelled
  mode text not null, -- gallery/agent
  provider text not null, -- openai/fal/custom/internal
  model text not null,
  prompt text not null,
  request_params jsonb not null,
  input_asset_ids uuid[] not null default '{}',
  mask_asset_id uuid,
  output_asset_ids uuid[] not null default '{}',
  cost_credits integer not null,
  upstream_cost_cents integer,
  error_message text,
  raw_response jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.7 assets

```sql
create table assets (
  id uuid primary key,
  user_id uuid references users(id),
  kind text not null, -- input/output/mask/thumbnail
  mime_type text not null,
  storage_key text not null,
  url text,
  width integer,
  height integer,
  size_bytes integer,
  sha256 text,
  visibility text not null default 'private', -- private/public/shared
  created_at timestamptz not null default now()
);
```

### 5.8 audit_logs

```sql
create table audit_logs (
  id uuid primary key,
  user_id uuid references users(id),
  action text not null,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

## 6. 积分和套餐设计

### 6.1 推荐计费单位

建议内部统一用 `credit`，每次生成按规则扣除。

示例规则：

| 操作 | 扣费 |
|---|---:|
| 1K 普通文生图 | 1 credit |
| 2K 文生图 | 2 credits |
| 4K 文生图 | 4 credits |
| 图生图/参考图编辑 | 基础费用 + 参考图附加费 |
| 批量 n 张 | 单张费用 × n |
| 高优先级队列 | 额外 +20% |

### 6.2 预扣和退费

生成任务必须采用两阶段扣费：

```text
创建任务
  -> 计算预计费用
  -> 检查余额
  -> 预扣 credit，写入 ledger
  -> 入队生成
  -> 成功：确认任务完成
  -> 失败：写入 refund ledger 退回 credit
```

不要等生成成功后才扣费，否则并发请求会造成余额透支。

### 6.3 套餐建议

MVP 可先做三档：

| 套餐 | 价格 | 内容 |
|---|---:|---|
| 体验包 | 低价 | 少量 credits，不续期 |
| 标准月卡 | 月付 | 每月固定 credits，普通队列 |
| Pro 月卡 | 月付 | 更多 credits，高优先级，支持高清 |

后续可以增加：

- 企业套餐。
- 团队共享余额。
- API 调用额度。
- 邀请返利。
- 每日免费额度。

## 7. 后端 API 设计

### 7.1 认证 API

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/me
PATCH /api/me
```

### 7.2 套餐与支付 API

```http
GET  /api/plans
POST /api/orders
GET  /api/orders
GET  /api/orders/:id
POST /api/payments/wechat/notify
POST /api/payments/alipay/notify
POST /api/payments/stripe/webhook
GET  /api/billing/balance
GET  /api/billing/ledger
```

### 7.3 生成任务 API

```http
POST /api/generations
GET  /api/generations
GET  /api/generations/:id
POST /api/generations/:id/cancel
GET  /api/generations/:id/events
```

`POST /api/generations` 示例：

```json
{
  "mode": "gallery",
  "prompt": "一只赛博朋克风格的猫",
  "params": {
    "size": "1024x1024",
    "quality": "medium",
    "output_format": "png",
    "n": 1
  },
  "inputAssetIds": [],
  "maskAssetId": null
}
```

响应：

```json
{
  "jobId": "job_123",
  "status": "queued",
  "costCredits": 1,
  "balanceAfter": 99
}
```

`GET /api/generations/:id` 示例：

```json
{
  "id": "job_123",
  "status": "succeeded",
  "prompt": "一只赛博朋克风格的猫",
  "params": {},
  "outputs": [
    {
      "id": "asset_123",
      "url": "https://cdn.example.com/users/u1/job_123/0.png",
      "thumbnailUrl": "https://cdn.example.com/users/u1/job_123/0_thumb.webp",
      "width": 1024,
      "height": 1024
    }
  ],
  "createdAt": "2026-06-16T10:00:00Z",
  "finishedAt": "2026-06-16T10:00:15Z"
}
```

### 7.4 素材 API

```http
POST   /api/assets/upload-url
POST   /api/assets/complete
GET    /api/assets/:id
DELETE /api/assets/:id
```

推荐大图和参考图使用预签名上传，避免通过后端中转大文件：

```text
前端请求上传 URL
  -> 前端直传对象存储
  -> 前端通知后端 complete
  -> 后端创建 asset 记录
```

### 7.5 管理后台 API

```http
GET /api/admin/stats
GET /api/admin/users
PATCH /api/admin/users/:id
GET /api/admin/orders
GET /api/admin/generations
GET /api/admin/audit-logs
POST /api/admin/credits/grant
POST /api/admin/credits/adjust
```

## 8. 前端改造点

### 8.1 保留现有 UI 资产

可复用：

- `InputBar`：作为生图输入入口。
- `TaskGrid` / `TaskCard`：作为任务历史展示。
- `DetailModal` / `Lightbox`：作为结果查看。
- `MaskEditorModal`：作为局部编辑能力。
- `AgentWorkspace`：作为高级会员或 Pro 功能。

### 8.2 改造 API 调用入口

当前 `callImageApi()` 是浏览器直连模型服务。商业化后应拆为两层：

```text
旧：callImageApi -> OpenAI/fal/custom provider
新：platformApi.createGeneration -> 后端 /api/generations
```

建议新增：

```text
src/lib/platformApi.ts
src/lib/authApi.ts
src/lib/billingApi.ts
src/lib/assetsApi.ts
```

示例：

```ts
export async function createGeneration(payload: CreateGenerationRequest) {
  return request<CreateGenerationResponse>('/api/generations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
```

### 8.3 改造任务状态

当前 `TaskRecord` 是本地任务。建议扩展字段：

```ts
interface PlatformTaskRecord extends TaskRecord {
  serverJobId?: string
  costCredits?: number
  cloudOutputAssets?: Array<{
    id: string
    url: string
    thumbnailUrl?: string
    width?: number
    height?: number
  }>
}
```

MVP 阶段可以兼容：

- 本地 `TaskRecord.id` 继续作为前端临时 ID。
- `serverJobId` 对应后端任务 ID。
- 图片可同时缓存到 IndexedDB，但权威数据来自后端。

### 8.4 设置页改造

普通商业平台不应让普通用户填写平台 API Key。建议：

- 普通用户隐藏 API 配置页。
- 管理员后台配置模型 provider、base URL、API Key。
- 用户只能选择平台开放的模型、尺寸、质量。
- 原“自定义服务商”功能可保留为管理员功能或私有部署功能。

### 8.5 新增页面

建议新增：

```text
/login
/register
/pricing
/account
/account/billing
/account/orders
/admin
/admin/users
/admin/orders
/admin/generations
/admin/providers
```

如果继续使用 SPA，可通过简单路由状态实现；如果改为 Next.js，可迁移为文件路由。

## 9. 生成服务设计

### 9.1 Worker 处理流程

```text
Worker 获取 queued job
  -> 标记 running
  -> 读取输入 assets
  -> 内容审核 prompt 和输入图
  -> 选择 provider/model
  -> 调用上游 API
  -> 下载/解析输出图片
  -> 内容审核输出图
  -> 上传原图和缩略图到对象存储
  -> 更新 job 为 succeeded
  -> 失败则更新 job 为 failed 并退款
```

### 9.2 成本记录

每次任务要记录：

- 模型。
- 图片数量。
- 分辨率。
- 上游实际成本。
- 平台扣费 credits。
- 毛利估算。
- 错误类型。

这些数据决定后续定价是否健康。

### 9.3 Provider 抽象

后端可以复用当前前端的 provider 思路，但应改成服务端实现：

```ts
interface ImageProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>
  edit(input: EditInput): Promise<GenerateOutput>
}
```

实现：

```text
OpenAIImageProvider
FalImageProvider
CustomHttpProvider
MockProvider
```

## 10. 内容审核与风控

### 10.1 内容审核

至少做三层：

1. Prompt 文本审核。
2. 输入图片审核。
3. 输出图片审核。

策略：

- 明确违规：拒绝生成，不扣费或立即退款。
- 疑似违规：进入人工审核或限制公开分享。
- 输出违规：不展示，退款或部分退款。

### 10.2 防滥用

建议增加：

- IP 限流。
- 用户限流。
- 同时运行任务数限制。
- 新用户每日免费额度限制。
- 邮箱/手机号验证。
- 黑名单 prompt pattern。
- 异常订单/退款风控。

### 10.3 审计日志

记录：

- 登录。
- 支付。
- 生成。
- 退款。
- 管理员改余额。
- 封禁/解封。
- API Key 配置变更。

## 11. 部署方案

### 11.1 MVP Docker Compose

适合早期：

```text
web        前端静态文件 / Next.js
api        后端 API
worker     生成 Worker
postgres   数据库
redis      队列
nginx      反向代理
```

### 11.2 生产建议

- Web/API 多实例部署。
- Worker 独立横向扩容。
- PostgreSQL 托管或主从备份。
- Redis 托管。
- 对象存储开启生命周期清理。
- CDN 加速图片。
- 日志接入 Loki/ELK/云日志。
- 错误监控接入 Sentry。

## 12. 分阶段实施计划

### 阶段 0：产品和合规准备，约 2-4 天

- 确认目标市场：国内/海外。
- 确认支付方式。
- 确认模型供应商授权和商用条款。
- 准备用户协议、隐私政策、退款规则。
- 设计积分价格和成本测算表。

### 阶段 1：MVP 后端，约 1-2 周

- 搭建后端项目。
- 建 users、orders、credit_ledger、generation_jobs、assets 表。
- 实现注册登录。
- 实现余额查询和手动加 credits。
- 实现创建生成任务。
- 实现 Worker 调 OpenAI/fal。
- 实现对象存储上传。
- 实现任务轮询。

阶段目标：不用真实支付，管理员手动发 credits，用户可登录后生成图片。

### 阶段 2：前端接入平台 API，约 1-2 周

- 新增登录/注册 UI。
- 新增用户中心和余额展示。
- 改造 `submitTask` 创建服务端任务。
- 改造任务状态轮询/SSE。
- 改造图片展示为云端 URL + 本地缓存。
- 隐藏普通用户 API Key 设置。

阶段目标：现有 UI 基本保留，但生成走平台后端。

### 阶段 3：支付闭环，约 1 周

- 接入微信/支付宝/Stripe。
- 创建订单。
- 支付回调验签。
- 支付成功写 ledger。
- 用户订单列表。
- 后台订单查询。

阶段目标：用户可自助购买 credits。

### 阶段 4：运营后台和风控，约 1-2 周

- 用户管理。
- 任务管理。
- 订单管理。
- 额度调整。
- Provider 配置。
- 成本统计。
- 限流和黑名单。
- 内容审核接入。

阶段目标：可以公开运营并处理异常。

### 阶段 5：套餐订阅和增长，持续迭代

- 月卡/年卡。
- 邀请返利。
- 每日签到/赠送额度。
- 高级模型/高清队列。
- 团队空间。
- 企业版 API。

## 13. MVP 优先级清单

### 必须做

- 登录注册。
- 后端托管 API Key。
- 生成任务服务端化。
- 额度预扣/退回。
- 对象存储。
- 基础订单和支付回调。
- 管理员查看任务和订单。

### 可以后置

- Agent 模式商业化。
- 多收藏夹云同步。
- 分享广场。
- 企业团队。
- 发票系统。
- 复杂订阅。
- 多模型路由。

### 不建议 MVP 做

- 一开始就重写整个前端。
- 一开始就支持所有自定义服务商给普通用户使用。
- 一开始就做复杂会员等级。
- 一开始就做公开作品社区。

## 14. 当前代码改造切入点

建议优先关注以下位置：

- `src/store.ts`：`submitTask` 和 `executeTask` 是画廊模式生成主链路。
- `src/lib/api.ts`：当前统一生图 API 入口，可替换为平台 API 适配层。
- `src/lib/openaiCompatibleImageApi.ts`：可迁移部分请求构造逻辑到后端 provider。
- `src/lib/falAiImageApi.ts`：可迁移 fal.ai 调用逻辑到后端 provider。
- `src/lib/agentApi.ts`：Agent 模式也直接使用前端 API Key，商业化时需要后端化。
- `src/lib/db.ts`：本地 IndexedDB 可保留缓存，但不再作为权威历史数据。
- `src/components/SettingsModal.tsx`：普通用户隐藏 API Key 和 provider 配置，管理员后台另做。
- `src/components/InputBar.tsx`：提交前展示余额不足、预计扣费、套餐权益。

## 15. 风险清单

### 15.1 技术风险

- 大图 base64 经过前端和后端传输会占用大量内存，应尽快改为对象存储 URL。
- 长时间生成任务不能只依赖 HTTP 请求，必须队列化。
- 支付回调必须幂等，避免重复到账。
- 额度扣减必须事务化，避免并发透支。

### 15.2 商业风险

- 定价低于模型成本会亏损。
- 免费额度容易被薅羊毛。
- 内容违规可能带来平台风险。
- 退款规则不清晰会增加客服成本。

### 15.3 合规风险

- 保留 MIT 许可证和原作者版权声明。
- 确认模型服务商是否允许商用和转售。
- 准备用户协议、隐私政策、内容规范。
- 若面向国内公开运营，按实际部署和业务形态评估备案、支付、内容安全要求。

## 16. 推荐的第一版开发目标

第一版不要追求大而全，建议目标是：

```text
用户可以注册登录
  -> 购买或由管理员发放 credits
  -> 在现有界面提交生图
  -> 后端扣 credits 并生成
  -> 用户看到云端历史图片
  -> 管理员能查看订单、任务、用户余额
```

达到这个目标后，平台已经具备最小商业闭环，可以小范围收费测试。
