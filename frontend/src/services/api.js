const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function apiRequest(path, body, { signal } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 240000)
  try {
    const response = await fetch(`${API_BASE}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    })
    if (!(response.headers.get('content-type') ?? '').includes('json')) {
      throw new Error('API did not return JSON. Check VITE_API_BASE_URL and the FastAPI server.')
    }
    const data = await response.json()
    if (!response.ok) {
      const error = new Error(data.detail?.message ?? (typeof data.detail === 'string' ? data.detail : `API request failed (${response.status}). Check your inputs and server configuration.`))
      error.status = response.status
      throw error
    }
    return data
  } catch (error) {
    if (error.name === 'AbortError' && !signal?.aborted) throw new Error('API request timed out. Try again; the previous request may have completed.', { cause: error })
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function businessCategory(text) {
  const normalized = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(bakery|bakeries)\b/.test(normalized)) return 'bakery'
  if (/\b(bookstore|book store|books)\b/.test(normalized)) return 'bookstore'
  if (/\b(coffee|cafe|café)\b/.test(normalized)) return 'coffee_shop'
  if (/\b(restaurant|pizza|taco|burger|sushi|diner|grill|food|ramen)\b/.test(normalized)) return 'restaurant'
  throw new Error('Live analysis currently supports coffee shops, restaurants, bakeries, and bookstores. Please enter one of these business types.')
}

export function zoneCenter(feature) {
  const ring = feature.geometry.coordinates[0].slice(0, -1)
  return {
    latitude: ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
    longitude: ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
  }
}
