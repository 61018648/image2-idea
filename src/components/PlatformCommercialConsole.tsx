import { useEffect, useMemo, useState } from 'react'
import { createDefaultPlatformProfile, getActiveApiProfile } from '../lib/apiProfiles'
import { getPlatformAdminStats, getPlatformBalance, getPlatformLedger, getPlatformMe, getPlatformPlans, listPlatformOrders } from '../lib/platformAccountApi'
import { useStore } from '../store'
import { ArrowDownIcon, CodeIcon, HistoryIcon, LinkIcon, RefreshIcon, SettingsIcon } from './icons'

function formatMoney(cents: number, currency = 'USD') {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
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
    authRequired?: boolean
    balance: number
    planCount: number
    orderCount: number
    creditsIssued: number
    recentOrderLabel: string
    recentLedgerLabel: string
    adminUsers?: number
    jobCount?: number
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
        balance: balance.balance.availableCredits,
        planCount: plans.plans.filter((plan) => plan.enabled).length,
        orderCount: orders.orders.length,
        creditsIssued: stats?.billing.creditsIssued ?? 0,
        recentOrderLabel: orders.orders[0] ? `${orders.orders[0].status} · ${formatMoney(orders.orders[0].amountCents, orders.orders[0].currency)}` : '暂无订单',
        recentLedgerLabel: ledger.entries[0] ? `${ledger.entries[0].type} · ${ledger.entries[0].amount > 0 ? '+' : ''}${ledger.entries[0].amount}` : '暂无流水',
        adminUsers: stats?.billing.users,
        jobCount: stats?.jobs.total,
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

  const tone = useMemo(() => {
    return platformMode
      ? 'border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:via-gray-900 dark:to-cyan-500/10'
      : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-amber-50 dark:border-white/[0.08] dark:from-gray-950 dark:via-gray-900 dark:to-amber-500/10'
  }, [platformMode])

  return (
    <section className="safe-area-x mx-auto max-w-7xl px-4 pb-8 pt-4">
      <div className={`overflow-hidden rounded-3xl border shadow-sm ${tone}`}>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${platformMode ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}`}>{platformMode ? '平台已启用' : '商业模式未启用'}</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">余额中心</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">订单与套餐</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">任务计费</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                面向付费用户的 AI 生图工作台
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                余额、套餐、订单、任务和支付回调都已经连上。这里会把商业状态、用户会话和下一步动作放在最顺手的位置，适合反复运营和续费。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="text-xs text-gray-500 dark:text-gray-400">当前余额</div>
                <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.balance ?? 0}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">credits</div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="text-xs text-gray-500 dark:text-gray-400">可售套餐</div>
                <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.planCount ?? 0}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">上架中</div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="text-xs text-gray-500 dark:text-gray-400">最近订单</div>
                <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{loading ? '...' : summary?.recentOrderLabel ?? '暂无订单'}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">最近账单</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">运营控制台</div>
                  <div className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">{platformMode ? (summary?.authRequired ? '请登录平台账号' : '平台模式在线') : '请先启用平台模式'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                >
                  <RefreshIcon className="h-4 w-4" />
                  刷新
                </button>
              </div>

              {summary?.authRequired ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  平台后端已连接。登录或注册后即可查看余额、套餐、订单流水并使用扣费生图。
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">{error}</div>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-2xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-white/[0.08] dark:text-gray-300">
                    <span className="inline-flex items-center gap-2"><HistoryIcon className="h-4 w-4" />最近流水</span>
                    <span className="font-medium text-gray-900 dark:text-white">{loading ? '...' : summary?.recentLedgerLabel ?? '暂无流水'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-white/[0.08] dark:text-gray-300">
                    <span className="inline-flex items-center gap-2"><HistoryIcon className="h-4 w-4" />管理员用户</span>
                    <span className="font-medium text-gray-900 dark:text-white">{loading ? '...' : summary?.adminUsers ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-white/[0.08] dark:text-gray-300">
                    <span className="inline-flex items-center gap-2"><CodeIcon className="h-4 w-4" />平台任务</span>
                    <span className="font-medium text-gray-900 dark:text-white">{loading ? '...' : summary?.jobCount ?? 0}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {platformMode ? (
                <button
                  type="button"
                  onClick={openBilling}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <LinkIcon className="h-4 w-4" />
                  {summary?.authRequired ? '登录 / 注册' : '打开账单中心'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enablePlatformMode}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  <ArrowDownIcon className="h-4 w-4" />
                  启用平台模式
                </button>
              )}
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                <SettingsIcon className="h-4 w-4" />
                进入设置
              </button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              {platformMode
                ? summary?.authRequired
                  ? '当前账号未登录 · 点击登录后进入完整计费中心'
                  : `当前账号 ${summary?.email ?? '未登录'} · 余额 ${summary?.balance ?? 0} credits`
                : '启用平台模式后，用户可以登录、充值、查看订单和使用云端生图。'}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
