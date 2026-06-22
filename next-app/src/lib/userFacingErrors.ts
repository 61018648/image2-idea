const DEFAULT_ERROR_MESSAGE = '操作失败，请稍后重试或联系管理员'
const DEFAULT_GENERATION_ERROR_MESSAGE = '生成失败，请稍后重试或联系管理员'

const SENSITIVE_ERROR_PATTERNS = [
  /https?:\/\/\S+/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\S*/i,
  /\/api\/[^\s，。；;)]*/i,
  /\b[A-Z]+ \d{3}\b/,
  /\bHTTP\s+\d{3}\b/i,
  /Missing required environment variable/i,
  /Base URL/i,
  /upstream|上游|接口地址|接口|endpoint/i,
]

export function toUserFacingErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (!message) return fallback
  if (/Unauthorized/i.test(message)) return '请先登录后再继续操作'
  if (/Insufficient credits|insufficient_credits|余额不足|积分不足/i.test(message)) return '余额不足，请先充值后再生成图片'
  if (/pending order|pending_order_exists|待支付订单/i.test(message)) return '你还有待支付订单，请先完成支付或取消订单'
  if (/Invalid username or password|用户名或密码/i.test(message)) return '用户名或密码错误'
  if (/not enabled|payment_type_disabled|支付方式/i.test(message)) return '当前支付方式不可用，请联系管理员'
  if (SENSITIVE_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return fallback
  return message.length > 120 ? fallback : message
}

export function toUserFacingGenerationError(error: unknown): string {
  return toUserFacingErrorMessage(error, DEFAULT_GENERATION_ERROR_MESSAGE)
}
