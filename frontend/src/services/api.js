// Calls to the FastAPI backend (backend/), proxied by Vite in development.
async function post(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`${path} failed (${response.status})`)
  return response.json()
}

// The backend analyzes four business types; anything else gets no AI strategies.
export function backendBusinessType(businessType, category) {
  const text = businessType.toLowerCase()
  if (/\bbak(ery|eries|er)\b|\bdonut|\bpastr/.test(text)) return 'bakery'
  if (/\bbooks?(tore|shop)?\b/.test(text)) return 'bookstore'
  if (category === 'cafe') return 'coffee_shop'
  if (category === 'restaurant') return 'restaurant'
  return null
}

export function fetchStrategies({ businessType, center, radiusMiles }, { signal } = {}) {
  return post('/api/analyze', {
    business_type: businessType,
    location: { latitude: center[0], longitude: center[1] },
    radius_m: Math.min(5000, Math.max(100, Math.round(radiusMiles * 1609.34))),
  }, signal)
}

export function sendChat(messages, context, { signal } = {}) {
  return post('/api/chat', { messages, context }, signal)
}
