import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useCartStore } from '../store/useCartStore'
import { useCatalogStore } from '../store/useCatalogStore'
import { beep } from '../lib/beep'
import { formatMoney } from '../lib/format'
import ProductGrid from './ProductGrid'
import Cart from './Cart'

const TOAST_STYLES = {
  ok: 'bg-emerald-600 text-white',
  warn: 'bg-amber-500 text-white',
  error: 'bg-rose-600 text-white',
}

/**
 * POS counter: split-screen (product grid | cart) with a global barcode
 * listener. The scanner works wherever focus happens to be on this screen.
 */
export default function POSTerminal() {
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState(null)
  const searchRef = useRef(null)
  const toastTimer = useRef(null)

  const addProduct = useCartStore((s) => s.addProduct)
  const checkout = useCartStore((s) => s.checkout)
  const findByBarcode = useCatalogStore((s) => s.findByBarcode)

  const showToast = useCallback((kind, text) => {
    clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), kind, text })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ---- barcode scanner (global, no focused input required)
  const handleScan = useCallback(
    async (code) => {
      setQuery('') // the burst may have landed in the search box
      const product = await findByBarcode(code)
      if (product) {
        addProduct(product)
        beep(true)
        showToast('ok', `${product.name} added`)
      } else {
        beep(false)
        showToast('error', `Unknown barcode ${code}`)
      }
    },
    [addProduct, findByBarcode, showToast],
  )
  useBarcodeScanner(handleScan)

  // ---- charge
  const handleCharge = useCallback(
    async (options) => {
      const result = await checkout(options)
      if (result.status === 'synced') {
        showToast('ok', `Sale #${result.sale.sale_id} complete · ${formatMoney(result.sale.total_amount)}`)
      } else if (result.status === 'queued') {
        showToast('warn', 'No connection - sale saved on this device and will sync automatically')
      }
      searchRef.current?.focus()
    },
    [checkout, showToast],
  )

  // ---- keyboard shortcuts: F2 search, F9 charge, Esc clear
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'F9') {
        e.preventDefault()
        handleCharge()
      } else if (e.key === 'Escape') {
        setQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCharge])

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:flex-row">
      <div className="min-h-0 flex-1 border-slate-200 lg:border-r">
        <ProductGrid query={query} onQueryChange={setQuery} searchRef={searchRef} onAdd={addProduct} />
      </div>
      <div className="h-[46vh] shrink-0 border-t border-slate-200 lg:h-auto lg:w-[420px] lg:border-t-0 xl:w-[460px]">
        <Cart onCharge={handleCharge} />
      </div>

      {/* Wrapper handles centring; framer-motion owns `transform` on the toast itself. */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16 }}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold shadow-xl ${TOAST_STYLES[toast.kind]}`}
              role="status"
            >
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
