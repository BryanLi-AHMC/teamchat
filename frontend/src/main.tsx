import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resetTeamchatXp } from './utils/userXp'

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as Window & { resetTeamchatXp: typeof resetTeamchatXp }).resetTeamchatXp = resetTeamchatXp
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
