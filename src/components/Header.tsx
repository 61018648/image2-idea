import { useEffect, useRef, useState } from 'react'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { createDefaultPlatformProfile, getActiveApiProfile } from '../lib/apiProfiles'
import { getPlatformPublicConfig } from '../lib/platformAccountApi'
import { getPlatformAuthSession } from '../lib/platformAuthApi'
import type { PlatformPublicConfigResponse } from '../lib/platformApiContracts'
import { toUserFacingErrorMessage } from '../lib/userFacingErrors'
import { useStore } from '../store'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import HistoryModal from './HistoryModal'
import { EditIcon, HistoryIcon, UserIcon } from './icons'

type NavKey = 'home' | 'gallery' | 'studio' | 'plans'

export default function Header() {
  const appMode = useStore((s) => s.appMode)
  const settings = useStore((s) => s.settings)
  const setAppMode = useStore((s) => s.setAppMode)
  const showToast = useStore((s) => s.showToast)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const createConversation = useStore((s) => s.createAgentConversation)
  const activeConversation = agentConversations.find((item) => item.id === activeAgentConversationId)
  const activeProfile = getActiveApiProfile(settings)
  const platformMode = activeProfile.provider === 'platform'
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const showFavoriteCollectionTitle = appMode === 'gallery' && Boolean(activeFavoriteCollectionId)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [hintVisible, setHintVisible] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [publicConfig, setPublicConfig] = useState<PlatformPublicConfigResponse['config'] | null>(null)
  const [currentPath, setCurrentPath] = useState(() => (typeof window === 'undefined' ? '/' : window.location.pathname))
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const siteName = publicConfig?.siteName || 'Image Idea'
  const activeNav: NavKey | null = currentPath === '/studio'
    ? 'studio'
    : appMode === 'plans'
      ? 'plans'
    : appMode === 'home'
      ? 'home'
      : appMode === 'gallery'
        ? 'gallery'
          : null

  const getPlatformProfile = () => {
    const existingPlatformProfile = settings.profiles.find((profile) => profile.provider === 'platform')
    const platformProfile = existingPlatformProfile ?? createDefaultPlatformProfile()
    return { existingPlatformProfile, platformProfile }
  }

  const enablePlatformMode = () => {
    const { existingPlatformProfile, platformProfile } = getPlatformProfile()
    useStore.getState().setSettings({
      profiles: existingPlatformProfile ? settings.profiles : [...settings.profiles, platformProfile],
      activeProfileId: platformProfile.id,
    })
    window.dispatchEvent(new Event('platform-billing-updated'))
  }

  const navigate = (path: string, mode: Parameters<typeof setAppMode>[0]) => {
    window.history.pushState(null, '', path)
    setCurrentPath(path)
    setAppMode(mode)
  }

  const handleUserCenterClick = async () => {
    const { existingPlatformProfile, platformProfile } = getPlatformProfile()
    if (!existingPlatformProfile || !platformMode) {
      useStore.getState().setSettings({
        profiles: existingPlatformProfile ? settings.profiles : [...settings.profiles, platformProfile],
        activeProfileId: platformProfile.id,
      })
    }

    try {
      await getPlatformAuthSession(platformProfile.baseUrl)
      navigate('/user', 'user-center')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== '请先登录后再继续操作' && message !== 'Unauthorized') {
        showToast(toUserFacingErrorMessage(error), 'error')
      }
      navigate('/auth', 'auth')
    }
  }

  const openHomePage = () => navigate('/', 'home')
  const openGalleryPage = () => navigate('/gallery', 'gallery')
  const openStudioPage = () => navigate('/studio', 'agent')
  const openPlansPage = () => navigate('/plans', 'plans')

  useEffect(() => {
    void getPlatformPublicConfig(activeProfile.baseUrl).then((response) => setPublicConfig(response.config)).catch(() => undefined)
  }, [activeProfile.baseUrl])

  useEffect(() => {
    const syncPath = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    if (appMode === 'agent') {
      setScrollDirection('up')
      return
    }

    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (ticking) return
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        if (currentScrollY < 20) {
          setScrollDirection('up')
        } else if (currentScrollY > lastScrollY + 10) {
          setScrollDirection('down')
        } else if (currentScrollY < lastScrollY - 10) {
          setScrollDirection('up')
        }
        lastScrollY = currentScrollY
        ticking = false
      })
      ticking = true
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [appMode])

  useEffect(() => {
    if (appMode === 'agent' && !agentMobileHeaderVisible) {
      setHintVisible(true)
      const timer = window.setTimeout(() => setHintVisible(false), 1500)
      return () => window.clearTimeout(timer)
    }
  }, [appMode, agentMobileHeaderVisible])

  useEffect(() => {
    const openPlatformEntry = () => {
      void handleUserCenterClick()
    }
    const enablePlatform = () => enablePlatformMode()

    window.addEventListener('platform-open-entry', openPlatformEntry)
    window.addEventListener('platform-enable-request', enablePlatform)
    return () => {
      window.removeEventListener('platform-open-entry', openPlatformEntry)
      window.removeEventListener('platform-enable-request', enablePlatform)
    }
  }, [platformMode, settings.profiles])

  const navItems: Array<{ key: NavKey; label: string; compactLabel: string; onClick: () => void }> = [
    { key: 'home', label: '首页', compactLabel: '首页', onClick: openHomePage },
    { key: 'gallery', label: '作品画廊', compactLabel: '作品', onClick: openGalleryPage },
    { key: 'studio', label: '生图工作台', compactLabel: '生图', onClick: openStudioPage },
    { key: 'plans', label: '套餐充值', compactLabel: '套餐', onClick: openPlansPage },
  ]

  const renderNavButton = (item: typeof navItems[number], compact = false) => {
    const active = activeNav === item.key
    return (
      <button
        key={item.key}
        type="button"
        onClick={item.onClick}
        className={`${compact ? 'rounded-xl px-2 py-2 text-sm' : 'rounded-full px-4 py-2 text-sm'} font-semibold transition-all ${active ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white'}`}
      >
        {compact ? item.compactLabel : item.label}
      </button>
    )
  }

  return (
    <>
      <header data-no-drag-select className={`safe-area-top fixed top-0 left-0 right-0 z-40 border-b border-gray-200/70 bg-[#fbfaf7]/90 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-transform duration-300 ease-in-out dark:border-white/[0.08] dark:bg-gray-950/88 ${appMode === 'agent' && !agentMobileHeaderVisible ? '-translate-y-full sm:translate-y-0' : 'translate-y-0'}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-950/20 to-transparent dark:via-white/20" />
        <div className="safe-area-x safe-header-inner relative mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
            <h1 className="relative mr-1 inline-flex min-w-0 items-center">
              <button type="button" onClick={openHomePage} className="group inline-flex min-w-0 items-center gap-3 text-left">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-950 text-sm font-black text-white shadow-lg shadow-gray-950/15 dark:bg-white dark:text-gray-950">
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_34%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(0,0,0,0.18),transparent_34%)]" />
                  <span className="relative">AI</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-black tracking-tight text-gray-950 transition-colors group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-200 sm:text-lg">
                    {showFavoriteCollectionTitle ? favoriteCollectionTitle : siteName}
                  </span>
                  <span className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 sm:block">Image Commerce Studio</span>
                </span>
              </button>
              {hasUpdate && latestRelease && (
                <a
                  href={latestRelease.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={dismiss}
                  className="absolute -right-1 top-0 translate-x-full rounded-full border border-red-500/30 bg-red-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-sm transition-all hover:bg-red-600"
                  title={`新版本 ${latestRelease.tag}`}
                >
                  NEW
                </a>
              )}
            </h1>

            {appMode === 'agent' && (
              <div className="relative hidden items-center gap-1 rounded-full border border-gray-200 bg-white/70 p-1 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] sm:flex">
                <button ref={historyButtonRef} type="button" onClick={() => setShowHistoryModal((visible) => !visible)} className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06] dark:hover:text-gray-100" title="历史任务">
                  <HistoryIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAppMode('agent')
                    createConversation()
                  }}
                  className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
                  title="新建对话"
                >
                  <EditIcon className="h-5 w-5" />
                </button>
                {showHistoryModal && <HistoryModal onClose={() => setShowHistoryModal(false)} ignoreOutsideClickRef={historyButtonRef} />}
              </div>
            )}
          </div>

          {appMode === 'agent' && activeConversation && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 lg:flex">
              <button
                type="button"
                onClick={() => {
                  setShowHistoryModal(true)
                  window.setTimeout(() => {
                    useStore.getState().setAgentEditingConversationId(activeConversation.id)
                  }, 0)
                }}
                className="truncate rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"
              >
                {activeConversation.title || 'Agent'}
              </button>
            </div>
          )}

          {showFavoriteCollectionTitle && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 lg:flex">
              <div className="truncate rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300" title={favoriteCollectionTitle}>
                {favoriteCollectionTitle}
              </div>
            </div>
          )}

          <nav className="hidden items-center gap-1 rounded-full border border-gray-200 bg-gray-100/75 p-1 shadow-inner dark:border-white/[0.08] dark:bg-white/[0.04] sm:flex">
            {navItems.map((item) => renderNavButton(item))}
          </nav>

      

          <button
            type="button"
            onClick={() => void handleUserCenterClick()}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 ${appMode === 'auth' || appMode === 'user-center' || appMode === 'admin' ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 bg-white/80 text-gray-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:text-blue-200'}`}
            aria-label="用户中心"
            title="用户中心"
          >
            <UserIcon className="h-5 w-5" />
            <span className="hidden sm:inline">用户中心</span>
          </button>
        </div>

        <div className={`safe-area-x overflow-hidden transition-all duration-300 ease-in-out sm:hidden ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0 opacity-0' : 'max-h-16 pb-2 opacity-100'}`}>
          <nav className="mx-2 grid grid-cols-4 gap-1 rounded-2xl border border-gray-200 bg-gray-100/80 p-1 shadow-inner dark:border-white/[0.08] dark:bg-white/[0.04]">
            {navItems.map((item) => renderNavButton(item, true))}
          </nav>
        </div>
      </header>

      <div className={`pointer-events-none fixed left-0 right-0 top-0 z-30 flex justify-center transition-all duration-300 ease-in-out sm:hidden ${appMode === 'agent' && hintVisible && !agentMobileHeaderVisible ? 'translate-y-[env(safe-area-inset-top,0px)] opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="rounded-b-xl bg-black/60 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm">
          下拉显示顶部导航
        </div>
      </div>

      <div className={`safe-area-top invisible pointer-events-none transition-all duration-300 ease-in-out ${appMode === 'agent' && !agentMobileHeaderVisible ? 'max-h-0 overflow-hidden opacity-0 sm:max-h-[500px] sm:overflow-visible sm:opacity-100' : 'max-h-[500px] opacity-100'}`} aria-hidden="true">
        <div className="safe-header-inner" />
        <div className={`safe-area-x overflow-hidden transition-all duration-300 ease-in-out sm:hidden ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0' : 'max-h-16 pb-2'}`}>
          <div className="p-1">
            <div className="py-1.5 text-sm">占位</div>
          </div>
        </div>
      </div>
    </>
  )
}
