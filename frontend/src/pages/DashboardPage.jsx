import AccountControl from '../components/AccountControl'
import ChatNavButton from '../components/ChatNavButton'
import './DashboardPage.css'
import AnalysisResults from '../components/AnalysisResults'

function DashboardPage({ integration, user, activeSearch, savedLocations, onExplore, onViewMap, onOpenSavedLocation, onRemoveSavedLocation, onSignOut, onOpenChat }) {
  return (
    <main className="dashboard-page">
      <header className="site-header page-shell">
        <a className="brand" href="#dashboard" aria-label="WayPoint dashboard">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>WayPoint</span>
        </a>
        <div className="dashboard-header-actions">
          {user && <ChatNavButton onClick={onOpenChat} />}
          <AccountControl user={user} />
          <button className="dashboard-signout" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="dashboard-content page-shell" id="dashboard">
        <div className="dashboard-greeting">
          <div className="eyebrow">YOUR WAYPOINT DASHBOARD</div>
          <h1>Welcome to your<br /><em>neighborhood view.</em></h1>
          <p>Signed in as <strong>{user.email}</strong></p>
        </div>

        <div className="dashboard-welcome-card">
          <div>
            <span className="account-kicker">YOUR NEXT STEP</span>
            <h2>Start with the area around your business.</h2>
            <p>Explore a ZIP code to see its mapped area and, as WayPoint grows, neighborhood insights tailored to your business.</p>
            <button type="button" onClick={onExplore}>Explore my area <span>→</span></button>
          </div>
          <div className="dashboard-card-art" aria-hidden="true"><span className="dashboard-art-ring ring-a" /><span className="dashboard-art-ring ring-b" /><span className="dashboard-art-center">W</span><i className="dashboard-art-dot dot-a" /><i className="dashboard-art-dot dot-b" /></div>
        </div>

        <div className="dashboard-stats">
          <article className="dashboard-stat-card">
            <span className="stat-icon">⌖</span>
            <span className="stat-label">NEIGHBORHOOD REPORTS</span>
            <strong>{integration.activeAnalysis ? '1' : '0'}</strong>
            <span className="stat-description">{activeSearch ? 'Current search' : 'No reports yet'}</span>
          </article>
          <article className="dashboard-stat-card">
            <span className="stat-icon">✳</span>
            <span className="stat-label">SAVED LOCATIONS</span>
            <strong>{savedLocations.length}</strong>
            <span className="stat-description">Neighborhoods saved to your account</span>
          </article>
          <article className="dashboard-recent-card">
            <span className="stat-label">RECENT SEARCH</span>
            {activeSearch ? (
              <>
                <strong>{activeSearch.businessType}</strong>
                <span>{activeSearch.zipCode} · within {activeSearch.radiusMiles} miles</span>
                <button type="button" onClick={onViewMap}>Open map <span>→</span></button>
              </>
            ) : (
              <>
                <strong>No neighborhood yet</strong>
                <span>Run your first local search to get started.</span>
              </>
            )}
          </article>
        </div>

        <AnalysisResults integration={integration} compact />
        <section className="saved-locations" aria-labelledby="saved-locations-heading">
          <div className="saved-locations-heading">
            <div>
              <span className="stat-label">YOUR WAYPOINTS</span>
              <h2 id="saved-locations-heading">Saved locations</h2>
            </div>
            <span>{savedLocations.length} saved</span>
          </div>
          {savedLocations.length ? (
            <div className="saved-location-list">
              {savedLocations.map((location) => (
                <article className="saved-location-card" key={location.id}>
                  <span className="saved-location-mark" aria-hidden="true">⌖</span>
                  <div className="saved-location-details">
                    <strong>{location.businessType}</strong>
                    <span>ZIP {location.zipCode} · within {location.radiusMiles} miles</span>
                  </div>
                  <button className="saved-location-open" type="button" onClick={() => onOpenSavedLocation(location)}>Open map <span>→</span></button>
                  <button className="saved-location-remove" type="button" onClick={() => onRemoveSavedLocation(location.id)} aria-label={`Remove ${location.businessType} in ${location.zipCode}`}>×</button>
                </article>
              ))}
            </div>
          ) : (
            <p className="saved-locations-empty">Explore an area and save it to keep it here with your account.</p>
          )}
        </section>

        <p className="dashboard-demo-note">Demo mode: your signed-in email is remembered in this browser. Neighborhood search data is temporary and resets when you refresh.</p>
      </section>
    </main>
  )
}

export default DashboardPage
