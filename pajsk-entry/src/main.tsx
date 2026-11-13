import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { SessionProvider } from './session/SessionProvider'
import './index.css'

const checkForUpdate = (registration: ServiceWorkerRegistration) => {
  void registration.update().catch((error) => {
    console.warn('Semakan kemas kini PAJSK gagal.', error)
  })
}

registerSW({
  immediate: true,
  onRegisteredSW: (_serviceWorkerUrl, registration) => {
    if (!registration) return

    checkForUpdate(registration)
    window.setInterval(() => checkForUpdate(registration), 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate(registration)
    })
  },
  onRegisterError: (error) => {
    console.error('Pendaftaran kemas kini PAJSK gagal.', error)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>
)
