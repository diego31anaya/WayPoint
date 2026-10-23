import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AccountControl from '../components/AccountControl'
import { fetchZipBoundary } from '../services/zipBoundary'
import './NeighborhoodScreen.css'

function ZipCodeMap({ zipCode, geoJson }) {
  const mapElement = useRef(null)

  useEffect(() => {
    if (!mapElement.current) return undefined

    const map = L.map(mapElement.current, { scrollWheelZoom: false })
    const tileUrl = import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const boundary = L.geoJSON(geoJson, {
      style: {
        color: '#365b43',
        weight: 3,
        opacity: 0.95,
        fillColor: '#7e9b70',
        fillOpacity: 0.2,
      },
    }).addTo(map)

    map.fitBounds(boundary.getBounds(), { padding: [28, 28], maxZoom: 13 })
    map.attributionControl.addAttribution(
      '<a href="https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html">ZIP Code Tabulation Area data © U.S. Census Bureau</a>',
    )

    return () => map.remove()
  }, [geoJson])

  return <div className="leaflet-map" ref={mapElement} role="region" aria-label={`Map of ZIP code ${zipCode}`} />
}

function NeighborhoodMap({ zipCode, radiusMiles }) {
  const [mapResult, setMapResult] = useState({ status: 'loading', geoJson: null })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setMapResult({ status: 'loading', geoJson: null })

    fetchZipBoundary(zipCode, { signal: controller.signal })
      .then((geoJson) => {
        if (controller.signal.aborted) return
        setMapResult(geoJson
          ? { status: 'ready', geoJson }
          : { status: 'not-found', geoJson: null })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMapResult({ status: 'error', geoJson: null })
        }
      })

    return () => controller.abort()
  }, [zipCode, retryCount])

  const noBoundary = mapResult.status === 'not-found'

  return (
    <section className="neighborhood-map-shell" aria-label={`Map of ZIP code ${zipCode}`}>
      <div className="neighborhood-map-toolbar">
        <div className="map-location">
          <span className="location-mark" aria-hidden="true">⌖</span>
          <span><small>ZIP CODE</small><strong>{zipCode}</strong></span>
        </div>
        <span className="radius-badge">Search radius <strong>{radiusMiles} mi</strong></span>
      </div>
      <div className="neighborhood-map-stage">
        {mapResult.status === 'ready' && (
          <ZipCodeMap zipCode={zipCode} geoJson={mapResult.geoJson} />
        )}
        {mapResult.status === 'loading' && (
          <div className="map-status" role="status"><span className="map-loader" /><strong>Loading ZIP code map…</strong></div>
        )}
        {mapResult.status === 'not-found' && (
          <div className="map-status" role="status">
            <strong>No Census ZIP area found for {zipCode}</strong>
            <span>Some USPS ZIP codes do not have a matching Census ZIP Code Tabulation Area.</span>
          </div>
        )}
        {mapResult.status === 'error' && (
          <div className="map-status" role="status">
            <strong>Couldn’t load this map</strong>
            <span>Check your connection and try again.</span>
            <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
          </div>
        )}
        {mapResult.status === 'ready' && (
          <span className="map-data-attribution">ZIP boundary: 2020 Census ZCTA</span>
        )}
      </div>
      {noBoundary && (
        <span className="map-data-attribution map-data-attribution-outside">
          ZIP Code Tabulation Areas: U.S. Census Bureau
        </span>
      )}
    </section>
  )
}

function NeighborhoodScreen({ search, user, onBack, onCreateAccount, onOpenDashboard }) {
  return (
    <main className="neighborhood-screen">
      <header className="site-header page-shell">
        <a
          className="brand"
          href="#home"
          aria-label="WayPoint home"
          onClick={(event) => {
            event.preventDefault()
            onBack()
          }}
        >
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>WayPoint</span>
        </a>
        <div className="map-header-actions">
          <button className="back-home" type="button" onClick={onBack}>
            ← <span>Edit search</span>
          </button>
          <AccountControl
            user={user}
            onCreateAccount={onCreateAccount}
            onOpenDashboard={onOpenDashboard}
          />
        </div>
      </header>
      <section className="neighborhood-content page-shell">
        <div className="neighborhood-heading">
          <div className="eyebrow">NEIGHBORHOOD EXPLORER</div>
          <h1>Explore <em>{search.zipCode}</em></h1>
          <p>
            <strong>{search.businessType}</strong>
            <span className="heading-divider">·</span>
            Within {search.radiusMiles} miles
          </p>
        </div>
        <NeighborhoodMap
          zipCode={search.zipCode}
          radiusMiles={search.radiusMiles}
        />
        <p className="map-screen-footnote">
          The outlined area is the Census Bureau’s ZIP Code Tabulation Area, an approximation of USPS ZIP code boundaries.
        </p>
      </section>
    </main>
  )
}

export default NeighborhoodScreen
