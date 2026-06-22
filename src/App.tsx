import { useEffect } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { mergeImportedSettings } from './lib/apiProfiles'
import { getPlatformPublicConfig } from './lib/platformAccountApi'
import { getCustomProviderConfigUrl, loadCustomProviderSettingsFromUrl } from './lib/customProviderConfigUrl'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import HomePage from './components/HomePage'
import PlatformAuthPage from './components/PlatformAuthPage'
import UserCenterPage from './components/UserCenterPage'
import PlansPage from './components/PlansPage'
import AdminPage from './components/AdminPage'
import GalleryPage from './components/GalleryPage'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import { FavoriteCollectionPickerModal, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const appMode = useStore((s) => s.appMode)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    let cancelled = false
    const applySiteTitle = async () => {
      try {
        const response = await getPlatformPublicConfig('')
        if (cancelled) return
        const siteName = response.config.siteName?.trim() || 'Image Idea'
        document.title = siteName
        document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', siteName)
      } catch {
        if (!cancelled) document.title = 'Image Idea'
      }
    }

    void applySiteTitle()
    window.addEventListener('platform-config-updated', applySiteTitle)
    return () => {
      cancelled = true
      window.removeEventListener('platform-config-updated', applySiteTitle)
    }
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    const customProviderConfigUrl = getCustomProviderConfigUrl()
    if (customProviderConfigUrl && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          if (!importedSettings) return
          const state = useStore.getState()
          state.setSettings(mergeImportedSettings(state.settings, importedSettings))
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
        })
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const syncModeFromRoute = () => {
      const pathname = window.location.pathname
      if (pathname === '/admin') {
        useStore.getState().setAppMode('admin')
      } else if (pathname === '/user') {
        useStore.getState().setAppMode('user-center')
      } else if (pathname === '/plans') {
        useStore.getState().setAppMode('plans')
      } else if (pathname === '/auth' || pathname === '/login' || pathname === '/register') {
        useStore.getState().setAppMode('auth')
      } else if (pathname === '/gallery') {
        useStore.getState().setAppMode('gallery')
      } else if (pathname === '/agent') {
        useStore.getState().setAppMode('gallery')
        window.history.replaceState(null, '', '/gallery')
      } else if (pathname === '/') {
        useStore.getState().setAppMode('home')
      }
    }

    syncModeFromRoute()
    window.addEventListener('popstate', syncModeFromRoute)
    return () => window.removeEventListener('popstate', syncModeFromRoute)
  }, [])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      {appMode === 'home' ? (
        <HomePage />
      ) : appMode === 'auth' ? (
        <PlatformAuthPage />
      ) : appMode === 'admin' ? (
        <AdminPage />
      ) : appMode === 'user-center' ? (
        <UserCenterPage />
      ) : appMode === 'plans' ? (
        <PlansPage />
      ) : (
        <GalleryPage filterFavorite={filterFavorite} activeFavoriteCollectionId={activeFavoriteCollectionId} />
      )}
      {(appMode === 'gallery' || appMode === 'agent') && <InputBar />}
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <SupportPromptModal />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
