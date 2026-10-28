// Change these two lines to switch currency / digit grouping.
const LOCALE = 'en-IN'
export const CURRENCY_SYMBOL = '₹'

const numberFmt = (decimals) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmt0 = numberFmt(0)
const fmt2 = numberFmt(2)

export const formatNumber = (n, decimals = 0) => (decimals === 0 ? fmt0 : fmt2).format(n || 0)

export const formatMoney = (n) => `${CURRENCY_SYMBOL}${fmt2.format(n || 0)}`

/** Compact axis labels: 12.5k, 3.2L (lakh) is avoided on purpose - keep it simple. */
export const formatCompact = (n) =>
  new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

/** Integer paise arithmetic avoids 0.1 + 0.2 style drift in the cart total. */
export const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100)
export const fromPaise = (paise) => paise / 100
