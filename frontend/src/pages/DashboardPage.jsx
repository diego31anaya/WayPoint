import AccountControl from '../components/AccountControl'
import './DashboardPage.css'

function DashboardPage({ user, activeSearch, onExplore, onViewMap, onSignOut }) {
  return (
    <main className="dashboard-page">
      <header className="site-header page-shell">
        <a className="brand" href="#dashboard" aria-label="WayPoint dashboard">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>WayPoint</span>
        </a>
        <div className="dashboard-header-actions">
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
            <strong>{activeSearch ? '1' : '0'}</strong>
            <span className="stat-description">{activeSearch ? 'Current search' : 'No reports yet'}</span>
          </article>
          <article className="dashboard-stat-card">
            <span className="stat-icon">✳</span>
            <span className="stat-label">SAVED OPPORTUNITIES</span>
            <strong>0</strong>
            <span className="stat-description">Ideas you choose to keep</span>
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

        <p className="dashboard-demo-note">Demo session: account and dashboard data are temporary and will reset when you refresh.</p>
      </section>
    </main>
  )
}

export default DashboardPage
