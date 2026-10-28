import { useEffect, useRef } from 'react'

/**
 * Global USB / Bluetooth barcode-scanner listener - no text box needs focus.
 *
 * Scanners behave like a keyboard that types a whole code in a few
 * milliseconds and finishes with Enter. We tell that apart from a human by
 * timing: if two keystrokes are more than `maxGapMs` apart, the buffer is
 * thrown away and starts again. So only an uninterrupted burst of at least
 * `minLength` characters followed by Enter counts as a scan.
 *
 * The listener runs in the CAPTURE phase and swallows the final Enter, so a
 * scan can't "click" a focused button (e.g. Charge) or submit a form. If the
 * scan happens to land in the search box, the caller clears it in `onScan`.
 */
export function useBarcodeScanner(onScan, { enabled = true, minLength = 4, maxGapMs = 80 } = {}) {
  const handlerRef = useRef(onScan)
  useEffect(() => {
    handlerRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return undefined

    let buffer = ''
    let lastKeyAt = 0

    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return // shortcuts, not scanner input

      if (e.key === 'Enter') {
        const code = buffer
        buffer = ''
        lastKeyAt = 0
        if (code.length >= minLength) {
          e.preventDefault()
          e.stopPropagation()
          handlerRef.current?.(code)
        }
        return
      }

      if (e.key.length !== 1) return // Shift, arrows, F-keys, ...

      const now = performance.now()
      if (lastKeyAt && now - lastKeyAt > maxGapMs) buffer = '' // too slow => a human typing
      buffer += e.key
      lastKeyAt = now
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, minLength, maxGapMs])
}
