import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AccountControl from '../components/AccountControl'
import ChatNavButton from '../components/ChatNavButton'
import { useAuth } from '../context/useAuth'
import { backendBusinessType, fetchStrategies } from '../services/api'
import { fetchHeat, HEAT_GRADIENT, scoreColor } from '../services/heatmap'
import { distanceInMiles, fetchZipBoundary } from '../services/zipBoundary'
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
  const label = CATEGORY_LABELS[place.category]?.one ?? formatCategory(place.category ?? 'business')
  info.textContent = `${label} · ${place.is_independent ? 'Independent' : 'Chain'} · gem score ${place.hidden_gem_score}`
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

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function direction(from, to) {
  const dx = (to[1] - from[1]) * Math.cos((from[0] * Math.PI) / 180)
  return COMPASS[Math.round((((Math.atan2(dx, to[0] - from[0]) * 180) / Math.PI + 360) % 360) / 45) % 8]
}

// Plain-language reading of one heatmap hexagon; every number comes from data/heatmap.py output.
function describeCell(cell, heat) {
  const labels = CATEGORY_LABELS[heat.category]
  return `${cell.competitors} ${cell.competitors === 1 ? labels.one : labels.many} within about 1 km, where a typical LA area this busy has ${Math.round(cell.expected)}. `
    + `Estimated closure rate ${percent(cell.closure_rate)} (LA ${percent(heat.la_closure_rate)}). ${cell.businesses} businesses nearby.`
}

function heatPopup(cell, heat) {
  const box = document.createElement('div')
  const title = document.createElement('strong')
  const text = document.createElement('span')
  box.className = 'place-popup'
  title.textContent = `Opportunity ${cell.score}/100 for a ${CATEGORY_LABELS[heat.category].one}`
  text.textContent = `${describeCell(cell, heat)} Relative proxy, not a forecast.`
  box.append(title, text)
  return box
}

// Highest-scoring heatmap hexagons within the search radius, shaped like place cards.
function bestSpots(heat, zipData, radiusMiles) {
  if (!heat || !zipData) return []
  const center = [zipData.center.lat, zipData.center.lon]
  return heat.cells
    .map((cell) => ({ cell, miles: distanceInMiles(center, cell.center) }))
    .filter(({ miles }) => miles <= radiusMiles)
    .sort((a, b) => b.cell.score - a.cell.score)
    .slice(0, 3)
    .map(({ cell, miles }) => ({
      id: `spot-${heat.category}-${cell.cell}`,
      name: `${miles.toFixed(1)} mi ${direction(center, cell.center)} of the ${zipData.zip} center`,
      category: `Opportunity ${cell.score}/100 · relative proxy`,
      address: describeCell(cell, heat),
      coordinates: cell.center,
      tags: [`Score ${cell.score}/100`, `${cell.competitors} vs ${Math.round(cell.expected)} typical`],
      isSpot: true,
    }))
}

function placeCoordinates(place) {
  const lat = place?.lat ?? place?.coordinates?.[0]
  const lon = place?.lon ?? place?.coordinates?.[1]
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
}

function ZipCodeMap({ zipCode, geoJson, zipData, category, radiusMiles, selectedPlace, heat }) {
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
    if (heat) {
      // Opportunity heatmap under the pins: one hexagon per H3 cell, colored by score.
      const renderer = L.canvas({ padding: 0.5 })
      heat.cells.forEach((cell) => {
        L.polygon(cell.outline, { renderer, weight: 0.5, color: '#ffffff', opacity: 0.7, fillColor: scoreColor(cell.score), fillOpacity: 0.5 })
          .bindPopup(() => heatPopup(cell, heat))
          .addTo(map)
      })
    }
    if (zipData) {
      addPlaces(map, zipData, category, dataRadius(radiusMiles))
      map.attributionControl.addAttribution('Places © <a href="https://overturemaps.org">Overture Maps Foundation</a>')
    }

    const selectedCoordinates = placeCoordinates(selectedPlace)
    if (selectedCoordinates) {
      L.circleMarker(selectedCoordinates, {
        radius: 13,
        color: '#1f8f3a',
        weight: 3,
        fillColor: '#5ee27a',
        fillOpacity: 0.45,
        className: 'selected-map-ping',
      }).bindPopup(placePopup(selectedPlace)).addTo(map).bringToFront()
      // A heatmap spot is a ~0.74 km² hexagon: show it with its neighbors, not street level.
      map.setView(selectedCoordinates, selectedPlace.isSpot ? 14 : Math.max(map.getZoom(), 16), { animate: true })
    }

    return () => map.remove()
  }, [geoJson, zipData, category, radiusMiles, selectedPlace, heat])

  return <div className="leaflet-map" ref={mapElement} role="region" aria-label={`Map of ZIP code ${zipCode}`} />
}

function NeighborhoodMap({ zipCode, radiusMiles, zipData, category, selectedPlace, heat, heatOn, onToggleHeat }) {
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
        <div className="map-toolbar-actions">
          {heat && (
            <button className={`heat-toggle${heatOn ? ' is-on' : ''}`} type="button" aria-pressed={heatOn} onClick={onToggleHeat}>
              <span className="heat-swatch" style={{ background: HEAT_GRADIENT }} />{heatOn ? 'Hide' : 'Show'} opportunity heatmap
            </button>
          )}
          <span className="radius-badge">Search radius <strong>{radiusMiles} mi</strong></span>
        </div>
      </div>
      <div className="neighborhood-map-stage">
        {mapResult.status === 'ready' && (
          <ZipCodeMap
            zipCode={zipCode}
            geoJson={mapResult.geoJson}
            zipData={zipData}
            category={category}
            radiusMiles={radiusMiles}
            selectedPlace={selectedPlace}
            heat={heatOn ? heat : null}
          />
        )}
        {mapResult.status === 'ready' && heat && heatOn && (
          <div className="heat-legend">
            <strong>Where a new {CATEGORY_LABELS[heat.category].one} has room</strong>
            <span className="heat-bar" style={{ background: HEAT_GRADIENT }} />
            <span className="heat-scale"><span>Crowded, more closures</span><span>More room</span></span>
            <small>Score = 45% room vs a typical LA area this busy + 35% closure rate vs LA + 20% activity, per ~0.74 km² hexagon. A relative proxy, not a forecast. Click a hexagon for its numbers.</small>
          </div>
        )}
        {mapResult.status === 'ready' && zipData && !(heat && heatOn) && (
          <div className="map-pin-legend">
        <span><i className="pin-dot pin-independent" />Independent {CATEGORY_LABELS[category]?.one ?? 'businesses'}</span>
        <span><i className="pin-dot pin-chain" />Chain {CATEGORY_LABELS[category]?.one ?? 'businesses'}</span>
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
  const labels = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.services

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
  const categoryData = data.categories?.[category] ?? data.categories?.services
  const stats = categoryData?.[miles] ?? categoryData?.[3]
  if (!stats) {
    return <div className="insights-status" role="status"><strong>Neighborhood data is not available yet</strong><span>Try another business type or ZIP code.</span></div>
  }
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
          <h2>{search.businessType}</h2>
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

const QUERY_STOP_WORDS = new Set(['a', 'an', 'and', 'business', 'for', 'near', 'shop', 'store', 'the'])

function queryTerms(query) {
  return query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !QUERY_STOP_WORDS.has(term))
}

function queryRelevance(place, query) {
  const name = place.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const terms = queryTerms(query)
  const phrase = query.toLowerCase().trim()
  return (phrase && name.includes(phrase) ? 10 : 0) + terms.reduce((score, term) => score + (new RegExp(`\\b${term}\\b`).test(name) ? 4 : name.includes(term) ? 2 : 0), 0)
}

function placeKey(place) {
  return place.id ?? `${place.name}-${place.lat ?? place.coordinates?.[0] ?? ''}-${place.lon ?? place.coordinates?.[1] ?? ''}`
}

function PlaceResultsPanel({ search, zipData, category, recommendations, selectedPlace, onSelectPlace, onCreateAccount }) {
  const [activeTab, setActiveTab] = useState('competitors')
  const [saveToast, setSaveToast] = useState('')
  const { user, savedLocations, saveLocation, removeSavedLocation } = useAuth()
  const competitors = zipData?.places
    ?.filter((place) => place.category === category)
    .sort((a, b) => queryRelevance(b, search.businessType) - queryRelevance(a, search.businessType)
      || (b.hidden_gem_score ?? 0) - (a.hidden_gem_score ?? 0))
    .slice(0, 20) ?? []
  const places = activeTab === 'recommended' ? recommendations : competitors

  function toggleSaved(place) {
    const key = placeKey(place)
    const existing = savedLocations.find((item) => item.placeId === key
      && item.zipCode === zipData?.zip
      && item.businessType === search.businessType
      && Number(item.radiusMiles) === Number(search.radiusMiles))
    if (existing) {
      removeSavedLocation(existing.id)
      setSaveToast('Location unsaved!')
      return
    }
    if (!user) {
      onCreateAccount()
      return
    }
    saveLocation({
      businessType: search.businessType,
      zipCode: zipData.zip,
      radiusMiles: search.radiusMiles,
      placeId: key,
      businessName: place.name,
      address: place.address,
      lat: placeCoordinates(place)?.[0],
      lon: placeCoordinates(place)?.[1],
    })
    setSaveToast('Location saved!')
  }

  useEffect(() => {
    if (!saveToast) return undefined
    const timeout = setTimeout(() => setSaveToast(''), 2200)
    return () => clearTimeout(timeout)
  }, [saveToast])

  return (
    <aside className="places-panel" aria-label="Nearby business results">
      <div className="places-tabs">
        <button className={activeTab === 'competitors' ? 'active' : ''} type="button" onClick={() => setActiveTab('competitors')}>Competitors <b>({competitors.length})</b></button>
        <button className={activeTab === 'recommended' ? 'active' : ''} type="button" onClick={() => setActiveTab('recommended')}>Recommended <b>({recommendations.length})</b></button>
      </div>
      <div className="places-caption">{activeTab === 'recommended' ? 'Highest-scoring heatmap hexagons within your radius. A relative proxy, not a forecast.' : `${CATEGORY_LABELS[category].many[0].toUpperCase()}${CATEGORY_LABELS[category].many.slice(1)} listed inside ZIP ${search.zipCode}, top 20. The numbers above count the whole radius.`}</div>
      <div className="places-list">
        {!zipData && <div className="places-status">Loading businesses in this ZIP code…</div>}
        {zipData && !places.length && <div className="places-status">No matching businesses found in this area.</div>}
        {places.map((place, index) => {
          const savedPlace = savedLocations.some((item) => item.placeId === placeKey(place)
            && item.zipCode === zipData?.zip
            && item.businessType === search.businessType
            && Number(item.radiusMiles) === Number(search.radiusMiles))
          return (
            <article
              className={`place-card${selectedPlace && placeKey(selectedPlace) === placeKey(place) ? ' is-selected' : ''}`}
              tabIndex="0"
              key={placeKey(place) ?? `${place.name}-${index}`}
              onClick={() => onSelectPlace(place)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectPlace(place)
                }
              }}
            >
              <div className="place-card-heading"><span>{String(index + 1).padStart(2, '0')}</span><h3>{place.name}</h3></div>
              <div className="place-tags"><span>{activeTab === 'recommended' ? place.tags[0] : (place.is_independent ? 'Independent' : 'Chain')}</span><span>{activeTab === 'recommended' ? place.tags[1] : `Gem score ${place.hidden_gem_score}`}</span></div>
              <span className="place-category">{activeTab === 'recommended' ? place.category : search.businessType}</span>
              <p>{activeTab === 'recommended' ? place.address : `${search.businessType} near ${zipData.zip}`}</p>
              <div className="place-card-footer">
                {activeTab === 'recommended' && <button type="button" className={savedPlace ? 'is-saved' : ''} onClick={() => toggleSaved(place)}>{savedPlace ? 'Saved' : 'Save Location'}</button>}
                <span>{activeTab === 'recommended' ? 'Suggested spot' : (place.hidden_gem_score ? `${place.hidden_gem_score} score` : 'Nearby')}</span>
              </div>
            </article>
          )
        })}
      </div>
      {saveToast && <div className={`save-toast${saveToast === 'Location unsaved!' ? ' is-unsaved' : ''}`} role="status" aria-live="polite">{saveToast}</div>}
    </aside>
  )
}

// Headline numbers for the exact search (ZIP center, nearest data radius), all from the ZIP export.
function SearchMetrics({ search, category, zipResult }) {
  if (zipResult.status !== 'ready') return null
  const data = zipResult.data
  const miles = dataRadius(search.radiusMiles)
  const labels = CATEGORY_LABELS[category]
  const stats = data.categories[category][String(miles)]
  const businesses = Object.values(data.categories).reduce((sum, byRadius) => sum + byRadius[String(miles)].competitors, 0)
  const ratio = stats.density_ratio
  let gap = '—'
  if (ratio != null) gap = ratio < 0.95 ? `${Math.round((1 - ratio) * 100)}% fewer` : ratio > 1.05 ? `${Math.round((ratio - 1) * 100)}% more` : 'About even'
  const tiles = [
    { value: businesses.toLocaleString(), label: `walk-in businesses within ${miles} mi` },
    { value: stats.competitors.toLocaleString(), label: `${labels.many} (your competitors) within ${miles} mi` },
    { value: stats.competitors ? percent(stats.independent / stats.competitors) : '—', label: `independent (${stats.independent} of ${stats.competitors})` },
    { value: gap, label: `${labels.many} per km² than the surrounding 10 km`, note: 'Category gap: a heuristic, not a forecast' },
  ]
  return (
    <div className="search-metrics" aria-label="Headline numbers for this search">
      {tiles.map((tile) => (
        <div className="search-metric" key={tile.label} title={tile.note}>
          <strong>{tile.value}</strong>
          <span>{tile.label}</span>
          {tile.note && <small>{tile.note}</small>}
        </div>
      ))}
    </div>
  )
}

const evidenceText = (e) => `${e.metric_id.replace('category_count:', '').replaceAll('_', ' ')}: ${Number.isInteger(e.value) ? e.value.toLocaleString() : e.value.toFixed(2)} ${e.unit}`

// Experiments from the backend's /api/analyze, always labeled with where they came from.
function StrategiesSection({ search, category, zipData }) {
  const type = backendBusinessType(search.businessType, category)
  const center = zipData ? [zipData.center.lat, zipData.center.lon] : null
  const key = `${search.zipCode}-${search.radiusMiles}-${type}`
  const [result, setResult] = useState({ key: null })
  useEffect(() => {
    if (!type || !center) return undefined
    const controller = new AbortController()
    fetchStrategies({ businessType: type, center, radiusMiles: dataRadius(search.radiusMiles) }, { signal: controller.signal })
      .then((data) => setResult({ key, status: 'ready', data }))
      .catch(() => { if (!controller.signal.aborted) setResult({ key, status: 'error' }) })
    return () => controller.abort()
  // center is derived from zipData; key covers the rest.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zipData])
  if (!type || !zipData) return null
  const current = result.key === key ? result : { status: 'loading' }
  let body
  if (current.status === 'loading') body = <p className="strategies-status">Building experiments for this neighborhood…</p>
  else if (current.status === 'error') body = <p className="strategies-status">The strategy service is offline right now. The map and numbers above don’t depend on it.</p>
  else if (!current.data.recommendations.length) body = <p className="strategies-status">Not enough mapped businesses nearby to suggest experiments.</p>
  else {
    const meta = current.data.metadata
    const ai = ['open_weight_model', 'cortex_ai'].includes(meta.recommendation_source)
    const source = ai ? `Written by ${meta.ai_model} via Snowflake Cortex from these numbers` : 'Rule-based experiments (the AI model isn’t running)'
    const data = { snowflake: 'counts from a live Snowflake query', local: 'counts from the Snowflake export of LA places', mock: 'synthetic demo data' }[meta.data_source]
    body = (
      <>
        <p className="strategies-source">{source} · {data}</p>
        <div className="strategies-grid">
          {current.data.recommendations.map((rec) => (
            <article className="strategy-card" key={rec.title}>
              <span className="strategy-priority">{rec.priority} priority</span>
              <h3>{rec.title}</h3>
              <p>{rec.description}</p>
              <ol>{rec.action_steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <div className="strategy-evidence">{rec.supporting_evidence.map((e) => <span key={e.metric_id}>{evidenceText(e)}</span>)}</div>
            </article>
          ))}
        </div>
      </>
    )
  }
  return (
    <section className="strategies-section" aria-label="Experiments to test">
      <div className="eyebrow">PLAN A TEST</div>
      <h2>Low-cost experiments to try <em>next</em></h2>
      {body}
    </section>
  )
}

function NeighborhoodScreen({ search, user, onBack, onCreateAccount, onOpenDashboard, onOpenChat, initialSelectedPlace }) {
  const category = matchCategory(search.businessType)
  const [loaded, setLoaded] = useState({ zip: null, status: 'loading', data: null })
  const [index, setIndex] = useState(null)
  const [selectedPlace, setSelectedPlace] = useState(initialSelectedPlace ?? null)
  const [heatResult, setHeatResult] = useState({ category: null })
  const [heatOn, setHeatOn] = useState(false)
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

  useEffect(() => {
    let current = true
    fetchHeat(category)
      .then((heat) => { if (current) setHeatResult({ category, heat }) })
      .catch(() => { if (current) setHeatResult({ category, heat: null }) })
    return () => { current = false }
  }, [category])
  const heat = heatResult.category === category ? heatResult.heat : null
  const spots = useMemo(() => bestSpots(heat, zipResult.data, search.radiusMiles), [heat, zipResult.data, search.radiusMiles])

  function selectPlace(place) {
    setSelectedPlace(place)
    if (place?.isSpot) setHeatOn(true)
  }

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
          <p className="data-provenance">
            Snapshot of Overture Maps places (via CARTO on the Snowflake Marketplace), exported Oct 23, 2026 · Census: SafeGraph ACS 2019 ·
            Static data, not a live warehouse query · Scores are heuristics, not forecasts
            {dataRadius(search.radiusMiles) !== search.radiusMiles && ` · Numbers use the nearest radius we have (${dataRadius(search.radiusMiles)} mi)`}
          </p>
        </div>
        <SearchMetrics search={search} category={category} zipResult={zipResult} />
        <div className="finder-layout">
          <PlaceResultsPanel
            search={search}
            zipData={zipResult.data}
            category={category}
            recommendations={spots}
            selectedPlace={selectedPlace}
            onSelectPlace={selectPlace}
            onCreateAccount={onCreateAccount}
          />
          <div className="finder-map-column">
            <NeighborhoodMap
              zipCode={search.zipCode}
              radiusMiles={search.radiusMiles}
              zipData={zipResult.data}
              category={category}
              selectedPlace={selectedPlace}
              heat={heat}
              heatOn={heatOn}
              onToggleHeat={() => setHeatOn((on) => !on)}
            />
          </div>
        </div>
        <p className="map-screen-footnote">
          The outlined area is the Census Bureau’s ZIP Code Tabulation Area, an approximation of USPS ZIP code boundaries.
          {zipResult.data && ' Pins show businesses listed in this ZIP; the dashed ring is the radius the numbers below use.'}
        </p>
        <NeighborhoodInsights search={search} category={category} zipResult={zipResult} index={index} />
        <StrategiesSection search={search} category={category} zipData={zipResult.data} />
      </section>
    </main>
  )
}

export default NeighborhoodScreen
