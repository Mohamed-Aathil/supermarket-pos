import { memo, useState } from 'react'
import { emojiFor, tintFor } from '../lib/productVisual'

/**
 * Product picture. Uses product.image_url when present; otherwise (or if the
 * image fails to load, e.g. offline) draws a category-tinted tile with an emoji.
 * `className` sizes the box; `emojiSize` is a Tailwind text-size class.
 */
function ProductImage({ product, className = '', emojiSize = 'text-5xl' }) {
  const [failed, setFailed] = useState(false)
  const url = product.image_url

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={product.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    )
  }

  const { from, to } = tintFor(product.category)
  return (
    <div
      role="img"
      aria-label={product.name}
      className={`grid place-items-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className={`${emojiSize} drop-shadow-sm select-none`}>{emojiFor(product)}</span>
    </div>
  )
}

export default memo(ProductImage)
