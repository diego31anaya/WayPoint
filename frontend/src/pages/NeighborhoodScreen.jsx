import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AccountControl from '../components/AccountControl'
import { fetchNearbyPlaces, fetchZipBoundary, fetchZipCenter } from '../services/zipBoundary'
import './NeighborhoodScreen.css'

const defaultMapCenter = [39.8283, -98.5795]

const recommendations = [
  { id: 'recommended-1', name: 'Riverside Commons', tags: ['High opportunity', 'Growing area'], category: 'Mixed-use retail', address: '400 Riverfront Way, Portland, OR', distance: '0.8 mi', coordinates: [45.531, -122.676] },
  { id: 'recommended-2', name: 'North Loop District', tags: ['Underserved', 'Transit access'], category: 'Neighborhood center', address: '1250 NW Raleigh St, Portland, OR', distance: '1.2 mi', coordinates: [45.525, -122.655] },
  { id: 'recommended-3', name: 'Eastbank Exchange', tags: ['New development', '4.6 nearby rating'], category: 'Commercial corridor', address: '800 SE Water Ave, Portland, OR', distance: '1.6 mi', coordinates: [45.516, -122.681] },
]

function BusinessMarker({ number }) {
  return L.divIcon({
    className: 'business-marker-wrap',
    html: `<span class="business-marker"><span>•</span></span><b>${number}</b>`,
    iconSize: [36, 42],
    iconAnchor: [18, 36],
  })
}

function FinderMap({ zipCode, geoJson, center, businesses, onSelectBusiness }) {
  const mapElement = useRef(null)

  useEffect(() => {
    if (!mapElement.current || !center) return undefined
    const map = L.map(mapElement.current, { zoomControl: false, scrollWheelZoom: false })
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const boundary = geoJson
      ? L.geoJSON(geoJson, {
        style: { color: '#25805a', weight: 2, opacity: 0.8, fillColor: '#bfe7d2', fillOpacity: 0.1 },
      }).addTo(map)
      : null
    if (boundary) map.fitBounds(boundary.getBounds(), { padding: [38, 38], maxZoom: 13 })
    else map.setView(center, 12)
    businesses.forEach((business, index) => {
      L.marker(business.coordinates, { icon: BusinessMarker({ number: index + 1 }) })
        .on('click', () => onSelectBusiness(business))
        .addTo(map)
    })
    requestAnimationFrame(() => map.invalidateSize())
    return () => map.remove()
  }, [businesses, center, geoJson, onSelectBusiness])

  return <div className="finder-map" ref={mapElement} role="region" aria-label={`Businesses near ZIP code ${zipCode}`} />
}

function NeighborhoodMap({ zipCode, radiusMiles, businesses, onPlacesLoaded, onSelectBusiness }) {
  const [mapResult, setMapResult] = useState({ status: 'loading', geoJson: null, center: defaultMapCenter })

  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([
      fetchZipBoundary(zipCode, { signal: controller.signal }),
      fetchZipCenter(zipCode, { signal: controller.signal }),
    ]).then(([boundaryResult, centerResult]) => {
      if (controller.signal.aborted) return
      const geoJson = boundaryResult.status === 'fulfilled' ? boundaryResult.value : null
      const center = centerResult.status === 'fulfilled' && centerResult.value ? centerResult.value : defaultMapCenter
      setMapResult({ status: 'ready', geoJson, center })
      if (centerResult.status === 'fulfilled' && centerResult.value) {
        fetchNearbyPlaces(centerResult.value, radiusMiles, { signal: controller.signal })
          .then(onPlacesLoaded)
          .catch(() => onPlacesLoaded([]))
      } else {
        onPlacesLoaded([])
      }
    })
    return () => controller.abort()
  }, [onPlacesLoaded, radiusMiles, zipCode])

  return (
    <div className="finder-map-shell">
      {mapResult.status === 'ready' && <FinderMap zipCode={zipCode} geoJson={mapResult.geoJson} center={mapResult.center} businesses={businesses} onSelectBusiness={onSelectBusiness} />}
      {mapResult.status === 'loading' && <div className="map-status"><span className="map-loader" />Loading your area map…</div>}
      {mapResult.status === 'not-found' && <div className="map-status"><strong>Map unavailable for {zipCode}</strong><span>Try another ZIP code to see nearby places.</span></div>}
      {mapResult.status === 'error' && <div className="map-status"><strong>Couldn’t load the map</strong><span>Check your connection and try again.</span></div>}
      <div className="map-radius-label">Showing places within <strong>{radiusMiles} mi</strong></div>
    </div>
  )
}

function BusinessCard({ business, index, isRecommended, isSaved, onSave, onSelectBusiness }) {
  return (
    <article className="business-card" tabIndex="0" onClick={() => onSelectBusiness(business)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectBusiness(business) }}>
      <div className="business-card-top"><span className="business-number">{String(index + 1).padStart(2, '0')}</span><h2>{business.name}</h2></div>
      <div className="business-tags">{business.tags.map((tag, tagIndex) => <span className={tagIndex === 1 ? 'rating-tag' : ''} key={tag}>{tagIndex === 1 && '★ '}{tag}</span>)}</div>
      <span className="business-type-label">CATEGORY</span>
      <span className="business-type">{business.category}</span>
      <p>{business.address}</p>
      <div className="business-card-footer">
        {isRecommended ? <button type="button" className={isSaved ? 'saved-location' : ''} onClick={(event) => { event.stopPropagation(); onSave(business) }}>{isSaved ? 'Saved' : 'Save Location'}</button> : <><button type="button" onClick={(event) => event.stopPropagation()}>Directions</button><span>{business.distance}</span></>}
      </div>
    </article>
  )
}

function NeighborhoodScreen({ search, user, onBack, onCreateAccount, onOpenDashboard }) {
  const [businesses, setBusinesses] = useState([])
  const [activeTab, setActiveTab] = useState('competitors')
  const [savedLocations, setSavedLocations] = useState([])
  const [selectedBusiness, setSelectedBusiness] = useState(null)
  const visibleBusinesses = activeTab === 'recommended' ? recommendations : businesses
  const handlePlacesLoaded = useCallback((places) => setBusinesses(places), [])
  const handleSaveLocation = useCallback((location) => {
    setSavedLocations((current) => current.some((saved) => saved.id === location.id)
      ? current.filter((saved) => saved.id !== location.id)
      : [...current, location])
  }, [])

  return (
    <main className="neighborhood-screen">
      <header className="finder-header">
        <div className="finder-brand"><span className="finder-brand-icon">⌖</span><strong>WayPoint Places</strong><small>LOCAL BUSINESS DIRECTORY</small><small>EXPLORE YOUR AREA</small></div>
        <div className="finder-search"><span>⌕</span><span>Search businesses in this area</span><button type="button">Search</button></div>
        <select aria-label="Search radius" defaultValue={String(search.radiusMiles)}><option value="3">3 mi</option><option value="5">5 mi</option><option value="10">10 mi</option></select>
        <select aria-label="Price filter" defaultValue="all"><option value="all">Any price</option><option value="1">$</option><option value="2">$$</option><option value="3">$$$</option></select>
        <select aria-label="Business category" defaultValue="all"><option value="all">All categories</option></select>
        <div className="finder-account"><button type="button" onClick={onBack}>Edit search</button><AccountControl user={user} onCreateAccount={onCreateAccount} onOpenDashboard={onOpenDashboard} /></div>
      </header>
      <section className="finder-layout">
        <aside className="business-results">
          <div className="results-tabs"><button className={activeTab === 'competitors' ? 'active' : ''} type="button" onClick={() => setActiveTab('competitors')}>Competitors <b>({businesses.length})</b></button><button className={activeTab === 'recommended' ? 'active' : ''} type="button" onClick={() => setActiveTab('recommended')}>Recommended <b>({recommendations.length})</b></button></div>
          <div className="results-caption">{activeTab === 'recommended' ? 'Suggested areas based on local signals' : 'Businesses near your ZIP code, sorted by distance'}</div>
          <div className="business-list">
            <div className="business-list-status">{activeTab === 'recommended' ? 'Fictional opportunity locations for exploration' : businesses.length ? `${businesses.length} businesses found` : 'Looking for businesses in this area…'}</div>
            {visibleBusinesses.map((business, index) => <BusinessCard business={business} index={index} key={business.id} isRecommended={activeTab === 'recommended'} isSaved={savedLocations.some((saved) => saved.id === business.id)} onSave={handleSaveLocation} onSelectBusiness={setSelectedBusiness} />)}
          </div>
          <section className="saved-folder" aria-label="Saved locations">
            <div className="saved-folder-heading"><span>Saved locations</span><b>{savedLocations.length}</b></div>
            {savedLocations.length ? savedLocations.map((location) => <div className="saved-location-row" key={location.id}><span className="saved-location-dot">✓</span><span>{location.name}</span></div>) : <p>Save recommended spots here for later.</p>}
          </section>
        </aside>
        <section className="map-column"><NeighborhoodMap zipCode={search.zipCode} radiusMiles={search.radiusMiles} businesses={visibleBusinesses} onPlacesLoaded={handlePlacesLoaded} onSelectBusiness={setSelectedBusiness} /></section>
      </section>
      {selectedBusiness && (
        <div className="business-overlay-backdrop" role="presentation" onClick={() => setSelectedBusiness(null)}>
          <section className="business-overlay" role="dialog" aria-modal="true" aria-labelledby="business-overlay-title" onClick={(event) => event.stopPropagation()}>
            <button className="business-overlay-close" type="button" aria-label="Close business details" onClick={() => setSelectedBusiness(null)}>×</button>
            <span className="business-overlay-kicker">{activeTab === 'recommended' ? 'RECOMMENDED LOCATION' : 'BUSINESS DETAILS'}</span>
            <h2 id="business-overlay-title">{selectedBusiness.name}</h2>
            <span className="business-type">{selectedBusiness.category}</span>
            <p className="business-overlay-address">{selectedBusiness.address}</p>
            <div className="business-overlay-tags">{selectedBusiness.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            {selectedBusiness.distance && <p className="business-overlay-distance">{selectedBusiness.distance} from the map center</p>}
            {activeTab === 'recommended' && <button className="business-overlay-save" type="button" onClick={() => handleSaveLocation(selectedBusiness)}>{savedLocations.some((saved) => saved.id === selectedBusiness.id) ? 'Saved location' : 'Save location'}</button>}
          </section>
        </div>
      )}
    </main>
  )
}

export default NeighborhoodScreen
