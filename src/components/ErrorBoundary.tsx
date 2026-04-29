import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }

    const isCzech = navigator.language.startsWith('cs')

    const title = isCzech ? 'Něco se pokazilo' : 'Something went wrong'
    const body = isCzech
      ? 'Tvůj soubor je v bezpečí v paměti tabu. Zkus tuto stránku obnovit, nebo se vrátit na úvod.'
      : 'Your file is safe in the browser memory. Try reloading this page, or go back to the home screen.'
    const reloadLabel = isCzech ? 'Obnovit stránku' : 'Reload page'
    const homeLabel = isCzech ? 'Zpět na úvod' : 'Back to home'

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/80 shadow-xl p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>⚠️</span>
            <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed">{body}</p>

          {import.meta.env.DEV && (
            <pre className="overflow-auto rounded-lg bg-slate-950 border border-slate-700 text-xs text-red-400 p-4 max-h-48">
              {error.stack ?? error.message}
            </pre>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
            >
              {reloadLabel}
            </button>
            <button
              onClick={() => { this.reset(); window.location.hash = '' }}
              className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              {homeLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
