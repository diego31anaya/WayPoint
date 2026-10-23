const ZCTA_QUERY_URL =
  import.meta.env.VITE_ZCTA_QUERY_URL ??
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query'

export async function fetchZipBoundary(zipCode, { signal } = {}) {
  const url = new URL(ZCTA_QUERY_URL)
  url.search = new URLSearchParams({
    where: `ZCTA5='${zipCode}'`,
    outFields: 'ZCTA5',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`ZIP boundary request failed (${response.status})`)
  }

  const featureCollection = await response.json()
  if (featureCollection.error) {
    throw new Error(featureCollection.error.message ?? 'ZIP boundary request failed')
  }

  return featureCollection.features?.length ? featureCollection : null
}

export async function fetchZipCenter(zipCode, { signal } = {}) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    postalcode: zipCode,
    country: 'United States',
    format: 'jsonv2',
    limit: '1',
  })

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`ZIP center request failed (${response.status})`)
  const places = await response.json()
  const place = places[0]
  return place ? [Number(place.lat), Number(place.lon)] : null
}

function distanceInMiles(from, to) {
  const [lat1, lon1] = from.map(Number)
  const [lat2, lon2] = to.map(Number)
  const earthRadius = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function placeCategory(tags) {
  return tags.shop || tags.amenity || tags.office || tags.craft || tags.leisure || tags.tourism || 'Business'
}

function placeAddress(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
  return [street, tags['addr:city'], tags['addr:state']].filter(Boolean).join(', ') || 'Address unavailable'
}

export async function fetchNearbyPlaces(center, radiusMiles, { signal } = {}) {
  const [latitude, longitude] = center
  const radiusMeters = Math.max(500, Math.round(Number(radiusMiles) * 1609.34))
  const query = `[out:json][timeout:25];nwr["name"](around:${radiusMeters},${latitude},${longitude});out center tags;`
  const url = new URL('https://overpass-api.de/api/interpreter')
  url.searchParams.set('data', query)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Nearby business request failed (${response.status})`)
  const data = await response.json()

  return data.elements
    .map((element) => {
      const tags = element.tags ?? {}
      const point = element.lat && element.lon
        ? [element.lat, element.lon]
        : [element.center?.lat, element.center?.lon]
      if (!point[0] || !point[1] || !tags.name) return null
      const distance = distanceInMiles(center, point)
      return {
        id: `${element.type}-${element.id}`,
        name: tags.name,
        category: placeCategory(tags),
        address: placeAddress(tags),
        distance: `${distance.toFixed(1)} mi`,
        coordinates: point,
        tags: [tags.opening_hours ? 'Hours available' : 'Nearby', tags['contact:phone'] ? 'Contact listed' : 'Local place'],
      }
    })
    .filter(Boolean)
    .sort((first, second) => Number.parseFloat(first.distance) - Number.parseFloat(second.distance))
    .slice(0, 40)
}
