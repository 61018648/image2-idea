# 平台托管后端 MVP

本项目新增了一个独立的最小平台后端骨架，位于 `server/`。它用于承接后续多用户、积分账本、订单支付和平台托管生图能力。

## 端点

### 健康检查

```http
GET /api/platform/health
```

### 认证

```http
POST /api/platform/auth/register
POST /api/platform/auth/login
POST /api/platform/auth/logout
GET  /api/platform/auth/session
```

真实登录注册使用 HttpOnly Cookie `platform_session`。该能力需要配置 `DATABASE_URL` 和 `PLATFORM_SESSION_SECRET`；未安装数据库时请继续使用 `PLATFORM_DEV_MODE=true` 开发模式。

开发模式 `PLATFORM_DEV_MODE=true` 会继续跳过真实登录，使用 `x-platform-user-id` 或默认 `dev-user`。

### 账户与余额

```http
GET /api/platform/me
GET /api/platform/balance
GET /api/platform/ledger?limit=50
```

### 套餐与订单

```http
GET  /api/platform/plans
GET  /api/platform/orders?limit=20
POST /api/platform/orders
POST /api/platform/checkout
```

`GET /api/platform/orders` 返回当前登录用户或开发态用户的最近订单，供账单中心和后续支付收银台使用。

创建订单请求：

```json
{
  "planId": "dev-small",
  "provider": "dev"
}
```

`provider` 可为 `dev`、`stripe`、`wechat` 或 `alipay`。支付回调中的 provider 必须与订单创建时一致。

`POST /api/platform/checkout` 用于真实登录用户创建支付收银台会话。当前实现会先创建 `pending` 订单，并返回 `202` 与 `checkout.status: "not_configured"` 的占位响应；后续接入 Stripe、微信或支付宝时可在保持前端调用契约不变的情况下返回 `checkoutUrl` 或 `qrCodeUrl`。

### 运营概览

```http
GET /api/platform/admin/stats
```

返回当前平台的最小运营指标，包括用户数、订单数、已支付订单、待支付订单、收入、已发放积分、已扣减积分、当前总余额和任务状态统计。当前账单中心会展示其中的用户、订单、已支付、收入和任务总数；后续可扩展为独立管理后台。

### 支付回调骨架

```http
POST /api/platform/payments/notify
```

开发态请求示例：

```json
{
  "provider": "dev",
  "providerEventId": "evt-dev-001",
  "orderId": "ord_xxx",
  "paidAmountCents": 500
}
```

生产态需要请求头：

```http
x-platform-payment-secret: <PLATFORM_PAYMENT_NOTIFY_SECRET>
```

支付回调已做幂等处理：相同 `provider + providerEventId` 不会重复发放积分；已支付订单再次回调也不会重复入账。

### 平台任务化生图 MVP

```http
POST /api/platform/generations
GET  /api/platform/generations
GET  /api/platform/generations?jobId=<job_id>
```

该接口会创建平台生图任务、预扣积分并立即返回 `job.id`。未设置 `DATABASE_URL` 时使用内存任务存储，并在后台异步执行任务；进程重启后任务记录会丢失。设置 `DATABASE_URL` 并完成 migration 后，会使用 PostgreSQL/Prisma `generation_jobs` 表保存任务。

创建任务响应示例：

```json
{
  "job": {
    "id": "job_dev-user_xxx",
    "status": "queued",
    "costCredits": 1,
    "images": [],
    "createdAt": "2026-06-17T00:00:00.000Z"
  },
  "creditsQuoted": 1,
  "creditsCharged": 1
}
```

任务成功后，查询接口会返回 `status: "succeeded"` 和 `images`。失败时会返回 `status: "failed"` 和 `errorMessage`，并自动退回本次预扣积分。

当前任务成功结果会先保存到本地资产存储，并在 `images` 中返回同源资产 URL，例如：

```json
{
  "job": {
    "id": "job_dev-user_xxx",
    "status": "succeeded",
    "images": ["/api/platform/assets/asset_xxx.png"]
  }
}
```

### 平台资产读取

```http
GET /api/platform/assets/<asset_id>
HEAD /api/platform/assets/<asset_id>
```

该接口用于读取平台任务生成后的本地图片资产。当前实现是本地文件存储，目录由 `PLATFORM_ASSET_DIR` 控制，未设置时默认使用 `server/.platform-assets`。生产部署时应挂载持久化卷，后续可替换为 S3/R2/OSS/COS。

### 平台托管同步生图（兼容接口）

```http
POST /api/platform/images/generations
```

该接口会：

1. 校验平台会话。
2. 根据参数估算积分。
3. 预扣积分。
4. 调用服务端上游图像模型。
5. 成功返回图片；失败自动退回本次预扣积分。

余额不足时返回：

```json
{
  "error": {
    "message": "Insufficient credits",
    "code": "insufficient_credits"
  }
}
```

## 关键环境变量

### 平台服务自身

- `PLATFORM_HOST`：监听地址，默认 `127.0.0.1`。
- `PLATFORM_PORT`：监听端口，默认 `8788`。
- `PLATFORM_DEV_MODE`：设为 `true` 时使用开发会话，允许通过 `x-platform-user-id` 指定用户，默认用户为 `dev-user`。
- `PLATFORM_API_TOKEN`：生产态平台 API bearer token。由反向代理注入，不应暴露给浏览器。真实登录启用后，该模式仅作为 legacy gateway fallback。
- `PLATFORM_GATEWAY_USER_ID`：生产态由可信网关注入的平台用户 ID。真实登录启用后不应继续作为多用户身份来源。
- `PLATFORM_SESSION_SECRET`：真实登录 Cookie 签名密钥。启用注册/登录时必填，应使用高强度随机字符串。
- `PLATFORM_COOKIE_SECURE`：设为 `true` 时 session cookie 增加 `Secure` 属性，HTTPS 生产环境建议开启。
- `PLATFORM_PAYMENT_NOTIFY_SECRET`：生产态支付回调共享密钥。
- `DATABASE_URL`：可选。设置后使用 PostgreSQL/Prisma 保存账号、余额、订单、支付事件和账本数据；正式商业化建议开启。
- `PLATFORM_DATA_FILE`：可选。未设置 `DATABASE_URL` 时生效；设置后使用 JSON 文件保存开发态账号、余额、订单和账本数据，不设置则使用内存存储。
- `PLATFORM_ASSET_DIR`：可选。本地资产存储目录，默认使用 `server/.platform-assets`；生产部署时必须挂载到持久化卷，后续可替换为 S3/R2/OSS。

### 上游图像模型

- `PLATFORM_OPENAI_API_KEY`：服务端上游模型 API Key，必填。
- `PLATFORM_OPENAI_BASE_URL`：上游 OpenAI 兼容 API 地址，默认 `https://api.openai.com/v1`。
- `PLATFORM_OPENAI_IMAGE_MODEL`：上游图像模型，默认 `gpt-image-2`。
- `PLATFORM_UPSTREAM_TIMEOUT_MS`：上游请求超时，默认 `120000`。

### Docker/Nginx 网关

前端浏览器不会直接携带 `PLATFORM_API_TOKEN`。Docker/Nginx 可通过以下变量开启同源平台网关：

- `PLATFORM_API_URL`：平台后端地址，例如 `http://platform-server:8788`。
- `PLATFORM_API_TOKEN`：Nginx 转发到平台后端时注入为 `Authorization: Bearer ...`。
- `PLATFORM_GATEWAY_USER_ID`：Nginx 转发到平台后端时注入为 `X-Platform-User-Id`。

浏览器请求同源：

```http
/api/platform/...
```

Nginx 转发到：

```http
<PLATFORM_API_URL>/api/platform/...
```

## 开发态最小流程

如需使用 PostgreSQL 持久化账本和真实登录注册，先在 `server/` 下设置 `DATABASE_URL` 和 `PLATFORM_SESSION_SECRET` 并执行：

```bash
npm install
npm run db:migrate
```

未设置 `DATABASE_URL` 时仍使用内存或 `PLATFORM_DATA_FILE` 开发态存储，并应通过 `PLATFORM_DEV_MODE=true` 使用开发态用户；真实注册/登录接口会返回数据库未配置错误。

1. 启动平台后端，并设置：

```bash
PLATFORM_DEV_MODE=true \
PLATFORM_OPENAI_API_KEY=sk-xxx \
npm run dev
```

2. 查询套餐：

```http
GET /api/platform/plans
```

3. 创建订单：

```http
POST /api/platform/orders
{"planId":"dev-small"}
```

4. 模拟支付回调：

```http
POST /api/platform/payments/notify
{"provider":"dev","providerEventId":"evt-001","orderId":"ord_xxx"}
```

5. 查询余额：

```http
GET /api/platform/balance
```

6. 前端 Header 的“平台积分”入口会打开账单中心，可查看余额、套餐、最近订单、最近平台任务和最近流水。开发态下可点击“开发态购买”，前端会创建 `dev` 订单并调用开发态支付回调模拟入账；真实登录态点击“购买”会创建 checkout 占位订单，当前提示支付收银台待接入，后续替换为真实支付收银台和服务端验签。

7. 使用前端“平台托管”服务商提交生图任务。

## 后续替换点

当前 `server/src/billing/store.ts` 是开发态存储实现。正式商业化时应替换为 PostgreSQL/Prisma 或其他数据库实现，并保持 `BillingStore` 接口稳定。

正式支付接入时，应在 `server/src/routes/paymentNotify.ts` 中按 provider 分支校验 Stripe/微信/支付宝签名，并继续复用 `markOrderPaid` 的幂等入账逻辑。
