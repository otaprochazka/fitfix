import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from './components/Header'
import TrustBar from './components/TrustBar'
import Footer from './components/Footer'
import HomeView from './components/HomeView'
import MergeView from './components/MergeView'
import CleanView from './components/CleanView'
import GpxView from './components/GpxView'
import EditorView from './components/EditorView'
import ErrorBoundary from './components/ErrorBoundary'
import { UndoRedoGroup } from './components/editor/UndoRedoGroup'

export type View =
  | { kind: 'home' }
  | { kind: 'editor'; file: File; mergeWith?: File[]; resumeId?: string; openTool?: string }
  | { kind: 'merge'; files: File[] }
  | { kind: 'clean'; file: File }
  | { kind: 'gpx'; file: File }

interface ToolCrumb {
  id: string
  title: string
  icon: string
}

export interface EditorHistoryState {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export default function App() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>({ kind: 'home' })
  const [tool, setTool] = useState<ToolCrumb | null>(null)
  // Editor publishes its undo/redo state up so we can render the controls
  // inside the breadcrumb row instead of in the page body.
  const [history, setHistory] = useState<EditorHistoryState | null>(null)
  // Bumped when the breadcrumb asks the editor to leave its tool subpage.
  // EditorView watches this counter and resets its internal mode to 'overview'.
  const [clearToolSignal, setClearToolSignal] = useState(0)
  const goHome = () => { setTool(null); setHistory(null); setView({ kind: 'home' }) }
  const clearTool = () => { setTool(null); setClearToolSignal(c => c + 1) }

  const sectionLabel = (() => {
    switch (view.kind) {
      case 'home': return undefined
      case 'editor': return undefined
      case 'merge': return t('nav.section.merge')
      case 'clean': return t('nav.section.clean')
      case 'gpx': return t('nav.section.gpx')
    }
  })()

  const detailLabel = (() => {
    switch (view.kind) {
      case 'editor':
        return `${t('nav.section.editor')} (${view.file.name})`
      case 'clean':
      case 'gpx': return view.file.name
      case 'merge': return view.files.length > 0 ? `${view.files.length} files` : undefined
      default: return undefined
    }
  })()

  // The editor's tool subpage is the third crumb; clicking the file name (or
  // home) clears it via the breadcrumb's onClearTool.
  const detailIsClickable = view.kind === 'editor' && tool != null
  const detailTitle = view.kind === 'editor' ? view.file.name : detailLabel

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-[1100]">
        <Header />
        <TrustBar
          onBack={view.kind === 'home' ? undefined : goHome}
          sectionLabel={sectionLabel}
          detailLabel={detailLabel}
          detailTitle={detailTitle}
          detailIsClickable={detailIsClickable}
          onClearTool={clearTool}
          toolLabel={tool ? `${tool.icon} ${tool.title}` : undefined}
          rightSlot={view.kind === 'editor' && history ? (
            <UndoRedoGroup
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.onUndo}
              onRedo={history.onRedo}
            />
          ) : undefined}
        />
      </div>
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6">
        <ErrorBoundary>
          {view.kind === 'home' && <HomeView onSelect={setView} />}
          {view.kind === 'editor' && (
            <EditorView
              file={view.file}
              mergeWith={view.mergeWith}
              resumeId={view.resumeId}
              openTool={view.openTool}
              onBack={goHome}
              onToolChange={setTool}
              onHistoryChange={setHistory}
              clearToolSignal={clearToolSignal}
            />
          )}
          {view.kind === 'merge' && <MergeView files={view.files} onBack={goHome} />}
          {view.kind === 'clean' && <CleanView file={view.file} onBack={goHome} />}
          {view.kind === 'gpx' && <GpxView file={view.file} onBack={goHome} />}
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}
