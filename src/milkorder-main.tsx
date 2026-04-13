import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MilkOrderApp from './MilkOrderApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MilkOrderApp />
  </StrictMode>,
)
