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
