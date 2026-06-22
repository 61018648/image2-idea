'use client'

import 'core-js/actual/array/at'
import { StrictMode, useEffect } from 'react'
import App from '../../src/App'
import { installMobileViewportGuards } from '../../src/lib/viewport'
import { clientEnv } from '../../src/lib/clientEnv'

export default function ClientApp() {
  useEffect(() => {
    installMobileViewportGuards()

    if (!('serviceWorker' in navigator)) return
    if (clientEnv.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
          console.error('Service worker registration failed:', error)
        })
      })
    } else {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })
    }
  }, [])

  return (
    <StrictMode>
      <App />
    </StrictMode>
  )
}
