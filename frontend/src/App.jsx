import { useEffect, useMemo, useState } from 'react'
import AccountControl from './components/AccountControl'
import ChatNavButton from './components/ChatNavButton'
import AboutDataPage from './pages/AboutDataPage'
import AccountPage from './pages/AccountPage'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import NeighborhoodScreen from './pages/NeighborhoodScreen'
import { buildBrief, fetchDataIndex, fetchZipData, matchCategory } from './services/zipData'
import { useAuth } from './context/useAuth'
import './App.css'
import { useAnalysis } from './services/useAnalysis'

// Home page example: Pomona, next to Cal Poly Pomona.
const FEATURED_ZIP = '91768'
// The rehearsed demo case (master plan): coffee shop near Cal Poly Pomona. #demo opens it directly.
const DEMO_SEARCH = { businessType: 'Coffee shop', zipCode: '91768', radiusMiles: 2 }

// Shown until the featured neighborhood data loads.
function fallbackRecommendations(businessType) {
  const type = businessType.trim() || 'business'
  return [
  {
    number: '01',
    tag: 'NEARBY WORKPLACES',
    title: 'Make lunch easy for local teams',
    description:
      'Explore a weekday catering menu for offices within your neighborhood.',
    icon: '↗',
  },
  {
    number: '02',
    tag: 'LOCAL LANDSCAPE',
    title: `Find your own corner of ${type}`,
    description:
      'Look for product or service categories that appear less represented nearby.',
    icon: '⌕',
  },
  {
    number: '03',
    tag: 'COMMUNITY MIX',
    title: 'Build an offer for students',
    description:
      'Consider a study-friendly bundle around nearby schools and colleges.',
    icon: '✳',
  },
  ]
}

function NeighborhoodIllustration({ zipCode }) {
  return (
    <div className="map-card" aria-label="Illustrative neighborhood map">
      <div className="map-topline">
        <span className="live-dot" />
        <span>NEIGHBORHOOD SNAPSHOT</span>
        <span className="map-zip">{zipCode}</span>
      </div>
      <div className="map-art" aria-hidden="true">
        <svg viewBox="0 0 540 340" role="presentation">
          <path className="park" d="M29 35 164 17l49 72-25 93-116 9-59-73z" />
          <path className="block block-a" d="m245 22 91-8 18 60-77 38-52-23z" />
          <path className="block block-b" d="m373 26 129 12-11 80-113 7-32-51z" />
          <path className="block block-c" d="m31 231 113-27 43 80-40 40-104-16z" />
          <path className="block block-d" d="m223 205 82-29 60 36-11 99-92 10-47-53z" />
          <path className="block block-e" d="m391 163 104-17 28 85-47 81-87-16-25-64z" />
          <path className="road" d="M-12 179c98-40 141-38 212-29s128 15 196-2 111-25 171-25" />
          <path className="road road-secondary" d="M211-20c20 64 18 105 9 158s-5 117 20 223" />
          <path className="road road-secondary" d="M371-11c-14 69-11 108 7 159s26 117 11 205" />
          <path className="route" d="M114 263c35-57 68-77 111-87 35-8 65 1 102-26s55-54 87-73" />
        </svg>
        <span className="map-label label-park">BONELLI PARK</span>
        <span className="map-label label-market">TEMPLE AVE</span>
        <span className="map-label label-campus">CAL POLY POMONA</span>
        <span className="pin pin-one"><i>☕</i></span>
        <span className="pin pin-two"><i>☕</i></span>
        <span className="pin pin-three"><i>⌂</i></span>
        <span className="pin pin-four"><i>☕</i></span>
        <span className="you-pin"><span />YOUR BUSINESS</span>
      </div>
      <div className="map-legend">
        <span><i className="legend-dot competitor-dot" />Nearby businesses</span>
        <span><i className="legend-dot you-dot" />Your location</span>
      </div>
      <div className="map-note">Illustrative map · sample view</div>
    </div>
  )
}

function App() {
  const [businessType, setBusinessType] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [radius, setRadius] = useState('3')
  const [message, setMessage] = useState('')
  const [activeSearch, setActiveSearch] = useState(() => (window.location.hash === '#demo' ? DEMO_SEARCH : null))
  const [activeSavedPlace, setActiveSavedPlace] = useState(null)
  const [backendView, setBackendView] = useState(false)
  const [finderSelection, setFinderSelection] = useState(null)
  const selectedFinderPlace = finderSelection?.search === activeSearch ? finderSelection.place : activeSavedPlace
  const analysisSearch = useMemo(() => selectedFinderPlace && activeSearch ? { ...activeSearch, selectedPlace: selectedFinderPlace } : activeSearch, [activeSearch, selectedFinderPlace])
  const integration = useAnalysis(analysisSearch)
  // #about-the-data opens the data story and #demo the rehearsed search, for demos and slides.
  const [currentPage, setCurrentPage] = useState(() => ({ '#about-the-data': 'about', '#demo': 'neighborhood' }[window.location.hash] ?? 'home'))
  const [returnPage, setReturnPage] = useState('home')
  const [featuredData, setFeaturedData] = useState(null)
  const [dataIndex, setDataIndex] = useState(null)

  useEffect(() => {
    Promise.all([fetchZipData(FEATURED_ZIP), fetchDataIndex()])
      .then(([zipData, index]) => {
        setFeaturedData(zipData)
        setDataIndex(index)
      })
      .catch(() => {})  // keep the fallback cards
  }, [])
  const businessCategory = matchCategory(businessType)
  let recommendations = fallbackRecommendations(businessType)
  if (featuredData) {
    try {
      recommendations = buildBrief(featuredData, dataIndex, businessCategory)
    } catch {
      recommendations = fallbackRecommendations(businessType)
    }
  }
  const [chatReturnPage, setChatReturnPage] = useState('home')
  const { user: currentUser, signIn, signOut, savedLocations, removeSavedLocation } = useAuth()

  function handleOpenChat() {
    setChatReturnPage(currentPage)
    setCurrentPage('chat')
  }

  function handleCreateAccount() {
    setReturnPage(currentPage)
    setCurrentPage('account')
  }

  function handleOpenSavedLocation(location) {
    setActiveSearch({
      businessType: location.businessType,
      zipCode: location.zipCode,
      radiusMiles: location.radiusMiles,
    })
    setActiveSavedPlace(location)
    setCurrentPage('neighborhood')
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!businessType.trim()) {
      setMessage('Enter your business type to get started.')
      return
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setMessage('Enter a 5-digit ZIP code to get started.')
      return
    }
    if (!radius || Number(radius) <= 0) {
      setMessage('Enter a radius greater than 0 miles.')
      return
    }
    setMessage('')
    setActiveSearch({
      businessType: businessType.trim(),
      zipCode,
      radiusMiles: Number(radius),
    })
    setActiveSavedPlace(null)
    setFinderSelection(null)
    setCurrentPage('neighborhood')
  }

  function openAbout(event) {
    event?.preventDefault()
    setCurrentPage('about')
    window.scrollTo(0, 0)
  }

  function startDemo() {
    setBusinessType(DEMO_SEARCH.businessType)
    setZipCode(DEMO_SEARCH.zipCode)
    setRadius(String(DEMO_SEARCH.radiusMiles))
    setActiveSearch(DEMO_SEARCH)
    setActiveSavedPlace(null)
    setFinderSelection(null)
    setCurrentPage('neighborhood')
    window.scrollTo(0, 0)
  }

  function renderPage() {
  if (currentPage === 'about') {
    return (
      <AboutDataPage
        user={currentUser}
        onBack={() => { setCurrentPage('home'); window.scrollTo(0, 0) }}
        onExplore={() => {
          setCurrentPage('home')
          requestAnimationFrame(() => document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        }}
        onCreateAccount={handleCreateAccount}
        onOpenDashboard={() => setCurrentPage('dashboard')}
      />
    )
  }

  if (currentPage === 'account') {
    return (
      <AccountPage
        onAccountCreated={(user) => {
          signIn(user)
          setCurrentPage('dashboard')
        }}
        onBack={() => setCurrentPage(returnPage)}
      />
    )
  }

  if (currentPage === 'chat' && currentUser) return null

  if (currentPage === 'dashboard') {
    return (
      <>
        <DashboardPage
          integration={integration}
          user={currentUser}
          activeSearch={activeSearch}
          savedLocations={savedLocations}
          onExplore={() => {
            setActiveSavedPlace(null)
            setFinderSelection(null)
            setCurrentPage(activeSearch ? 'neighborhood' : 'home')
          }}
          onViewMap={() => {
            setActiveSavedPlace(null)
            setFinderSelection(null)
            setCurrentPage('neighborhood')
          }}
          onOpenSavedLocation={handleOpenSavedLocation}
          onRemoveSavedLocation={removeSavedLocation}
          onOpenChat={handleOpenChat}
          onSignOut={() => {
            signOut()
            setCurrentPage('home')
          }}
        />
      </>
    )
  }

  if (currentPage === 'neighborhood' && activeSearch) {
    return (
      <>
        <NeighborhoodScreen
          backendView={backendView}
          onToggleBackendView={() => setBackendView((value) => !value)}
          integration={integration}
          onSelectLocation={(place) => setFinderSelection({ search: activeSearch, place })}
          search={activeSearch}
          user={currentUser}
          onBack={() => setCurrentPage('home')}
          onCreateAccount={handleCreateAccount}
          onOpenDashboard={() => setCurrentPage('dashboard')}
          onOpenChat={handleOpenChat}
          initialSelectedPlace={selectedFinderPlace}
        />
      </>
    )
  }

  return (
    <>
      <main>
      <header className="site-header page-shell">
        <a className="brand" href="#home" aria-label="WayPoint home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>WayPoint</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#insights">What you’ll see</a>
          <a href="#about-the-data" onClick={openAbout}>About the data</a>
        </nav>
        <div className="home-header-actions">
          {currentUser && <ChatNavButton onClick={handleOpenChat} />}
          <AccountControl
            user={currentUser}
            onCreateAccount={handleCreateAccount}
            onOpenDashboard={() => setCurrentPage('dashboard')}
          />
        </div>
      </header>

      <section className="hero page-shell" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-star">✳</span> A clearer view of your corner of the world</div>
          <h1>Good business<br />starts <em>around</em> you.</h1>
          <p className="hero-description">
            Understand the neighborhood around your business. Find the gaps, local patterns, and possibilities worth exploring.
          </p>
          <form className="explore-form" id="get-started" onSubmit={handleSubmit}>
            <div className="explore-fields">
              <label className="form-field business-field" htmlFor="business-type">
                <span>I run a</span>
                <input id="business-type" type="text" placeholder="Business type" value={businessType} onChange={(event) => setBusinessType(event.target.value)} />
              </label>
              <label className="form-field" htmlFor="zip-code">
                <span>Located in</span>
                <input
                  id="zip-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  placeholder="ZIP code"
                  value={zipCode}
                  onChange={(event) => setZipCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                  aria-describedby={message ? 'form-message' : undefined}
                />
              </label>
              <label className="form-field radius-field" htmlFor="radius">
                <span>Within</span>
                <span className="radius-input-wrap">
                  <input id="radius" type="number" min="0.5" max="50" step="0.5" value={radius} onChange={(event) => setRadius(event.target.value)} />
                  <span className="miles-suffix">mi</span>
                </span>
              </label>
            </div>
            <button type="submit">Explore my area <span>→</span></button>
            {message && <p className="form-message" id="form-message" role="status">{message}</p>}
          </form>
          <button className="demo-button" type="button" onClick={startDemo}>Try the demo: a coffee shop near Cal Poly Pomona (91768, 2 mi) <span>→</span></button>
          <div className="hero-footnote"><span>✦</span> Local context, made useful for independent businesses.</div>
        </div>
        <div className="hero-visual">
          <div className="visual-spark spark-one">✳</div>
          <div className="visual-spark spark-two">✳</div>
          <NeighborhoodIllustration zipCode={FEATURED_ZIP} />
          <div className="floating-note">
            <span className="note-icon">↗</span>
            <span><strong>See the bigger picture</strong><small>Local places · Census context · Patterns</small></span>
          </div>
          <div className="visual-caption">YOUR NEIGHBORHOOD, IN FOCUS</div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="page-shell trust-inner">
          <span className="trust-label">A neighborhood view, built from</span>
          <span className="data-source"><b className="source-mark snowflake-mark">✳</b> Snowflake geospatial</span>
          <span className="source-divider" />
          <span className="data-source"><b className="source-mark">◎</b> Overture Places</span>
          <span className="source-divider" />
          <span className="data-source"><b className="source-mark census-mark">▥</b> Census data</span>
        </div>
      </section>

      <section className="insights-section page-shell" id="insights">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FROM LOCAL SIGNALS TO FRESH IDEAS</div>
            <h2>See what your neighborhood<br />might be telling you.</h2>
          </div>
          <p>WayPoint brings nearby places and community context into one clear view, so your next move starts with better questions.</p>
        </div>
        <div className="insights-layout">
          <div className="insight-panel">
            <div className="panel-header"><span>AN EXAMPLE NEIGHBORHOOD BRIEF</span><span className="sample-pill">{featuredData ? `REAL DATA · ${featuredData.zip}` : 'ILLUSTRATIVE'}</span></div>
            <div className="brief-title"><span className="brief-icon">⌖</span><span><strong>{businessType ? `Independent ${businessType}` : 'Your business'}</strong><small>{featuredData ? `Pomona, ${featuredData.zip} · within 2 miles` : 'Enter your business type to personalize this brief'}</small></span></div>
            <div className="recommendation-list">
              {recommendations.map((item) => (
                <article className="recommendation" key={item.number}>
                  <span className="recommendation-number">{item.number}</span>
                  <div><span className="recommendation-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.description}</p></div>
                  <span className="recommendation-icon" aria-hidden="true">{item.icon}</span>
                </article>
              ))}
            </div>
            <p className="panel-footnote">Ideas are starting points based on available neighborhood indicators—not predictions of customer demand or sales.{featuredData && ' Sources: Overture Maps, SafeGraph Open Census.'}</p>
          </div>
          <aside className="how-card" id="how-it-works">
            <span className="how-number">01 — 03</span>
            <h3>Know the block.<br /><em>Spot the openings.</em></h3>
            <p>We bring together public demographic context, nearby business locations, and other local indicators to help you explore where your business could fit.</p>
            <a href="#get-started">Start with your ZIP code <span>→</span></a>
            <div className="orbit-art" aria-hidden="true"><span className="orbit orbit-a" /><span className="orbit orbit-b" /><span className="orbit-center">b.</span><i className="orbit-node node-a" /><i className="orbit-node node-b" /><i className="orbit-node node-c" /></div>
          </aside>
        </div>
      </section>

      <footer className="site-footer page-shell">
        <a className="brand" href="#home" aria-label="WayPoint home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>WayPoint</span></a>
        <span>Built for the businesses that make a neighborhood. <a href="#about-the-data" className="footer-about" onClick={openAbout}>About the data</a></span>
        <a href="#home" className="back-top">Back to top ↑</a>
      </footer>
      </main>
    </>
  )
  }
  return <>{renderPage()}{currentUser && <div hidden={currentPage !== 'chat'}><ChatPage key={currentUser.email} integration={integration} search={activeSearch} user={currentUser} onBack={() => setCurrentPage(chatReturnPage)} /></div>}</>

}

export default App
