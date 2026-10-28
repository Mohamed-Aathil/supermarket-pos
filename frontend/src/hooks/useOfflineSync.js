import { useEffect, useState } from 'react'
import { useCartStore } from '../store/useCartStore'
import { useCatalogStore } from '../store/useCatalogStore'

const RETRY_MS = 15_000
const CATALOG_REFRESH_MS = 60_000

/**
 * Background synchronisation. Mount once at the app root.
 *
 *  - on start and whenever the browser regains connectivity: push queued sales
 *  - while sales are waiting: retry every 15 s (navigator.onLine can say
 *    "online" while the shop's server is unreachable, so the event alone
 *    isn't enough)
 *  - every minute: refresh the product catalogue + stock levels
 *
 * Returns { online } for the status indicator.
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const pendingCount = useCartStore((s) => s.pendingCount)

  useEffect(() => {
    const cart = useCartStore.getState()
    cart.refreshQueue().then(() => cart.syncNow())

    const goOnline = () => {
      setOnline(true)
      useCartStore.getState().syncNow()
      useCatalogStore.getState().load()
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (!pendingCount) return undefined
    const id = setInterval(() => useCartStore.getState().syncNow(), RETRY_MS)
    return () => clearInterval(id)
  }, [pendingCount])

  useEffect(() => {
    const id = setInterval(() => {
      if (navigator.onLine && !useCartStore.getState().syncing) useCatalogStore.getState().load()
    }, CATALOG_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  return { online }
}
