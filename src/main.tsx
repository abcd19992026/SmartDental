import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

// index.html's inline script sets data-app on every route except a logged-out visit to "/",
// where the static landing page in index.html is shown instead and React stays unmounted.
if (document.documentElement.hasAttribute('data-app')) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
