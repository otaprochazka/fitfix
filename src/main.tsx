import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ActivityStoreProvider } from './state/ActivityStore'

// HOTFIX: <StrictMode> intentionally removed.
// The activity prop tree is large (~16k Date objects + a multi-MB Uint8Array
// per merged file). StrictMode's dev-time double-invoke of components and
// effects pushed Firefox tabs into 30s+ commit phases and OOM during merge.
// See docs/engineering/perf-merge-2026-04.md for the full investigation.
// Production builds were never affected (~118 ms end-to-end merge).
// Re-enable StrictMode if/when activity is moved out of React state, or if
// you specifically need its dev-time safety checks for a refactor.
createRoot(document.getElementById('root')!).render(
  <ActivityStoreProvider>
    <App />
  </ActivityStoreProvider>,
)
