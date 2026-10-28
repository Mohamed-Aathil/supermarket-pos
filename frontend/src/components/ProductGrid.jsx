import { memo, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useCatalogStore } from '../store/useCatalogStore'
import { formatMoney } from '../lib/format'
import ProductImage from './ProductImage'

const MAX_VISIBLE = 200 // plenty for a screen; keeps rendering instant on big catalogues

const ProductCard = memo(function ProductCard({ product, onAdd }) {
  const low = product.stock_quantity < product.low_stock_threshold
  const out = product.stock_quantity <= 0

  return (
    <motion.button
      type="button"
      onClick={() => onAdd(product)}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -3 }}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-shadow hover:shadow-lg ${
        low ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 hover:border-emerald-300'
      }`}
    >
      <div className="relative">
        <ProductImage product={product} className="aspect-[4/3] w-full" />
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums shadow ${
            out ? 'bg-rose-600 text-white' : low ? 'bg-rose-100 text-rose-700' : 'bg-white/90 text-slate-600'
          }`}
        >
          {out ? 'Out of stock' : `${product.stock_quantity} left`}
        </span>
        <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-emerald-600 text-lg font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
          +
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1 p-3">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{product.name}</span>
        <span className="flex items-baseline justify-between">
          <span className="text-base font-extrabold tabular-nums text-emerald-700">
            {formatMoney(product.selling_price)}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{product.category}</span>
        </span>
      </div>
    </motion.button>
  )
})

/** Fast-search product grid (left pane of the POS). */
export default function ProductGrid({ query, onQueryChange, searchRef, onAdd }) {
  const products = useCatalogStore((s) => s.products)
  const loaded = useCatalogStore((s) => s.loaded)
  const [category, setCategory] = useState('All')

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category))], [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(
      (p) =>
        (category === 'All' || p.category === category) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.category.toLowerCase().includes(q)),
    )
  }, [products, query, category])

  const visible = filtered.slice(0, MAX_VISIBLE)

  const onKeyDown = (e) => {
    // Human Enter in the search box: add the product if the search narrowed to exactly one.
    // (Scanner Enters never reach here - useBarcodeScanner swallows them.)
    if (e.key === 'Enter' && filtered.length === 1) {
      onAdd(filtered[0])
      onQueryChange('')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white p-4">
        <div className="relative">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search products, or just scan a barcode…   (F2)"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pr-10 text-base outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                category === c
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
        {!loaded ? (
          <p className="py-16 text-center text-slate-500">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="py-16 text-center text-slate-500">
            No products yet. Add some via the API (<code>/docs</code>) or run <code>python -m app.seed</code>.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-slate-500">Nothing matches “{query}”.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={onAdd} />
              ))}
            </div>
            {filtered.length > visible.length && (
              <p className="mt-4 text-center text-sm text-slate-500">
                Showing {visible.length} of {filtered.length} - keep typing to narrow it down.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
