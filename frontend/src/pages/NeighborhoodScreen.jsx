import './NeighborhoodScreen.css'

function NeighborhoodMapPlaceholder({ zipCode, radiusMiles }) {
  return (
    <section className="neighborhood-map-shell" aria-label={`Map preview for ZIP code ${zipCode}`}>
      <div className="neighborhood-map-toolbar">
        <div className="map-location">
          <span className="location-mark" aria-hidden="true">⌖</span>
          <span><small>ZIP CODE</small><strong>{zipCode}</strong></span>
        </div>
        <span className="radius-badge">Search radius <strong>{radiusMiles} mi</strong></span>
      </div>
      <div className="empty-neighborhood-map">
        <div className="empty-map-message">
          <span className="empty-map-symbol" aria-hidden="true">⌖</span>
          <strong>Map preview</strong>
          <span>Neighborhood map data will appear here.</span>
        </div>
        <span className="map-attribution">Map data not connected</span>
      </div>
    </section>
  )
}

function NeighborhoodScreen({ search, onBack }) {
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
        <button className="back-home" type="button" onClick={onBack}>
          ← <span>Edit search</span>
        </button>
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
        <NeighborhoodMapPlaceholder
          zipCode={search.zipCode}
          radiusMiles={search.radiusMiles}
        />
        <p className="map-screen-footnote">
          This map is an empty preview. Neighborhood boundaries and places will load when map data is connected.
        </p>
      </section>
    </main>
  )
}

export default NeighborhoodScreen
