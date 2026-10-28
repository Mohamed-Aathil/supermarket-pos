// Picks an emoji + colour for a product that has no photo. Keyword match on the
// product name first, then the category, so ANY product you add gets a sensible tile.

const KEYWORDS = [
  [['basmati', 'rice', 'biryani'], '🍚'],
  [['dal', 'lentil', 'chickpea', 'rajma', 'beans'], '🫘'],
  [['atta', 'wheat', 'flour', 'maida'], '🌾'],
  [['oil', 'ghee'], '🫒'],
  [['sugar', 'jaggery'], '🍬'],
  [['salt'], '🧂'],
  [['masala', 'spice', 'chilli', 'chili', 'pepper', 'turmeric'], '🌶️'],
  [['tea'], '🍵'],
  [['coffee'], '☕'],
  [['cola', 'soda', 'soft drink', 'sprite', 'pepsi', 'energy'], '🥤'],
  [['juice'], '🧃'],
  [['water'], '💧'],
  [['milk'], '🥛'],
  [['curd', 'yogurt', 'yoghurt', 'lassi'], '🥣'],
  [['butter'], '🧈'],
  [['paneer', 'cheese'], '🧀'],
  [['egg'], '🥚'],
  [['bread', 'bun', 'toast'], '🍞'],
  [['chip', 'crisps', 'namkeen', 'popcorn'], '🍟'],
  [['chocolate', 'cocoa'], '🍫'],
  [['biscuit', 'cookie', 'cracker'], '🍪'],
  [['noodle', 'pasta', 'maggi'], '🍜'],
  [['ice cream'], '🍨'],
  [['soap'], '🧼'],
  [['shampoo', 'conditioner', 'lotion', 'cream'], '🧴'],
  [['toothpaste', 'toothbrush'], '🪥'],
  [['detergent', 'dish', 'wash', 'cleaner', 'phenyl', 'floor'], '🧽'],
  [['tissue', 'toilet roll', 'napkin'], '🧻'],
  [['banana'], '🍌'],
  [['apple'], '🍎'],
  [['mango'], '🥭'],
  [['orange', 'lemon'], '🍊'],
  [['grape'], '🍇'],
  [['tomato'], '🍅'],
  [['onion'], '🧅'],
  [['potato'], '🥔'],
  [['carrot'], '🥕'],
  [['garlic'], '🧄'],
  [['chicken'], '🍗'],
  [['fish', 'prawn'], '🐟'],
]

const CATEGORY_EMOJI = [
  [['grocery', 'staple'], '🥫'],
  [['beverage', 'drink'], '🥤'],
  [['dairy'], '🥛'],
  [['snack'], '🍿'],
  [['household', 'cleaning'], '🧹'],
  [['personal', 'beauty', 'care'], '🧴'],
  [['produce', 'vegetable', 'fruit'], '🥬'],
  [['bakery'], '🥐'],
  [['frozen'], '🧊'],
  [['meat', 'seafood'], '🥩'],
]

const find = (table, text) => table.find(([keys]) => keys.some((k) => text.includes(k)))?.[1]

export function emojiFor(product) {
  const name = (product.name || '').toLowerCase()
  const cat = (product.category || '').toLowerCase()
  return find(KEYWORDS, name) ?? find(CATEGORY_EMOJI, cat) ?? '📦'
}

/** Stable soft colour per category (same category => same tint). */
export function tintFor(category = '') {
  let h = 0
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) % 360
  return {
    from: `hsl(${h} 85% 94%)`,
    to: `hsl(${(h + 25) % 360} 75% 84%)`,
  }
}
