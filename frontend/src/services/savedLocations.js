const LOCATION_KEY_PREFIX = 'waypoint-saved-locations-v1:'

export function savedLocationId(location) {
  return [
    location.zipCode,
    location.businessType.trim().toLowerCase(),
    Number(location.radiusMiles),
    location.placeId ?? 'area',
  ].join('|')
}

export function readSavedLocations(email) {
  if (!email) return []
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${LOCATION_KEY_PREFIX}${email.toLowerCase()}`) || '[]')
    return Array.isArray(stored)
      ? stored.filter((location) => location && typeof location.zipCode === 'string' && typeof location.businessType === 'string' && Number(location.radiusMiles) > 0)
      : []
  } catch {
    return []
  }
}

export function writeSavedLocations(email, locations) {
  window.localStorage.setItem(`${LOCATION_KEY_PREFIX}${email.toLowerCase()}`, JSON.stringify(locations))
}
