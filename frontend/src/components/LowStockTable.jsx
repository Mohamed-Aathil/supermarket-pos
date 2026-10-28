import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCatalogStore } from '../store/useCatalogStore'

/**
 * Low Stock Alerts. Reads the live catalogue store, so it updates the moment a
 * sale (online or offline) changes a stock figure - and keeps working offline.
 * A product is flagged red when stock_quantity < low_stock_threshold.
 */
export default function LowStockTable() {
  const products = useCatalogStore((s) => s.products)

  const alerts = useMemo(
    () =>
      products
        .filter((p) => p.stock_quantity < p.low_stock_threshold)
        // worst first: out of stock, then the largest relative shortfall
        .sort(
          (a, b) =>
            a.stock_quantity / Math.max(a.low_stock_threshold, 1) -
            b.stock_quantity / Math.max(b.low_stock_threshold, 1),
        ),
    [products],
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Low stock alerts</h3>
          <p className="text-sm text-slate-500">Products below their reorder threshold</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
            alerts.length ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {alerts.length}
        </span>
      </header>

      {alerts.length === 0 ? (
        <p className="px-5 py-10 text-center text-slate-500">✅ Everything is above its threshold.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Product</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 text-right font-semibold">In stock</th>
                <th className="px-3 py-2.5 text-right font-semibold">Threshold</th>
                <th className="px-5 py-2.5 text-right font-semibold">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {alerts.map((p) => {
                  const out = p.stock_quantity <= 0
                  return (
                    <motion.tr
                      key={p.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-rose-100 bg-rose-50 text-rose-900"
                    >
                      <td className="px-5 py-3 font-semibold">
                        {p.name}
                        {out && (
                          <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                            Out of stock
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">{p.category}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-rose-700">
                        {p.stock_quantity}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{p.low_stock_threshold}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {p.low_stock_threshold - p.stock_quantity}
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
