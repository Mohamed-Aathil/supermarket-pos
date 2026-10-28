import { memo } from 'react'
import { motion } from 'framer-motion'
import { formatNumber } from '../lib/format'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** One odometer wheel: a 0-9 strip that slides so the wanted digit sits in the window. */
const Wheel = memo(function Wheel({ digit }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block overflow-hidden align-bottom"
      style={{ height: '1em', width: '0.6em', lineHeight: 1 }}
    >
      <motion.span
        className="absolute left-0 top-0 flex w-full flex-col"
        initial={false}
        animate={{ y: `${-digit * 10}%` }} // % of the strip's own 10em height
        transition={{ type: 'spring', stiffness: 170, damping: 22, mass: 0.9 }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block text-center" style={{ height: '1em', lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  )
})

/**
 * Rolling-number display. Every digit is its own wheel, so 1,249.50 -> 1,312.00
 * rolls only the digits that changed. Wheels are keyed from the RIGHT, so the
 * ones/tens/hundreds wheels keep their identity when a digit is added.
 *
 *   <RollingNumber value={total} decimals={2} prefix="₹" className="text-4xl font-bold" />
 */
export default function RollingNumber({ value, decimals = 0, prefix = '', suffix = '', className = '' }) {
  const text = formatNumber(value, decimals)
  const chars = [...text]

  return (
    <span
      className={`inline-flex items-end tabular-nums ${className}`}
      style={{ lineHeight: 1 }}
      aria-label={`${prefix}${text}${suffix}`}
      role="text"
    >
      {prefix && <span aria-hidden="true">{prefix}</span>}
      {chars.map((ch, i) => {
        const fromRight = chars.length - i
        return /\d/.test(ch) ? (
          <Wheel key={`d${fromRight}`} digit={Number(ch)} />
        ) : (
          <span key={`s${fromRight}`} aria-hidden="true" style={{ width: '0.3em', textAlign: 'center' }}>
            {ch}
          </span>
        )
      })}
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  )
}
