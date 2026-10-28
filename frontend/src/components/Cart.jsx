import { AnimatePresence, motion } from 'framer-motion'
import { useCartStore } from '../store/useCartStore'
import { formatMoney } from '../lib/format'
import RollingNumber from './RollingNumber'
import ProductImage from './ProductImage'

function CartLine({ item }) {
  const increment = useCartStore((s) => s.increment)
  const decrement = useCartStore((s) => s.decrement)
  const remove = useCartStore((s) => s.remove)
  const overStock = item.qty > item.stock

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: 96, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -96, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <ProductImage
          product={item.product}
          className="h-12 w-12 shrink-0 rounded-lg"
          emojiSize="text-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
          <p className="text-xs text-slate-500 tabular-nums">{formatMoney(item.price)} each</p>
        </div>
        <p className="shrink-0 text-base font-extrabold tabular-nums text-slate-900">
          {formatMoney(item.price * item.qty)}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => decrement(item.id)}
            aria-label={`One less ${item.name}`}
            className="h-9 w-9 rounded-lg bg-slate-100 text-lg font-semibold text-slate-700 hover:bg-slate-200 active:scale-95"
          >
            −
          </button>
          <motion.span
            key={item.qty} // re-mount on change => little "pop" whenever the quantity moves
            initial={{ scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="inline-block w-10 text-center text-base font-bold tabular-nums"
          >
            {item.qty}
          </motion.span>
          <button
            type="button"
            onClick={() => increment(item.id)}
            aria-label={`One more ${item.name}`}
            className="h-9 w-9 rounded-lg bg-slate-100 text-lg font-semibold text-slate-700 hover:bg-slate-200 active:scale-95"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2">
          {overStock && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              only {Math.max(item.stock, 0)} in stock
            </span>
          )}
          <button
            type="button"
            onClick={() => remove(item.id)}
            aria-label={`Remove ${item.name}`}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            Remove
          </button>
        </div>
      </div>
    </motion.li>
  )
}

/** Active cart (right pane of the POS). */
export default function Cart({ onCharge }) {
  const items = useCartStore((s) => s.items)
  const total = useCartStore((s) => s.total)
  const itemCount = useCartStore((s) => s.itemCount)
  const clear = useCartStore((s) => s.clear)
  const checkingOut = useCartStore((s) => s.checkingOut)
  const error = useCartStore((s) => s.checkoutError)

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-100/70">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current sale</h2>
          <p className="text-sm text-slate-600">
            <RollingNumber value={itemCount} className="font-bold text-slate-900" />{' '}
            {itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={!items.length}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-30"
        >
          Clear
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
            <span className="text-5xl">🛒</span>
            <p className="font-medium">Cart is empty</p>
            <p className="text-sm">Scan a barcode or tap a product</p>
          </div>
        ) : (
          <ul className="relative space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <CartLine key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <footer className="space-y-3 border-t border-slate-200 bg-white p-4">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <p className="font-semibold">Couldn't complete the sale</p>
                <p className="mt-0.5">{error.message}</p>
                {error.canOverride && (
                  <button
                    type="button"
                    onClick={() => onCharge({ allowOversell: true })}
                    className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    Sell anyway (stock count is wrong)
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Total</span>
          <RollingNumber value={total} decimals={2} prefix="₹" className="text-4xl font-extrabold text-slate-900" />
        </div>

        <motion.button
          type="button"
          onClick={() => onCharge()}
          disabled={!items.length || checkingOut}
          whileTap={{ scale: 0.98 }}
          className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {checkingOut ? 'Processing…' : `Charge ${formatMoney(total)}  (F9)`}
        </motion.button>
      </footer>
    </section>
  )
}
