# 平台托管后端 MVP

本项目新增了一个独立的最小平台后端骨架，位于 `server/`。它用于承接后续多用户、积分账本、订单支付和平台托管生图能力。

## 端点

### 健康检查

```http
GET /api/platform/health
```

### 账户与余额

```http
GET /api/platform/me
GET /api/platform/balance
GET /api/platform/ledger?limit=50
```

### 套餐与订单

```http
GET  /api/platform/plans
POST /api/platform/orders
```

创建订单请求：

```json
{
  "planId": "dev-small",
  "provider": "dev"
}
```

`provider` 可为 `dev`、`stripe`、`wechat` 或 `alipay`。支付回调中的 provider 必须与订单创建时一致。

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

### 平台托管生图

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
- `PLATFORM_API_TOKEN`：生产态平台 API bearer token。由反向代理注入，不应暴露给浏览器。
- `PLATFORM_GATEWAY_USER_ID`：生产态由可信网关注入的平台用户 ID。当前 MVP 可用固定用户 ID；真实多用户上线前必须替换为登录会话/JWT 解析结果，不能来自浏览器请求头。
- `PLATFORM_PAYMENT_NOTIFY_SECRET`：生产态支付回调共享密钥。
- `PLATFORM_DATA_FILE`：可选。设置后使用 JSON 文件保存开发态账号、余额、订单和账本数据；不设置则使用内存存储。

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

6. 使用前端“平台托管”服务商提交生图任务。

## 后续替换点

当前 `server/src/billing/store.ts` 是开发态存储实现。正式商业化时应替换为 PostgreSQL/Prisma 或其他数据库实现，并保持 `BillingStore` 接口稳定。

正式支付接入时，应在 `server/src/routes/paymentNotify.ts` 中按 provider 分支校验 Stripe/微信/支付宝签名，并继续复用 `markOrderPaid` 的幂等入账逻辑。
