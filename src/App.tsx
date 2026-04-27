import { useState } from 'react'
import Header from './components/Header'
import TrustBar from './components/TrustBar'
import Footer from './components/Footer'
import HomeView from './components/HomeView'
import MergeView from './components/MergeView'
import CleanView from './components/CleanView'
import GpxView from './components/GpxView'

export type View =
  | { kind: 'home' }
  | { kind: 'merge'; files: File[] }
  | { kind: 'clean'; file: File }
  | { kind: 'gpx'; file: File }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' })

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <TrustBar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {view.kind === 'home' && <HomeView onSelect={setView} />}
        {view.kind === 'merge' && (
          <MergeView files={view.files} onBack={() => setView({ kind: 'home' })} />
        )}
        {view.kind === 'clean' && (
          <CleanView file={view.file} onBack={() => setView({ kind: 'home' })} />
        )}
        {view.kind === 'gpx' && (
          <GpxView file={view.file} onBack={() => setView({ kind: 'home' })} />
        )}
      </main>
      <Footer />
    </div>
  )
}
