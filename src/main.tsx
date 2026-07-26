import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-nano-scrollbar/dist/index.css'
import './index.css'
import App from './App.tsx'
import { useProject } from '@/state/project'
import { usePlayback } from '@/state/playback'
import { useTools } from '@/state/tools'
import { useSelection } from '@/state/selection'
import { useViewport } from '@/state/viewport'

if (import.meta.env.DEV) {
  // dev console handle: window.__lao.project.getState() etc.
  Object.assign(window, {
    __lao: {
      project: useProject,
      playback: usePlayback,
      tools: useTools,
      selection: useSelection,
      viewport: useViewport,
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
