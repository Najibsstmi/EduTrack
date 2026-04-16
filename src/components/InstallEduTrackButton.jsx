import { useEffect, useMemo, useState } from 'react'

function isStandaloneMode() {
  const isDisplayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
  const isIosStandalone = window.navigator.standalone === true

  return isDisplayModeStandalone || isIosStandalone
}

export default function InstallEduTrackButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode())
  const isIphone = useMemo(() => {
    const userAgent = window.navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(userAgent)
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      console.log('beforeinstallprompt fired')
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

  const handleButtonClick = async () => {
    if (isInstalled) return

    if (isIphone) {
      alert('Di iPhone: buka dalam Safari, tekan Share, kemudian pilih Add to Home Screen.')
      return
    }

    if (deferredPrompt) {
      await handleInstall()
      return
    }

    alert('Jika tiada butang install automatik, semak menu browser atau ikon install pada address bar.')
  }

  let buttonLabel = 'App boleh dipasang dari menu browser'

  if (isInstalled) {
    buttonLabel = 'EduTrack telah dipasang'
  } else if (isIphone) {
    buttonLabel = 'Cara pasang di iPhone'
  } else if (deferredPrompt) {
    buttonLabel = 'Pasang EduTrack'
  }

  return (
    <button
      type="button"
      onClick={handleButtonClick}
      disabled={isInstalled}
      className={`fixed bottom-4 right-4 z-50 inline-flex items-center rounded-full border px-5 py-3 text-sm font-bold shadow-lg transition ${
        isInstalled
          ? 'cursor-default border-slate-200 bg-slate-200 text-slate-600 shadow-slate-200'
          : 'border-slate-900 bg-slate-900 text-white shadow-slate-300 hover:-translate-y-0.5 hover:bg-slate-800'
      }`}
    >
      {buttonLabel}
    </button>
  )
}