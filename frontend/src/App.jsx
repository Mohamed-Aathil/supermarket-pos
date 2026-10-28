import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useOfflineSync } from './hooks/useOfflineSync'
import { useCartStore } from './store/useCartStore'
import { useCatalogStore } from './store/useCatalogStore'
import POSTerminal from './components/POSTerminal'
import Dashboard from './components/Dashboard'

const TABS = [
  { id: 'pos', label: 'Counter' },
  { id: 'dashboard', label: 'Dashboard' },
]

const tabFromHash = () => (window.location.hash === '#dashboard' ? 'dashboard' : 'pos')

function ConnectionStatus({ online }) {
  const source = useCatalogStore((s) => s.source)
  const pending = useCartStore((s) => s.pendingCount)
  const failed = useCartStore((s) => s.failedCount)
  const syncing = useCartStore((s) => s.syncing)
  const syncNow = useCartStore((s) => s.syncNow)
  const retryFailed = useCartStore((s) => s.retryFailed)
  const discardFailed = useCartStore((s) => s.discardFailed)

  // "cache" means the last catalogue refresh failed even though the browser thinks it's online.
  const offline = !online || source === 'cache'

  return (
    <div className="flex items-center gap-2 text-sm">
      {failed > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-rose-100 py-1 pl-3 pr-1 font-semibold text-rose-700">
          {failed} sale{failed > 1 ? 's' : ''} failed to sync
          <button onClick={retryFailed} className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white hover:bg-rose-700">
            Retry
          </button>
          <button
            onClick={() => window.confirm('Discard these sales? They will NOT be recorded.') && discardFailed()}
            className="rounded-full px-2 py-0.5 text-xs hover:bg-rose-200"
          >
            Discard
          </button>
        </span>
      )}
      {pending > 0 && (
        <button
          onClick={syncNow}
          disabled={syncing || offline}
          className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-70"
          title="Sales saved on this device, waiting to upload"
        >
          {syncing ? 'Syncing…' : `${pending} waiting to sync`}
        </button>
      )}
      <span
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
          offline ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        {offline ? 'Offline mode' : 'Online'}
      </span>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState(tabFromHash)
  const { online } = useOfflineSync()

  useEffect(() => {
    useCatalogStore.getState().load()
  }, [])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id) => {
    window.location.hash = id === 'pos' ? '' : id
    setTab(id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-800/20 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">🛒</span>
            Supermarket POS
          </h1>
          <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className="relative rounded-lg px-4 py-1.5 text-sm font-semibold"
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-lg bg-white shadow"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <span className={`relative ${tab === t.id ? 'text-emerald-700' : 'text-slate-500'}`}>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <ConnectionStatus online={online} />
      </header>

      <main className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {tab === 'pos' ? <POSTerminal /> : <Dashboard />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
