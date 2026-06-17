import { getActiveApiProfile } from '../lib/apiProfiles'
import { useStore } from '../store'
import { ArrowDownIcon, LinkIcon, SettingsIcon } from './icons'

export default function PlatformStatusBanner() {
  const settings = useStore((s) => s.settings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const activeProfile = getActiveApiProfile(settings)
  const platformMode = activeProfile.provider === 'platform'

  return (
    <section data-home-platform-banner className="safe-area-x mx-auto max-w-7xl px-4 pt-4">
      <div className={`rounded-2xl border px-4 py-3 shadow-sm ${platformMode ? 'border-blue-200/70 bg-blue-50/80 dark:border-blue-500/20 dark:bg-blue-500/10' : 'border-amber-200/70 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${platformMode ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'}`}>
              {platformMode ? '平台已启用' : '平台未启用'}
            </span>
            <span className="text-gray-700 dark:text-gray-200">商业计费链路</span>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span className="truncate text-gray-500 dark:text-gray-400">当前配置：{activeProfile.name}</span>
            <span className="hidden text-gray-400 dark:text-gray-500 sm:inline">·</span>
            <span className="hidden text-gray-500 dark:text-gray-400 sm:inline">登录、余额、订单、任务扣费已接入</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(platformMode ? 'platform-open-entry' : 'platform-enable-request'))}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${platformMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
            >
              {platformMode ? <LinkIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
              {platformMode ? '账单中心' : '启用平台'}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
            >
              <SettingsIcon className="h-4 w-4" />
              设置
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
