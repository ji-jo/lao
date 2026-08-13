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
import { emitProjectSvg } from '@/export/code/emitSvg'
import { emitProjectReact } from '@/export/code/emitReact'
import { emitProjectSceneJson } from '@/export/code/sceneJson'
import { analyzeProjectExport } from '@/export/code/capabilities'

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
    __laoExport: {
      emitProjectSvg,
      emitProjectReact,
      emitProjectSceneJson,
      describeProject: analyzeProjectExport,
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
