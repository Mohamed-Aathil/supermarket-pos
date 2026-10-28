import { create } from 'zustand'
import { api } from '../lib/api'
import { db } from '../lib/db'

const byName = (a, b) => a.name.localeCompare(b.name)

/** Units already sold at the till but not yet pushed to the server, per product. */
async function pendingUnitsByProduct() {
  const owed = {}
  const rows = await db.pendingSales.where('status').equals('pending').toArray()
  for (const sale of rows) {
    for (const line of sale.payload.items) {
      owed[line.product_id] = (owed[line.product_id] || 0) + line.quantity
    }
  }
  return owed
}

/**
 * The product catalogue as the till sees it. Always readable (it is mirrored
 * into IndexedDB), so scanning and searching work with no connection.
 */
export const useCatalogStore = create((set, get) => ({
  products: [],
  loaded: false,
  loading: false,
  source: 'none', // 'network' | 'cache'
  error: null,

  /** Refresh from the server; fall back to the IndexedDB copy if that fails. */
  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const fresh = await api.listProducts()
      // The server doesn't know about offline sales yet, so take them off the
      // stock figures locally or the numbers would "jump back up" on refresh.
      const owed = await pendingUnitsByProduct()
      const products = fresh
        .map((p) => (owed[p.id] ? { ...p, stock_quantity: p.stock_quantity - owed[p.id] } : p))
        .sort(byName)
      await db.transaction('rw', db.products, async () => {
        await db.products.clear()
        await db.products.bulkPut(products)
      })
      set({ products, loaded: true, loading: false, source: 'network', error: null })
    } catch (err) {
      const cached = (await db.products.toArray()).sort(byName)
      set({
        products: cached,
        loaded: true,
        loading: false,
        source: 'cache',
        error: cached.length ? null : err.message,
      })
    }
  },

  /** Indexed lookup for scanner input; asks the server only if it's not cached. */
  findByBarcode: async (code) => {
    const local = await db.products.where('barcode').equals(code).first()
    if (local) return local
    try {
      const product = await api.getProductByBarcode(code)
      await db.products.put(product)
      set((s) => ({ products: [...s.products, product].sort(byName) }))
      return product
    } catch {
      return null
    }
  },

  /** Authoritative stock levels returned by /checkout. */
  applyStockUpdates: async (updates) => {
    if (!updates?.length) return
    const stock = new Map(updates.map((u) => [u.product_id, u.stock_quantity]))
    set((s) => ({
      products: s.products.map((p) =>
        stock.has(p.id) ? { ...p, stock_quantity: stock.get(p.id) } : p,
      ),
    }))
    await db.transaction('rw', db.products, async () => {
      for (const [id, qty] of stock) await db.products.update(id, { stock_quantity: qty })
    })
  },

  /** Optimistic local deduction for a sale that was queued offline. */
  deductLocally: async (lines) => {
    const sold = new Map()
    for (const l of lines) sold.set(l.product_id, (sold.get(l.product_id) || 0) + l.quantity)
    set((s) => ({
      products: s.products.map((p) =>
        sold.has(p.id) ? { ...p, stock_quantity: p.stock_quantity - sold.get(p.id) } : p,
      ),
    }))
    await db.transaction('rw', db.products, async () => {
      for (const [id, qty] of sold) {
        const p = await db.products.get(id)
        if (p) await db.products.update(id, { stock_quantity: p.stock_quantity - qty })
      }
    })
  },
}))
