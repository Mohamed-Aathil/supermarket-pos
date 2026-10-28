import { create } from 'zustand'
import {
  discardFailedSales,
  enqueueSale,
  getQueueCounts,
  retryFailedSales,
  syncPendingSales,
} from '../lib/sync'
import { api } from '../lib/api'
import { fromPaise, toPaise } from '../lib/format'
import { useCatalogStore } from './useCatalogStore'

const totalsOf = (items) => {
  let paise = 0
  let count = 0
  for (const i of items) {
    paise += toPaise(i.price) * i.qty
    count += i.qty
  }
  return { total: fromPaise(paise), itemCount: count }
}

const withTotals = (items) => ({ items, ...totalsOf(items) })

/**
 * Live cart + the offline sale queue (the queue itself lives in IndexedDB,
 * see lib/sync.js; this store just exposes its counts and the actions).
 */
export const useCartStore = create((set, get) => ({
  // ---- live cart
  items: [], // { id, barcode, name, price, qty, stock, product }
  total: 0,
  itemCount: 0,

  // ---- checkout state
  checkingOut: false,
  checkoutError: null, // { message, canOverride }

  // ---- offline queue state
  pendingCount: 0,
  failedCount: 0,
  syncing: false,

  addProduct: (product, qty = 1) =>
    set((s) => {
      const existing = s.items.find((i) => i.id === product.id)
      const items = existing
        ? s.items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + qty } : i))
        : [
            {
              id: product.id,
              barcode: product.barcode,
              name: product.name,
              price: Number(product.selling_price),
              qty,
              stock: product.stock_quantity,
              product: { name: product.name, category: product.category, image_url: product.image_url },
            },
            ...s.items, // newest on top, so the glide-in is visible
          ]
      return { ...withTotals(items), checkoutError: null }
    }),

  setQty: (id, qty) =>
    set((s) => {
      const items =
        qty <= 0 ? s.items.filter((i) => i.id !== id) : s.items.map((i) => (i.id === id ? { ...i, qty } : i))
      return { ...withTotals(items), checkoutError: null }
    }),

  increment: (id) => {
    const line = get().items.find((i) => i.id === id)
    if (line) get().setQty(id, line.qty + 1)
  },

  decrement: (id) => {
    const line = get().items.find((i) => i.id === id)
    if (line) get().setQty(id, line.qty - 1)
  },

  remove: (id) => get().setQty(id, 0),

  clear: () => set({ ...withTotals([]), checkoutError: null }),

  /**
   * Complete the sale.
   *  - online: POST /checkout (server is the source of truth for stock).
   *  - can't reach the server: store the sale in IndexedDB and carry on; the
   *    sync loop pushes it later. The customer never waits on the network.
   * Resolves { status: 'synced' | 'queued', sale? } or { status: 'rejected' }.
   */
  checkout: async ({ allowOversell = false } = {}) => {
    const { items, total, checkingOut } = get()
    if (!items.length || checkingOut) return { status: 'empty' }
    set({ checkingOut: true, checkoutError: null })

    const catalog = useCatalogStore.getState()
    const lines = items.map((i) => ({ product_id: i.id, quantity: i.qty, unit_price: i.price }))
    const clientRef = crypto.randomUUID()
    const payload = { client_ref: clientRef, items: lines, allow_oversell: allowOversell }

    const queueIt = async () => {
      await enqueueSale(
        { ...payload, offline: true, sold_at: new Date().toISOString() },
        total,
      )
      await catalog.deductLocally(lines)
      get().clear()
      await get().refreshQueue()
      set({ checkingOut: false })
      return { status: 'queued' }
    }

    // Browser already knows it's offline: don't make the cashier wait for a timeout.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return queueIt()

    try {
      const sale = await api.checkout(payload)
      await catalog.applyStockUpdates(sale.stock_updates)
      get().clear()
      set({ checkingOut: false })
      return { status: 'synced', sale }
    } catch (err) {
      if (err.isNetwork) return queueIt() // same client_ref => the server de-duplicates a lost reply
      set({
        checkingOut: false,
        checkoutError: { message: err.message, canOverride: err.status === 409 },
      })
      return { status: 'rejected', error: err }
    }
  },

  // ---- offline queue actions
  refreshQueue: async () => {
    const { pending, failed } = await getQueueCounts()
    set({ pendingCount: pending, failedCount: failed })
  },

  syncNow: async () => {
    if (get().syncing) return
    set({ syncing: true })
    try {
      const result = await syncPendingSales()
      await get().refreshQueue()
      // Server stock is the truth again once queued sales have landed.
      if (result.synced > 0) await useCatalogStore.getState().load()
      return result
    } finally {
      set({ syncing: false })
    }
  },

  retryFailed: async () => {
    await retryFailedSales()
    await get().syncNow()
  },

  discardFailed: async () => {
    await discardFailedSales()
    await get().refreshQueue()
  },
}))
