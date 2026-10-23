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

const percentText = (rate) => `${(rate * 100).toFixed(1)}%`
const readable = (name) => name.replaceAll('_', ' ')

// Four idea cards for the home page, each quoting its own numbers.
export function buildBrief(zipData, index, category, miles = 2) {
  const labels = CATEGORY_LABELS[category]
  const stats = zipData.categories[category][miles]
  const people = zipData.demographics
  const ca = index?.ca_survival?.[category]
  const ratio = stats.density_ratio
  const ideas = []

  if (ratio != null) {
    const diff = Math.round(Math.abs(1 - ratio) * 100)
    ideas.push({
      tag: 'LOCAL LANDSCAPE',
      title: ratio < 0.95 ? `Room for more ${labels.many} near ${zipData.zip}` : ratio > 1.05 ? `A crowded ${labels.one} corner` : `A balanced ${labels.one} scene`,
      description: `${stats.competitors} ${labels.many} within ${miles} mi, ${diff ? `${diff}% ${ratio < 1 ? 'fewer' : 'more'}` : 'about the same'} per km² than the surrounding 10 km.`,
      icon: '⌕',
    })
  }
  ideas.push({
    tag: 'COMPETITION',
    title: `${stats.independent} of ${stats.competitors} nearby ${labels.many} are independent`,
    description: stats.nearest.length ? `Closest to the center of ${zipData.zip}: ${stats.nearest.slice(0, 3).join(', ')}.` : `No ${labels.many} within ${miles} mi.`,
    icon: '↗',
  })
  if (ca?.ca_most_durable.length) {
    const [best, next] = ca.ca_most_durable
    const worst = ca.ca_least_durable[0]
    ideas.push({
      tag: 'WHAT LASTS',
      title: `${readable(best.category)[0].toUpperCase()}${readable(best.category).slice(1)}s close least often`,
      description: `In California, ${readable(best.category)} (${percentText(best.closure_rate)})${next ? ` and ${readable(next.category)} (${percentText(next.closure_rate)})` : ''} have the lowest closure rates${worst ? `; ${readable(worst.category)} the highest (${percentText(worst.closure_rate)})` : ''}.`,
      icon: '✳',
    })
  }
  if (people.population) {
    ideas.push({
      tag: 'COMMUNITY MIX',
      title: `${people.population.toLocaleString()} neighbors within ${Math.round(people.radius_m / 1609.34)} mi`,
      description: [
        people.median_age && `Median age ${people.median_age}`,
        people.median_household_income && `median household income $${people.median_household_income.toLocaleString()}`,
      ].filter(Boolean).join(', ') + ' (ACS 2019).',
      icon: '◎',
    })
  }
  return ideas.map((idea, i) => ({ ...idea, number: String(i + 1).padStart(2, '0') }))
}
