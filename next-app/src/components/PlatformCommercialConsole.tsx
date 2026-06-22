import { useEffect, useMemo, useState } from 'react'
import { createDefaultPlatformProfile, getActiveApiProfile } from '../lib/apiProfiles'
import { getPlatformAdminStats, getPlatformBalance, getPlatformLedger, getPlatformMe, getPlatformPlans, listPlatformOrders } from '../lib/platformAccountApi'
import { useStore } from '../store'
import { ArrowDownIcon, CodeIcon, HistoryIcon, LinkIcon, RefreshIcon, SettingsIcon } from './icons'

function formatMoney(cents: number, currency = 'USD') {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

function formatOrderStatus(status: string): string {
  if (status === 'paid') return '已支付'
  if (status === 'cancelled') return '已取消'
  if (status === 'expired') return '已过期'
  return '待支付'
}

function formatLedgerType(type: string): string {
  if (type === 'purchase') return '充值'
  if (type === 'debit') return '扣费'
  if (type === 'refund') return '退款'
  if (type === 'grant') return '赠送'
  return '调整'
}

export default function PlatformCommercialConsole() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const showToast = useStore((s) => s.showToast)
  const activeProfile = getActiveApiProfile(settings)
  const platformMode = activeProfile.provider === 'platform'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    email?: string | null
    accountLabel?: string
    isAdmin?: boolean
    authRequired?: boolean
    balance: number
    planCount: number
    orderCount: number
    creditsIssued: number
    recentOrderLabel: string
    recentLedgerLabel: string
    paidOrderCount: number
    revenueCents: number
    adminUsers?: number
    jobCount?: number
    queuedJobs?: number
    runningJobs?: number
    failedJobs?: number
  } | null>(null)

  const enablePlatformMode = () => {
    const existingPlatformProfile = settings.profiles.find((profile) => profile.provider === 'platform')
    const platformProfile = existingPlatformProfile ?? createDefaultPlatformProfile()
    setSettings({
      profiles: existingPlatformProfile ? settings.profiles : [...settings.profiles, platformProfile],
      activeProfileId: platformProfile.id,
    })
    window.dispatchEvent(new Event('platform-billing-updated'))
    showToast('已启用平台模式', 'success')
  }

  const openBilling = () => {
    window.dispatchEvent(new Event('platform-open-entry'))
  }

  const openSettings = () => {
    setShowSettings(true)
  }

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      if (!platformMode) {
        setSummary(null)
        return
      }
      const [me, balance, plans, orders, ledger, stats] = await Promise.all([
        getPlatformMe(activeProfile.baseUrl),
        getPlatformBalance(activeProfile.baseUrl),
        getPlatformPlans(activeProfile.baseUrl),
        listPlatformOrders(activeProfile.baseUrl, 1),
        getPlatformLedger(activeProfile.baseUrl, 1),
        getPlatformAdminStats(activeProfile.baseUrl).catch(() => null),
      ])
      setSummary({
        email: me.user.email,
        accountLabel: me.user.email ?? (me.user.mode === 'development' ? '开发账号' : me.user.id),
        isAdmin: me.user.mode === 'development' || me.user.role === 'admin',
        balance: balance.balance.availableCredits,
        planCount: plans.plans.filter((plan) => plan.enabled).length,
        orderCount: orders.orders.length,
        creditsIssued: stats?.billing.creditsIssued ?? 0,
        recentOrderLabel: orders.orders[0] ? `${formatOrderStatus(orders.orders[0].status)} · ${formatMoney(orders.orders[0].amountCents, orders.orders[0].currency)}` : '暂无订单',
        recentLedgerLabel: ledger.entries[0] ? `${formatLedgerType(ledger.entries[0].type)} · ${ledger.entries[0].amount > 0 ? '+' : ''}${ledger.entries[0].amount}` : '暂无流水',
        paidOrderCount: stats?.billing.paidOrders ?? 0,
        revenueCents: stats?.billing.revenueCents ?? 0,
        adminUsers: stats?.billing.users,
        jobCount: stats?.jobs.total,
        queuedJobs: stats?.jobs.queued,
        runningJobs: stats?.jobs.running,
        failedJobs: stats?.jobs.failed,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'Unauthorized') {
        setSummary({
          authRequired: true,
          balance: 0,
          planCount: 0,
          orderCount: 0,
          creditsIssued: 0,
          recentOrderLabel: '登录后可查看订单',
          recentLedgerLabel: '登录后可查看流水',
          paidOrderCount: 0,
          revenueCents: 0,
        })
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [platformMode, activeProfile.baseUrl])

  useEffect(() => {
    const handleBillingUpdate = () => {
      void refresh()
    }
    window.addEventListener('platform-billing-updated', handleBillingUpdate)
    return () => window.removeEventListener('platform-billing-updated', handleBillingUpdate)
  }, [platformMode, activeProfile.baseUrl])

  const tone = useMemo(() => platformMode
    ? 'border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-950'
    : 'border-amber-200/80 bg-white dark:border-amber-500/20 dark:bg-gray-950', [platformMode])
  const showAdminPanel = Boolean(summary?.isAdmin)

  return (
    <section className="safe-area-x mx-auto max-w-7xl px-4 pb-8 pt-4">
      <div className={`overflow-hidden rounded-lg border shadow-sm ${tone}`}>
        <div className="space-y-4 p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${platformMode ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
              {platformMode ? '平台已启用' : '商业模式未启用'}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">我的账户</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">订单与套餐</span>
            {showAdminPanel && <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">管理员后台</span>}
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-3xl">账户与计费</h2>
            <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
              查看当前账号余额、最近订单、余额流水和可用套餐。管理员账号会在下方显示运营后台指标。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">可用余额</div>
              <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.balance ?? 0}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">余额</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">最近订单</div>
              <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.recentOrderLabel ?? '暂无订单'}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary?.orderCount ?? 0} 条记录</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">最近流水</div>
              <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.recentLedgerLabel ?? '暂无流水'}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">余额变动</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">可售套餐</div>
              <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.planCount ?? 0}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">上架中</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
            <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">ACCOUNT</div>
                  <div className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">
                    {platformMode ? (summary?.authRequired ? '请登录平台账号' : '平台模式在线') : '请先启用平台模式'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                >
                  <RefreshIcon className="h-4 w-4" />
                  刷新
                </button>
              </div>

              {summary?.authRequired ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  平台后端已连接。登录或注册后即可查看余额、套餐、订单流水并使用扣费生图。
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-white/[0.08] dark:bg-transparent dark:text-gray-300">
                    <span className="inline-flex items-center gap-2"><HistoryIcon className="h-4 w-4" />最近流水</span>
                    <span className="font-medium text-gray-900 dark:text-white">{loading ? '...' : summary?.recentLedgerLabel ?? '暂无流水'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-white/[0.08] dark:bg-transparent dark:text-gray-300">
                    <span className="inline-flex items-center gap-2"><HistoryIcon className="h-4 w-4" />最近订单</span>
                    <span className="font-medium text-gray-900 dark:text-white">{loading ? '...' : summary?.recentOrderLabel ?? '暂无订单'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {platformMode
                  ? summary?.authRequired
                    ? '当前账号未登录'
                    : `当前账号 ${summary?.accountLabel ?? '开发账号'}`
                  : '平台模式未启用'}
              </div>
              {platformMode ? (
                <button
                  type="button"
                  onClick={openBilling}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <LinkIcon className="h-4 w-4" />
                  {summary?.authRequired ? '登录 / 注册' : '打开账单中心'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enablePlatformMode}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  <ArrowDownIcon className="h-4 w-4" />
                  启用平台模式
                </button>
              )}
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                <SettingsIcon className="h-4 w-4" />
                进入设置
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAdminPanel && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-950 lg:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">ADMIN</div>
              <h3 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">管理员后台</h3>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">仅管理员可见</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">累计收入</div>
              <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : formatMoney(summary?.revenueCents ?? 0)}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary?.paidOrderCount ?? 0} 笔已支付</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">用户数</div>
              <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.adminUsers ?? 0}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">平台账号</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">平台任务</div>
              <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.jobCount ?? 0}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary?.runningJobs ?? 0} 运行中</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-xs text-gray-500 dark:text-gray-400">异常队列</div>
              <div className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{summary?.queuedJobs ?? 0} 排队 / {summary?.failedJobs ?? 0} 失败</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">任务状态</div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
