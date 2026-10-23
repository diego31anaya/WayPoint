import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AccountControl from '../components/AccountControl'
import ChatNavButton from '../components/ChatNavButton'
import { backendBusinessType, fetchStrategies } from '../services/api'
import { distanceInMiles, fetchNearbyPlaces, fetchZipBoundary, fetchZipCenter } from '../services/zipBoundary'
import { buildBrief, CATEGORY_LABELS, dataRadius, fetchDataIndex, fetchZipData, matchCategory } from '../services/zipData'
import './NeighborhoodScreen.css'

const MILE_M = 1609.34
const MAX_LISTED = 40
const RADIUS_OPTIONS = [1, 2, 3, 5, 10]
const percent = (rate) => `${(rate * 100).toFixed(1)}%`

// Overture place from the ZIP export -> the same shape fetchNearbyPlaces returns.
function toBusiness(place, center) {
  const coordinates = [place.lat, place.lon]
  return {
    id: `${place.name}-${place.lat}-${place.lon}`,
    name: place.name,
    category: CATEGORY_LABELS[place.category].one,
    group: place.category,
    independent: place.is_independent,
    tags: [place.is_independent ? 'Independent' : 'Chain', `Gem score ${place.hidden_gem_score}`],
    coordinates,
    miles: distanceInMiles(center, coordinates),
  }
}

function numberedIcon(number, chain) {
  return L.divIcon({
    className: 'business-marker-wrap',
    html: `<span class="business-marker${chain ? ' chain' : ''}"><span>•</span></span><b>${number}</b>`,
    iconSize: [36, 42],
    iconAnchor: [18, 36],
  })
}

function FinderMap({ zipCode, geoJson, center, radiusMiles, businesses, others, placesSource, onSelectBusiness }) {
  const mapElement = useRef(null)

  useEffect(() => {
    if (!mapElement.current) return undefined
    const map = L.map(mapElement.current, { zoomControl: false, scrollWheelZoom: false })
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    if (geoJson) {
      const boundary = L.geoJSON(geoJson, {
        style: { color: '#25805a', weight: 2, opacity: 0.8, fillColor: '#bfe7d2', fillOpacity: 0.1 },
      }).addTo(map)
      map.fitBounds(boundary.getBounds(), { padding: [38, 38], maxZoom: 13 })
      map.attributionControl.addAttribution(
        '<a href="https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html">ZIP Code Tabulation Area data © U.S. Census Bureau</a>',
      )
    } else {
      map.setView(center, 12)
    }
    if (center) {
      L.circle(center, {
        radius: radiusMiles * MILE_M,
        color: '#d27a4e',
        weight: 1.5,
        dashArray: '5 6',
        fill: false,
        interactive: false,
      }).addTo(map)
    }
    if (placesSource === 'overture') {
      map.attributionControl.addAttribution('Places © <a href="https://overturemaps.org">Overture Maps Foundation</a>')
    }

    // Unlisted businesses as small dots for context, listed ones as numbered pins on top.
    others.forEach((business) => {
      L.circleMarker(business.coordinates, { radius: 3.5, weight: 0, fillColor: '#7d8377', fillOpacity: 0.7 })
        .on('click', () => onSelectBusiness(business))
        .addTo(map)
    })
    businesses.forEach((business, index) => {
      L.marker(business.coordinates, { icon: numberedIcon(index + 1, business.independent === false) })
        .on('click', () => onSelectBusiness(business))
        .addTo(map)
    })
    requestAnimationFrame(() => map.invalidateSize())
    return () => map.remove()
  }, [businesses, center, geoJson, others, placesSource, radiusMiles, onSelectBusiness])

  return <div className="finder-map" ref={mapElement} role="region" aria-label={`Businesses near ZIP code ${zipCode}`} />
}

function NeighborhoodMap({ zipCode, center, radiusMiles, businesses, others, placesSource, onSelectBusiness }) {
  const [boundary, setBoundary] = useState({ zip: null, status: 'loading', geoJson: null })
  const [retryCount, setRetryCount] = useState(0)
  // A result for a different ZIP means the new one is still loading.
  const result = boundary.zip === zipCode ? boundary : { status: 'loading', geoJson: null }

  useEffect(() => {
    const controller = new AbortController()
    fetchZipBoundary(zipCode, { signal: controller.signal })
      .then((geoJson) => {
        if (!controller.signal.aborted) setBoundary({ zip: zipCode, status: geoJson ? 'ready' : 'not-found', geoJson })
      })
      .catch(() => {
        if (!controller.signal.aborted) setBoundary({ zip: zipCode, status: 'error', geoJson: null })
      })
    return () => controller.abort()
  }, [zipCode, retryCount])

  const showMap = result.status !== 'loading' && (result.geoJson || center)
  const retry = <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>

  return (
    <div className="finder-map-shell">
      {showMap && (
        <FinderMap
          zipCode={zipCode}
          geoJson={result.geoJson}
          center={center}
          radiusMiles={radiusMiles}
          businesses={businesses}
          others={others}
          placesSource={placesSource}
          onSelectBusiness={onSelectBusiness}
        />
      )}
      {!showMap && result.status === 'loading' && <div className="map-status" role="status"><span className="map-loader" />Loading your area map…</div>}
      {!showMap && result.status === 'not-found' && (
        <div className="map-status" role="status">
          <strong>No Census ZIP area found for {zipCode}</strong>
          <span>Some USPS ZIP codes do not have a matching Census ZIP Code Tabulation Area.</span>
        </div>
      )}
      {!showMap && result.status === 'error' && (
        <div className="map-status" role="status"><strong>Couldn’t load the map</strong><span>Check your connection and try again.</span>{retry}</div>
      )}
      {showMap && result.status === 'error' && <div className="map-note" role="status">Couldn’t load the ZIP outline. {retry}</div>}
      {showMap && result.status === 'not-found' && <div className="map-note" role="status">No Census ZIP outline for {zipCode}.</div>}
      {showMap && placesSource === 'overture' && (
        <div className="map-pin-legend">
          <span><i className="pin-dot pin-independent" />Independent</span>
          <span><i className="pin-dot pin-chain" />Chain</span>
          <span><i className="pin-dot pin-other" />Not in list</span>
        </div>
      )}
      <div className="map-radius-label">
        Showing places within <strong>{radiusMiles} mi</strong>
        {result.geoJson && ' · ZIP outline: 2020 Census ZCTA'}
      </div>
    </div>
  )
}

function SaveButton({ item, isSaved, onSave }) {
  return (
    <button type="button" className={isSaved ? 'saved-location' : ''} onClick={(event) => { event.stopPropagation(); onSave(item) }}>
      {isSaved ? 'Saved' : 'Save'}
    </button>
  )
}

function directionsUrl([lat, lon]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
}

function BusinessCard({ business, index, isSaved, onSave, onSelectBusiness }) {
  return (
    <article className="business-card" tabIndex="0" onClick={() => onSelectBusiness(business)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectBusiness(business) }}>
      <div className="business-card-top"><span className="business-number">{String(index + 1).padStart(2, '0')}</span><h2>{business.name}</h2></div>
      <div className="business-tags">{business.tags.map((tag, tagIndex) => <span className={tagIndex === 1 ? 'rating-tag' : ''} key={tag}>{tagIndex === 1 && '★ '}{tag}</span>)}</div>
      <span className="business-type-label">CATEGORY</span>
      <span className="business-type">{business.category}</span>
      {business.address && <p>{business.address}</p>}
      <div className="business-card-footer">
        <SaveButton item={business} isSaved={isSaved} onSave={onSave} />
        <a href={directionsUrl(business.coordinates)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Directions</a>
        <span>{business.miles.toFixed(1)} mi</span>
      </div>
    </article>
  )
}

function IdeaCard({ idea, isSaved, onSave }) {
  return (
    <article className="business-card idea-card">
      <div className="business-card-top"><span className="business-number">{idea.number}</span><h2>{idea.title}</h2></div>
      <span className="business-type-label">{idea.tag}</span>
      <p>{idea.description}</p>
      <div className="business-card-footer"><SaveButton item={idea} isSaved={isSaved} onSave={onSave} /></div>
    </article>
  )
}

const evidenceText = (e) => `${e.metric_id.replace('category_count:', '').replaceAll('_', ' ')}: ${Number.isInteger(e.value) ? e.value : e.value.toFixed(2)} ${e.unit}`

function StrategyCard({ strategy, isSaved, onSave }) {
  return (
    <article className="business-card idea-card strategy-card">
      <div className="business-card-top"><span className="business-number">{strategy.priority.toUpperCase()}</span><h2>{strategy.title}</h2></div>
      <p>{strategy.description}</p>
      <ol>{strategy.action_steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="business-tags">{strategy.supporting_evidence.map((e) => <span key={e.metric_id}>{evidenceText(e)}</span>)}</div>
      <div className="business-card-footer"><SaveButton item={strategy} isSaved={isSaved} onSave={onSave} /></div>
    </article>
  )
}

function Strategies({ result, businessType, isSaved, onSave }) {
  if (!businessType) return <div className="business-list-status">Strategies cover coffee shops, restaurants, bakeries and bookstores.</div>
  if (result.status === 'loading') return <div className="business-list-status">Building strategies for this neighborhood…</div>
  if (result.status === 'error') return <div className="business-list-status">Strategy service offline. Start the backend (see README) for tailored strategies.</div>
  const { recommendations, metadata } = result.data
  if (!recommendations.length) return <div className="business-list-status">Not enough mapped businesses nearby for strategies.</div>
  const source = metadata.recommendation_source === 'open_weight_model'
    ? `Written by ${metadata.ai_model} from these numbers`
    : 'Rule-based (the AI model isn’t running)'
  return (
    <>
      <div className="business-list-status strategy-source">STRATEGIES TO TEST · {source}</div>
      {recommendations.map((strategy) => <StrategyCard strategy={strategy} key={strategy.id} isSaved={isSaved(strategy)} onSave={onSave} />)}
    </>
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
        <strong>No neighborhood numbers for {search.zipCode} yet</strong>
        <span>The list above shows OpenStreetMap places. Competition, survival and Census numbers cover {index?.zips.length ?? 'about 340'} ZIP codes around Los Angeles, such as 91768 (Pomona) or 90015 (Downtown LA).</span>
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

function NeighborhoodScreen({ search, user, onBack, onCreateAccount, onOpenDashboard, onOpenChat }) {
  const category = matchCategory(search.businessType)
  const [radius, setRadius] = useState(search.radiusMiles)
  const [query, setQuery] = useState('')
  const [shownCategory, setShownCategory] = useState(category)
  const [activeTab, setActiveTab] = useState('competitors')
  const [saved, setSaved] = useState([])
  const [selected, setSelected] = useState(null)
  const [loaded, setLoaded] = useState({ zip: null, status: 'loading', data: null })
  const [index, setIndex] = useState(null)
  const [live, setLive] = useState({ key: null })
  const zipResult = loaded.zip === search.zipCode ? loaded : { status: 'loading', data: null }
  const data = zipResult.data

  useEffect(() => {
    const controller = new AbortController()
    const zip = search.zipCode
    fetchZipData(zip, { signal: controller.signal })
      .then((zipData) => {
        if (!controller.signal.aborted) setLoaded(zipData ? { zip, status: 'ready', data: zipData } : { zip, status: 'missing', data: null })
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
    if (!selected) return undefined
    const close = (event) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selected])

  // ZIPs outside the export: center from Nominatim, places from OpenStreetMap.
  const needLive = zipResult.status === 'missing' || zipResult.status === 'error'
  const liveKey = `${search.zipCode}-${radius}`
  useEffect(() => {
    if (!needLive) return undefined
    const controller = new AbortController()
    const { signal } = controller
    fetchZipCenter(search.zipCode, { signal })
      .catch(() => null)
      .then((center) => (center
        ? fetchNearbyPlaces(center, radius, { signal }).catch(() => null).then((places) => ({ center, places }))
        : { center: null, places: null }))
      .then((result) => { if (!signal.aborted) setLive({ key: liveKey, ...result }) })
    return () => controller.abort()
  }, [needLive, liveKey, search.zipCode, radius])
  const liveResult = live.key === liveKey ? live : null

  const center = useMemo(
    () => (data ? [data.center.lat, data.center.lon] : liveResult?.center ?? null),
    [data, liveResult],
  )
  const allPlaces = useMemo(
    () => (data ? data.places.map((place) => toBusiness(place, center)) : liveResult?.places ?? []),
    [data, liveResult, center],
  )
  const categoryOptions = useMemo(
    () => (data ? Object.keys(CATEGORY_LABELS) : [...new Set(allPlaces.map((place) => place.group))].sort()),
    [data, allPlaces],
  )
  const activeCategory = categoryOptions.includes(shownCategory) ? shownCategory : 'all'
  const { matches, listed, others } = useMemo(() => {
    const text = query.trim().toLowerCase()
    const found = allPlaces
      .filter((place) => place.miles <= radius
        && (activeCategory === 'all' || place.group === activeCategory)
        && (!text || place.name.toLowerCase().includes(text)))
      .sort((a, b) => a.miles - b.miles)
    const shown = found.slice(0, MAX_LISTED)
    const shownIds = new Set(shown.map((place) => place.id))
    return { matches: found.length, listed: shown, others: allPlaces.filter((place) => !shownIds.has(place.id)) }
  }, [allPlaces, radius, activeCategory, query])

  const ideas = useMemo(
    () => (data ? buildBrief(data, index, category, dataRadius(radius)).map((idea) => ({ ...idea, id: `idea-${idea.title}`, name: idea.title })) : []),
    [data, index, category, radius],
  )

  const strategyType = backendBusinessType(search.businessType, category)
  const strategyKey = `${search.zipCode}-${radius}-${strategyType}-${center}`
  const [strategies, setStrategies] = useState({ key: null })
  useEffect(() => {
    if (!strategyType || !center) return undefined
    const controller = new AbortController()
    fetchStrategies({ businessType: strategyType, center, radiusMiles: radius }, { signal: controller.signal })
      .then((data) => {
        data.recommendations.forEach((rec) => { rec.id = `strategy-${rec.title}`; rec.name = rec.title })
        setStrategies({ key: strategyKey, status: 'ready', data })
      })
      .catch(() => { if (!controller.signal.aborted) setStrategies({ key: strategyKey, status: 'error' }) })
    return () => controller.abort()
  }, [strategyKey, strategyType, center, radius])
  const strategyResult = strategies.key === strategyKey ? strategies : { status: 'loading' }
  const strategyCount = strategyResult.status === 'ready' ? strategyResult.data.recommendations.length : 0

  const isSaved = (item) => saved.some((entry) => entry.id === item.id)
  function toggleSave(item) {
    setSaved((current) => (current.some((entry) => entry.id === item.id)
      ? current.filter((entry) => entry.id !== item.id)
      : [...current, { id: item.id, name: item.name }]))
  }

  let listStatus
  if (zipResult.status === 'loading' || (needLive && !liveResult)) listStatus = 'Looking for businesses in this area…'
  else if (needLive && !liveResult.center) listStatus = `Couldn’t locate ZIP code ${search.zipCode}.`
  else if (needLive && !liveResult.places) listStatus = 'Couldn’t load nearby businesses. Check your connection and try again.'
  else listStatus = `${matches} ${matches === 1 ? 'business' : 'businesses'} found${matches > MAX_LISTED ? ` · showing nearest ${MAX_LISTED}` : ''}`

  const radiusOptions = [...new Set([...RADIUS_OPTIONS, search.radiusMiles])].sort((a, b) => a - b)
  const categoryLabel = (group) => (data ? CATEGORY_LABELS[group].many : group.replaceAll('_', ' '))

  return (
    <main className="neighborhood-screen">
      <header className="finder-header">
        <a className="finder-brand" href="#home" onClick={(event) => { event.preventDefault(); onBack() }}>
          <span className="finder-brand-icon">⌖</span><strong>WayPoint Places</strong><small>{search.businessType.toUpperCase()}</small><small>ZIP {search.zipCode}</small>
        </a>
        <label className="finder-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search businesses in this area" aria-label="Search businesses by name" />
        </label>
        <select aria-label="Search radius" value={String(radius)} onChange={(event) => setRadius(Number(event.target.value))}>
          {radiusOptions.map((miles) => <option key={miles} value={miles}>{miles} mi</option>)}
        </select>
        <select aria-label="Business category" value={activeCategory} onChange={(event) => setShownCategory(event.target.value)}>
          <option value="all">All categories</option>
          {categoryOptions.map((group) => <option key={group} value={group}>{categoryLabel(group)}</option>)}
        </select>
        <div className="finder-account"><button type="button" onClick={onBack}>Edit search</button>{user && <ChatNavButton onClick={onOpenChat} />}<AccountControl user={user} onCreateAccount={onCreateAccount} onOpenDashboard={onOpenDashboard} /></div>
      </header>
      <section className="finder-layout">
        <aside className="business-results">
          <div className="results-tabs">
            <button className={activeTab === 'competitors' ? 'active' : ''} type="button" onClick={() => setActiveTab('competitors')}>Competitors <b>({matches})</b></button>
            <button className={activeTab === 'recommended' ? 'active' : ''} type="button" onClick={() => setActiveTab('recommended')}>Recommended <b>({ideas.length + strategyCount})</b></button>
          </div>
          <div className="results-caption">
            {activeTab === 'recommended'
              ? 'Ideas to investigate, built from this neighborhood’s numbers'
              : `${data ? 'Overture Maps places listed in this ZIP' : 'OpenStreetMap places near this ZIP'}, sorted by distance`}
          </div>
          <div className="business-list">
            {activeTab === 'competitors' && (
              <>
                <div className="business-list-status" role="status">{listStatus}</div>
                {listed.map((business, i) => <BusinessCard business={business} index={i} key={business.id} isSaved={isSaved(business)} onSave={toggleSave} onSelectBusiness={setSelected} />)}
              </>
            )}
            {activeTab === 'recommended' && (
              <>
                <Strategies result={strategyResult} businessType={strategyType} isSaved={isSaved} onSave={toggleSave} />
                {ideas.length > 0 && <div className="business-list-status strategy-source">WHAT THE NUMBERS SAY</div>}
                {ideas.length
                  ? ideas.map((idea) => <IdeaCard idea={idea} key={idea.id} isSaved={isSaved(idea)} onSave={toggleSave} />)
                  : <div className="business-list-status">Neighborhood numbers cover about 340 Los Angeles-area ZIP codes (try 91768).</div>}
              </>
            )}
          </div>
          <section className="saved-folder" aria-label="Saved">
            <div className="saved-folder-heading"><span>Saved</span><b>{saved.length}</b></div>
            {saved.length
              ? saved.map((entry) => <div className="saved-location-row" key={entry.id}><span className="saved-location-dot">✓</span><span>{entry.name}</span></div>)
              : <p>Save businesses and ideas here for later.</p>}
          </section>
        </aside>
        <section className="map-column">
          <NeighborhoodMap
            zipCode={search.zipCode}
            center={center}
            radiusMiles={radius}
            businesses={listed}
            others={others}
            placesSource={data ? 'overture' : 'osm'}
            onSelectBusiness={setSelected}
          />
        </section>
      </section>
      <section className="finder-insights">
        <NeighborhoodInsights search={{ ...search, radiusMiles: radius }} category={category} zipResult={zipResult} index={index} />
      </section>
      {selected && (
        <div className="business-overlay-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="business-overlay" role="dialog" aria-modal="true" aria-labelledby="business-overlay-title" onClick={(event) => event.stopPropagation()}>
            <button className="business-overlay-close" type="button" aria-label="Close business details" onClick={() => setSelected(null)}>×</button>
            <span className="business-overlay-kicker">BUSINESS DETAILS</span>
            <h2 id="business-overlay-title">{selected.name}</h2>
            <span className="business-type">{selected.category}</span>
            {selected.address && <p className="business-overlay-address">{selected.address}</p>}
            <div className="business-overlay-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <p className="business-overlay-distance">{selected.miles.toFixed(1)} mi from the center of {search.zipCode}</p>
            <div className="business-overlay-actions">
              <button className="business-overlay-save" type="button" onClick={() => toggleSave(selected)}>{isSaved(selected) ? 'Saved' : 'Save'}</button>
              <a className="business-overlay-save" href={directionsUrl(selected.coordinates)} target="_blank" rel="noreferrer">Directions</a>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default NeighborhoodScreen
