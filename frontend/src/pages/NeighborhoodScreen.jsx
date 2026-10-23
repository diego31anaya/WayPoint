import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AccountControl from '../components/AccountControl'
import ChatNavButton from '../components/ChatNavButton'
import { fetchZipBoundary } from '../services/zipBoundary'
import { CATEGORY_LABELS, dataRadius, fetchDataIndex, fetchZipData, matchCategory } from '../services/zipData'
import './NeighborhoodScreen.css'

const MILE_M = 1609.34
const percent = (rate) => `${(rate * 100).toFixed(1)}%`

// Built with DOM nodes so business names are never parsed as HTML.
function placePopup(place) {
  const box = document.createElement('div')
  const name = document.createElement('strong')
  const info = document.createElement('span')
  box.className = 'place-popup'
  name.textContent = place.name
  info.textContent = `${CATEGORY_LABELS[place.category].one} · ${place.is_independent ? 'Independent' : 'Chain'} · gem score ${place.hidden_gem_score}`
  box.append(name, info)
  return box
}

function addPlaces(map, zipData, category, radiusMiles) {
  const { lat, lon } = zipData.center
  L.circle([lat, lon], {
    radius: radiusMiles * MILE_M,
    color: '#d27a4e',
    weight: 1.5,
    dashArray: '5 6',
    fill: false,
    interactive: false,
  }).addTo(map)

  // Other categories first so the searched category's pins sit on top.
  const places = [...zipData.places].sort((a, b) => (a.category === category) - (b.category === category))
  for (const place of places) {
    const match = place.category === category
    L.circleMarker([place.lat, place.lon], {
      radius: match ? 6 : 3.5,
      weight: match ? 1.5 : 0,
      color: '#fffefa',
      fillColor: match ? (place.is_independent ? '#365b43' : '#d27a4e') : '#7d8377',
      fillOpacity: match ? 0.95 : 0.7,
    }).bindPopup(placePopup(place)).addTo(map)
  }
}

function ZipCodeMap({ zipCode, geoJson, zipData, category, radiusMiles }) {
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
    if (zipData) {
      addPlaces(map, zipData, category, dataRadius(radiusMiles))
      map.attributionControl.addAttribution('Places © <a href="https://overturemaps.org">Overture Maps Foundation</a>')
    }

    return () => map.remove()
  }, [geoJson, zipData, category, radiusMiles])

  return <div className="leaflet-map" ref={mapElement} role="region" aria-label={`Map of ZIP code ${zipCode}`} />
}

function NeighborhoodMap({ zipCode, radiusMiles, zipData, category }) {
  const [mapResult, setMapResult] = useState({ status: 'loading', geoJson: null })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
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
          <ZipCodeMap
            zipCode={zipCode}
            geoJson={mapResult.geoJson}
            zipData={zipData}
            category={category}
            radiusMiles={radiusMiles}
          />
        )}
        {mapResult.status === 'ready' && zipData && (
          <div className="map-pin-legend">
            <span><i className="pin-dot pin-independent" />Independent {CATEGORY_LABELS[category].one}</span>
            <span><i className="pin-dot pin-chain" />Chain {CATEGORY_LABELS[category].one}</span>
            <span><i className="pin-dot pin-other" />Other businesses</span>
          </div>
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

function StatCard({ label, value, line, detail }) {
  return (
    <article className="insight-stat">
      <span className="insight-stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="insight-stat-line">{line}</span>
      {detail && <small>{detail}</small>}
    </article>
  )
}

function formatCategory(name) {
  return name.replaceAll('_', ' ')
}

function NeighborhoodInsights({ search, category, zipResult, index }) {
  const labels = CATEGORY_LABELS[category]

  if (zipResult.status === 'loading') {
    return <div className="insights-status" role="status"><span className="map-loader" /><strong>Loading neighborhood numbers…</strong></div>
  }
  if (zipResult.status === 'error') {
    return <div className="insights-status" role="status"><strong>Couldn’t load neighborhood numbers</strong><span>Check your connection and try again.</span></div>
  }
  if (zipResult.status === 'missing') {
    return (
      <div className="insights-status" role="status">
        <strong>No business data for {search.zipCode} yet</strong>
        <span>WayPoint currently covers {index?.zips.length ?? 'about 340'} ZIP codes around Los Angeles, such as 91768 (Pomona) or 90015 (Downtown LA).</span>
      </div>
    )
  }

  const data = zipResult.data
  const miles = dataRadius(search.radiusMiles)
  const stats = data.categories[category][miles]
  const ratio = stats.density_ratio
  const ca = index?.ca_survival?.[category]
  const la = index?.la_county
  const people = data.demographics
  const standouts = data.places.filter((place) => place.category === category && place.is_independent).slice(0, 5)

  let gapValue = '—'
  if (ratio != null) {
    if (ratio < 0.95) gapValue = `${Math.round((1 - ratio) * 100)}% fewer`
    else if (ratio > 1.05) gapValue = `${Math.round((ratio - 1) * 100)}% more`
    else gapValue = 'About even'
  }

  return (
    <section className="neighborhood-insights" aria-label="Neighborhood numbers">
      <div className="insights-heading">
        <div>
          <span className="insights-kicker">YOUR NEIGHBORHOOD IN NUMBERS</span>
          <h2>{search.businessType} <em>· {labels.many}</em></h2>
        </div>
        <p>
          Within {miles} mi of the center of {data.zip}
          {miles !== search.radiusMiles && <> (closest radius we have data for)</>}
        </p>
      </div>

      <div className="insight-stats">
        <StatCard
          label="COMPETITION"
          value={stats.competitors}
          line={`${labels.many} within ${miles} mi`}
          detail={`${stats.independent} independent · ${stats.competitors - stats.independent} chain`}
        />
        <StatCard
          label="MARKET GAP"
          value={gapValue}
          line={`${labels.many} per km² than the surrounding 10 km`}
          detail={ratio == null ? 'Not enough nearby data' : `${stats.per_km2} here vs ${stats.city_per_km2} in the wider area`}
        />
        <StatCard
          label="SURVIVAL"
          value={stats.closure_rate == null ? '—' : percent(stats.closure_rate)}
          line={`of tracked nearby ${labels.many} have closed`}
          detail={`${stats.closed} closed of ${stats.open + stats.closed}${ca ? ` · California: ${percent(ca.ca_closure_rate)}` : ''}`}
        />
        <StatCard
          label="NEIGHBORHOOD"
          value={people.population.toLocaleString()}
          line="residents within 2 mi"
          detail={[
            people.median_household_income && `Median income $${people.median_household_income.toLocaleString()}`,
            people.median_age && `median age ${people.median_age}`,
          ].filter(Boolean).join(' · ')}
        />
      </div>

      <div className="insight-lists">
        <article className="insight-list">
          <span className="insight-stat-label">NEAREST {labels.many.toUpperCase()}</span>
          {stats.nearest.length ? (
            <ol>{stats.nearest.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}</ol>
          ) : <p>None within {miles} mi.</p>}
        </article>
        <article className="insight-list">
          <span className="insight-stat-label">INDEPENDENT STANDOUTS IN {data.zip}</span>
          {standouts.length ? (
            <ol>
              {standouts.map((place) => (
                <li key={`${place.name}-${place.lat}-${place.lon}`}>{place.name}<small>gem score {place.hidden_gem_score}</small></li>
              ))}
            </ol>
          ) : <p>No independent {labels.many} listed in this ZIP.</p>}
        </article>
        {ca && (
          <article className="insight-list">
            <span className="insight-stat-label">WHAT LASTS IN CALIFORNIA</span>
            <ol>
              {ca.ca_most_durable.map((row) => (
                <li key={row.category}>{formatCategory(row.category)}<small>{percent(row.closure_rate)} closed</small></li>
              ))}
            </ol>
            <p className="insight-list-note">
              Hardest: {ca.ca_least_durable.map((row) => `${formatCategory(row.category)} (${percent(row.closure_rate)})`).join(', ')}
            </p>
          </article>
        )}
      </div>

      {la && (
        <p className="insights-finding">
          <strong>Across LA County,</strong> independent businesses close at {percent(la.independent_closure_rate)} vs {percent(la.chain_closure_rate)} for chains, and closures rise with nearby competition.
        </p>
      )}
      <p className="map-screen-footnote">
        Business data: Overture Maps (via CARTO on Snowflake). Census: SafeGraph Open Census (ACS 2019). Gap and survival are proxies built from listings, not measured demand or sales.
      </p>
    </section>
  )
}

function NeighborhoodScreen({ search, user, onBack, onCreateAccount, onOpenDashboard, onOpenChat, locationSaved, onSaveLocation, onRemoveLocation }) {
  const category = matchCategory(search.businessType)
  const [loaded, setLoaded] = useState({ zip: null, status: 'loading', data: null })
  const [index, setIndex] = useState(null)
  // A result for a different ZIP means the new one is still loading.
  const zipResult = loaded.zip === search.zipCode ? loaded : { status: 'loading', data: null }

  useEffect(() => {
    const controller = new AbortController()
    const zip = search.zipCode
    fetchZipData(zip, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setLoaded(data ? { zip, status: 'ready', data } : { zip, status: 'missing', data: null })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ zip, status: 'error', data: null })
      })
    return () => controller.abort()
  }, [search.zipCode])

  useEffect(() => {
    fetchDataIndex().then(setIndex).catch(() => setIndex(null))
  }, [])

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
          {user && <ChatNavButton onClick={onOpenChat} />}
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
          <button
            className={`save-location-button${locationSaved ? ' is-saved' : ''}`}
            type="button"
            onClick={user ? (locationSaved ? onRemoveLocation : onSaveLocation) : onCreateAccount}
            aria-pressed={user ? locationSaved : undefined}
          >
            {user ? (locationSaved ? '✓ Saved to your locations' : '＋ Save this location') : 'Create account to save this location'}
          </button>
        </div>
        <NeighborhoodMap
          zipCode={search.zipCode}
          radiusMiles={search.radiusMiles}
          zipData={zipResult.data}
          category={category}
        />
        <p className="map-screen-footnote">
          The outlined area is the Census Bureau’s ZIP Code Tabulation Area, an approximation of USPS ZIP code boundaries.
          {zipResult.data && ' Pins show businesses listed in this ZIP; the dashed ring is the radius the numbers below use.'}
        </p>
        <NeighborhoodInsights search={search} category={category} zipResult={zipResult} index={index} />
      </section>
    </main>
  )
}

export default NeighborhoodScreen
