// Static files written by `python3 -m data.export` into public/data.
let indexPromise

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Data request failed (${response.status})`)
  }
  // The dev server answers unknown paths with index.html, so check the type too.
  if (!(response.headers.get('content-type') ?? '').includes('json')) return null
  return response.json()
}

export function fetchZipData(zipCode, { signal } = {}) {
  return fetchJson(`/data/zip/${zipCode}.json`, signal)
}

export function fetchDataIndex() {
  indexPromise ??= fetchJson('/data/index.json').catch((error) => {
    indexPromise = undefined
    throw error
  })
  return indexPromise
}

const CATEGORY_WORDS = [
  // Checked first so "barber shop" and "auto repair shop" aren't retail.
  ['services', ['barber', 'salon', 'nail', 'repair', 'auto', 'spa', 'tattoo', 'laundry', 'laundromat', 'cleaner', 'tutor', 'gym', 'fitness', 'studio', 'tax', 'insurance', 'dentist', 'clinic', 'groomer']],
  ['cafe', ['coffee', 'cafe', 'tea', 'boba', 'bakery', 'donut', 'dessert', 'juice', 'smoothie', 'ice cream', 'yogurt']],
  ['restaurant', ['restaurant', 'food', 'pizza', 'taco', 'burger', 'sushi', 'grill', 'diner', 'steakhouse', 'bar', 'kitchen', 'bbq', 'ramen', 'pho', 'catering']],
  ['retail', ['shop', 'store', 'boutique', 'retail', 'market', 'grocery', 'clothing', 'books', 'bookstore', 'florist', 'gift']],
]

// Map free-text business type to one of the four data categories. Whole words only,
// so "barbershop" isn't a bar and "steakhouse" isn't tea.
export function matchCategory(businessType) {
  const text = businessType.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // café -> cafe
  for (const [category, words] of CATEGORY_WORDS) {
    if (words.some((word) => new RegExp(`\\b${word}(s|es)?\\b`).test(text))) return category
  }
  return 'services'
}

export const CATEGORY_LABELS = {
  cafe: { one: 'cafe', many: 'cafes' },
  restaurant: { one: 'restaurant', many: 'restaurants' },
  retail: { one: 'retail shop', many: 'retail shops' },
  services: { one: 'service business', many: 'service businesses' },
}

// The export has numbers for 1, 2 and 3 miles; use the closest one.
export function dataRadius(radiusMiles) {
  return Math.min(3, Math.max(1, Math.round(radiusMiles)))
}
