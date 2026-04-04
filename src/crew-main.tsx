import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CrewApp from './CrewApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrewApp />
  </StrictMode>,
)
