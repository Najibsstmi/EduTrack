import { useEffect, useState } from 'react'

function isStandaloneMode() {
  const isDisplayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
  const isIosStandalone = window.navigator.standalone === true

  return isDisplayModeStandalone || isIosStandalone
}

export default function InstallEduTrackButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode())

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
    }

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)')
    const handleDisplayModeChange = (event) => {
      if (event.matches) {
        setDeferredPrompt(null)
        setIsInstalled(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()

    try {
      await deferredPrompt.userChoice
    } finally {
      setDeferredPrompt(null)
    }
  }

  if (!deferredPrompt || isInstalled) return null

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-slate-800"
    >
      Pasang EduTrack
    </button>
  )
}