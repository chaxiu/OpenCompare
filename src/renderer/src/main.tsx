import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './assets/main.css'

const container = document.getElementById('root')
if (!container) throw new Error('Renderer root element #root is missing.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
