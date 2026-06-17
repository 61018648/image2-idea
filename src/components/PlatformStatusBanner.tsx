import { getActiveApiProfile } from '../lib/apiProfiles'
import { useStore } from '../store'

function getModeLabel(platformMode: boolean): string {
  return platformMode ? '平台托管' : '普通模式'
}

export default function PlatformStatusBanner() {
  const settings = useStore((s) => s.settings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const activeProfile = getActiveApiProfile(settings)
  const platformMode = activeProfile.provider === 'platform'

  const handleOpenPlatformEntry = () => {
    window.dispatchEvent(new Event('platform-open-entry'))
  }

  const handleEnablePlatformMode = () => {
    window.dispatchEvent(new Event('platform-enable-request'))
  }

  return (
    <section data-home-platform-banner className="safe-area-x mx-auto max-w-7xl px-4 pt-4">
      <div className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${platformMode ? 'border-blue-200/70 bg-gradient-to-r from-blue-50 to-cyan-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-cyan-500/10' : 'border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/10'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${platformMode ? 'bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950' : 'bg-amber-600 text-white dark:bg-amber-400 dark:text-amber-950'}`}>
                {getModeLabel(platformMode)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">商业化平台 MVP</span>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <span className="truncate text-gray-500 dark:text-gray-400">当前配置：{activeProfile.name}</span>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                {platformMode ? '平台商业版已开启' : '平台商业版入口已就绪'}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
                {platformMode
                  ? '右上角可以直接打开平台入口，查看登录状态、余额、最近订单和账单中心；开发态和真实账号的界面已经分流。'
                  : '点击右侧按钮可一键切换或创建平台托管配置，随后即可使用真实登录、订单、余额和任务化生图的商业化链路。'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">真实登录 / HttpOnly Cookie</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">订单 / 余额 / 账单中心</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">任务化生图 / 资产存储</span>
              <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">开发态购买 / 收银台占位</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={platformMode ? handleOpenPlatformEntry : handleEnablePlatformMode}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${platformMode ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400' : 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400'}`}
            >
              {platformMode ? '打开平台入口' : '启用平台模式'}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center justify-center rounded-xl border border-white/70 bg-white/80 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
            >
              检查设置
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
