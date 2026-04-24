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
  const shouldShowInstallButton = !isInstalled

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

  useEffect(() => {
    document.body.classList.toggle('has-install-prompt', shouldShowInstallButton)

    return () => {
      document.body.classList.remove('has-install-prompt')
    }
  }, [shouldShowInstallButton])

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

  if (!shouldShowInstallButton) return null

  return (
    <button
      type="button"
      onClick={handleButtonClick}
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-center text-sm font-bold leading-tight text-white shadow-xl shadow-slate-300/80 transition hover:-translate-y-0.5 hover:bg-slate-800 sm:left-auto sm:right-4 sm:w-auto sm:rounded-full sm:px-5"
    >
      {buttonLabel}
    </button>
  )
}
