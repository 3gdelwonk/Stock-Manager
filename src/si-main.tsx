import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SIApp from './SIApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SIApp />
  </StrictMode>,
)
