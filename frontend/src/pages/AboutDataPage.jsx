import { useEffect, useMemo, useState } from 'react'
import AccountControl from '../components/AccountControl'
import { fetchHeat, HEAT_GRADIENT, scoreColor } from '../services/heatmap'
import { CATEGORY_LABELS } from '../services/zipData'
import './AboutDataPage.css'

// Numbers come from public/data/story.json (python3 -m data.eda) and the heatmap files (python3 -m data.heatmap).
const pct = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`
const count = (v) => v.toLocaleString('en-US')
const compact = (v) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v)

const CATEGORY_NAMES = { cafe: 'Cafes', restaurant: 'Restaurants', retail: 'Retail', services: 'Services' }
const PLACES = [['Downtown LA', 34.0522, -118.2437], ['Pomona', 34.0551, -117.7499], ['Santa Monica', 34.0195, -118.4912], ['Pasadena', 34.1478, -118.1445]]

function Source({ fact }) {
  return <p className="about-source">{fact.geography}, {fact.period}. <a href={fact.url} target="_blank" rel="noreferrer">{fact.source}</a></p>
}

function Tile({ fact, format, label }) {
  return (
    <article className="about-card about-tile">
      <strong>{format(fact.value)}</strong>
      <span>{label}</span>
      <Source fact={fact} />
    </article>
  )
}

// Vertical bars on a 0..max scale, value above each bar. Drawn in a fixed viewBox that scales with the card.
function Columns({ rows, max, color, label }) {
  const w = 520, h = 230, top = 26, bottom = 30
  const band = w / rows.length
  const y = (v) => h - bottom - ((h - top - bottom) * v) / max
  return (
    <svg className="about-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={rows.map((r) => `${label(r)}: ${pct(r.value)}`).join(', ')}>
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="about-axis" />
      {rows.map((r, i) => {
        const x = band * i + band * 0.2
        return (
          <g key={label(r)}>
            <title>{`${label(r)}: ${pct(r.value)}${r.detail ? ` · ${r.detail}` : ''}`}</title>
            <rect x={x} width={band * 0.6} y={y(r.value)} height={y(0) - y(r.value)} rx="4" fill={color} />
            <text x={x + band * 0.3} y={y(r.value) - 8} textAnchor="middle" className="about-value">{pct(r.value)}</text>
            <text x={x + band * 0.3} y={h - 9} textAnchor="middle">{label(r)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Horizontal bars with a label column; rows may carry several series.
function Bars({ groups, series, max, format, w = 560 }) {
  const labelW = 130, valueW = 64, barH = 16, gap = 4, groupGap = 18
  const groupH = series.length * (barH + gap) - gap
  const h = groups.length * (groupH + groupGap) - groupGap + 4
  const x = (v) => ((w - labelW - valueW) * v) / max
  return (
    <svg className="about-chart" viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={groups.map((g) => `${g.label}: ${series.map((s) => `${s.name} ${format(g.values[s.key])}`).join(', ')}`).join('; ')}>
      {groups.map((g, gi) => {
        const top = gi * (groupH + groupGap) + 2
        return (
          <g key={g.label}>
            <text x="0" y={top + groupH / 2} dominantBaseline="middle" className="about-cat">{g.label}</text>
            {series.map((s, si) => {
              const yy = top + si * (barH + gap)
              const v = g.values[s.key]
              return (
                <g key={s.key}>
                  <title>{`${g.label} · ${s.name}: ${format(v)}${g.details?.[s.key] ? ` · ${g.details[s.key]}` : ''}`}</title>
                  <rect x={labelW} y={yy} height={barH} width={Math.max(2, x(v))} rx="4" fill={s.color} />
                  <text x={labelW + x(v) + 6} y={yy + barH / 2} dominantBaseline="middle" className="about-value">{format(v)}</text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

function OpportunityMap() {
  const [category, setCategory] = useState('cafe')
  const [loaded, setLoaded] = useState({ category: null })
  const [hover, setHover] = useState(null)

  useEffect(() => {
    let current = true
    fetchHeat(category)
      .then((heat) => { if (current) setLoaded({ category, heat }) })
      .catch(() => { if (current) setLoaded({ category, heat: null, failed: true }) })
    return () => { current = false }
  }, [category])

  const heat = loaded.category === category ? loaded.heat : null
  const drawing = useMemo(() => {
    if (!heat) return null
    const k = Math.cos((34 * Math.PI) / 180)
    const lats = heat.cells.flatMap((c) => c.outline.map((p) => p[0]))
    const lons = heat.cells.flatMap((c) => c.outline.map((p) => p[1]))
    const [latMin, latMax, lonMin, lonMax] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
    const w = 1000
    const s = w / ((lonMax - lonMin) * k)
    const project = ([lat, lon]) => [(lon - lonMin) * k * s, (latMax - lat) * s]
    const cells = heat.cells.map((c) => ({ ...c, d: `M${c.outline.map((p) => project(p).map((n) => n.toFixed(1)).join(',')).join('L')}Z` }))
    return { w, h: (latMax - latMin) * s, cells, places: PLACES.map(([name, lat, lon]) => [name, ...project([lat, lon])]) }
  }, [heat])

  const share = heat && {
    room: heat.cells.filter((c) => c.score >= 65).length / heat.cells.length,
    crowded: heat.cells.filter((c) => c.score <= 45).length / heat.cells.length,
  }
  const labels = CATEGORY_LABELS[category]

  return (
    <article className="about-card about-map-card">
      <div className="about-map-head">
        <div>
          <h3>Where a new {labels.one} has room</h3>
          <p className="about-note">
            {share ? <>{pct(share.room, 0)} of scored hexagons score 65 or higher and {pct(share.crowded, 0)} score 45 or lower. </> : null}
            Hover a hexagon for its numbers.
          </p>
        </div>
        <div className="about-chips" role="group" aria-label="Business type">
          {Object.keys(CATEGORY_NAMES).map((c) => (
            <button key={c} type="button" className={c === category ? 'is-active' : ''} aria-pressed={c === category} onClick={() => setCategory(c)}>{CATEGORY_NAMES[c]}</button>
          ))}
        </div>
      </div>
      <div className="about-ramp" style={{ background: HEAT_GRADIENT }} />
      <div className="about-ramp-labels"><span>Crowded, more closures</span><span>More room</span></div>
      <div className="about-map">
        {drawing ? (
          <svg viewBox={`0 0 ${drawing.w} ${drawing.h}`} role="img" aria-label={`Opportunity map for a new ${labels.one} across the Los Angeles area`}
            onMouseMove={(e) => {
              const i = e.target.dataset?.i
              if (i === undefined) { setHover(null); return }
              const box = e.currentTarget.parentElement.getBoundingClientRect()
              setHover({ cell: drawing.cells[Number(i)], x: e.clientX - box.left, y: e.clientY - box.top, width: box.width })
            }}
            onMouseLeave={() => setHover(null)}>
            {drawing.cells.map((c, i) => <path key={c.cell} d={c.d} data-i={i} fill={scoreColor(c.score)} />)}
            {hover && <path d={hover.cell.d} className="about-hex-hover" />}
            {drawing.places.map(([name, x, y]) => (
              <g key={name} className="about-place"><circle cx={x} cy={y} r="4" /><text x={x + 8} y={y - 8}>{name}</text></g>
            ))}
          </svg>
        ) : <div className="about-map-status">{loaded.failed ? 'Couldn’t load the map. Refresh to try again.' : 'Loading the map…'}</div>}
        {hover && (
          <div className="about-tip" style={{ left: Math.min(hover.x + 14, hover.width - 250), top: Math.max(hover.y - 96, 8) }}>
            <strong>Opportunity {hover.cell.score}/100</strong>
            <span>{hover.cell.competitors} {hover.cell.competitors === 1 ? labels.one : labels.many} nearby, where a typical LA area this busy has {Math.round(hover.cell.expected)}</span>
            <span>Estimated closure rate {pct(hover.cell.closure_rate)} (LA {pct(heat.la_closure_rate)})</span>
            <span>{count(hover.cell.businesses)} businesses nearby</span>
          </div>
        )}
      </div>
    </article>
  )
}

function AboutDataPage({ user, onBack, onExplore, onCreateAccount, onOpenDashboard }) {
  const [story, setStory] = useState({ status: 'loading' })

  useEffect(() => {
    fetch('/data/story.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => setStory({ status: 'ready', data }))
      .catch(() => setStory({ status: 'error' }))
  }, [])

  const header = (
    <header className="site-header page-shell">
      <a className="brand" href="#home" aria-label="WayPoint home" onClick={(e) => { e.preventDefault(); onBack() }}>
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>WayPoint</span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#home" onClick={(e) => { e.preventDefault(); onBack() }}>Home</a>
        <a href="#get-started" onClick={(e) => { e.preventDefault(); onExplore() }}>Explore your area</a>
      </nav>
      <AccountControl user={user} onCreateAccount={onCreateAccount} onOpenDashboard={onOpenDashboard} />
    </header>
  )

  if (story.status !== 'ready') {
    return (
      <main className="about-page">
        {header}
        <p className="about-status page-shell">{story.status === 'error' ? 'Couldn’t load the data story. Refresh to try again.' : 'Loading the data story…'}</p>
      </main>
    )
  }

  const { findings: f, facts } = story.data
  const sba = Object.fromEntries(facts.sba.map((row) => [row.id, row]))
  const bls = facts.bls_survival
  const blsAll = bls.rows.filter((r) => r.industry === 'All private businesses')
  const food = Object.fromEntries(bls.rows.filter((r) => r.industry === 'Accommodation and food services').map((r) => [r.years, r.still_open]))
  const own = f.independent_vs_chain
  const ratio = own.independent[0] / own.chain[0]
  const competition = Object.entries(f.closure_by_competition_500m)
  const income = Object.entries(f.closure_by_income)
  const riskMax = Math.max(...competition.map(([, v]) => v[0]), ...income.map(([, v]) => v[0])) * 1.18
  const [lo, hi] = f.income_terciles_usd
  const incomeRange = { lower: `under $${lo / 1000}k`, middle: `$${lo / 1000}k–$${hi / 1000}k`, upper: `over $${hi / 1000}k` }
  const ownershipGroups = [['All places', own], ...Object.entries(f.by_category).map(([k, v]) => [CATEGORY_NAMES[k], v])].map(([label, v]) => ({
    label,
    values: { independent: v.independent[0], chain: v.chain[0] },
    details: { independent: `${count(v.independent[1])} of ${count(v.independent[2])} closed`, chain: `${count(v.chain[1])} of ${count(v.chain[2])} closed` },
  }))
  const firstComp = f.closure_by_competition_500m['0'][0]
  const lastComp = f.closure_by_competition_500m['16+'][0]

  return (
    <main className="about-page">
      {header}

      <section className="about-hero page-shell">
        <div className="eyebrow">THE DATA BEHIND THE MAP</div>
        <h1>Where a small business opens <em>matters.</em></h1>
        <p className="about-lede">
          Small businesses carry the economy, but in Los Angeles independents close <b>{ratio.toFixed(1)}×</b> as often as chains.
          Closures climb with nearby competition, from <b>{pct(firstComp)}</b> with no rival within 500 m to <b>{pct(lastComp)}</b> with 16 or more,
          while neighborhood income barely moves them. WayPoint shows owners where the room is.
        </p>
      </section>

      <section className="trust-strip">
        <div className="page-shell trust-inner">
          <span className="trust-label">Built from</span>
          <span className="data-source"><b className="source-mark snowflake-mark">✳</b> Overture Maps via Snowflake</span>
          <span className="source-divider" />
          <span className="data-source"><b className="source-mark census-mark">▥</b> SafeGraph Open Census</span>
          <span className="source-divider" />
          <span className="data-source"><b className="source-mark">◎</b> SBA &amp; BLS</span>
        </div>
      </section>

      <section className="about-section page-shell" id="why-it-matters">
        <div className="eyebrow">WHY IT MATTERS</div>
        <h2>Small businesses are <em>most</em> of the economy</h2>
        <div className="about-tiles">
          <Tile fact={sba.us_small_businesses} format={compact} label="small businesses in the U.S." />
          <Tile fact={sba.us_net_new_jobs_share} format={(v) => `${Math.round(v * 10)} in 10`} label="U.S. net new jobs came from small businesses" />
          <Tile fact={sba.la_small_businesses} format={compact} label="small businesses in the LA metro" />
          <Tile fact={sba.la_employment_share} format={(v) => pct(v)} label="of LA metro workers are employed by small businesses" />
        </div>
        <div className="about-grid">
          <article className="about-card">
            <h3>In California, small businesses added more jobs than the whole state did</h3>
            <Source fact={sba.ca_small_net_jobs} />
            <Bars
              groups={[{ label: 'Small businesses', values: { n: sba.ca_small_net_jobs.value } }, { label: 'All businesses', values: { n: sba.ca_all_net_jobs.value } }]}
              series={[{ key: 'n', name: 'Net new jobs', color: 'var(--green)' }]}
              max={sba.ca_small_net_jobs.value} format={(v) => `+${count(v)}`} />
            <p className="about-note">Larger employers shed jobs over the same year, so small businesses’ net gain is bigger than the state’s total.</p>
          </article>
          <article className="about-card">
            <h3>Half of new businesses are gone within five years</h3>
            <p className="about-source">{bls.cohort} still operating. <a href={bls.url} target="_blank" rel="noreferrer">{bls.source}</a></p>
            <Columns rows={blsAll.map((r) => ({ value: r.still_open, years: r.years }))} max={1} color="var(--green)"
              label={(r) => `After ${r.years} ${r.years === 1 ? 'year' : 'years'}`} />
            <p className="about-note">Restaurants and other food service: {pct(food[5])} still open after five years, {pct(food[10])} after ten.</p>
          </article>
        </div>
      </section>

      <section className="about-section page-shell" id="the-problem">
        <div className="eyebrow">THE PROBLEM</div>
        <h2>Independents close far more often than chains, <em>in every category</em></h2>
        <article className="about-card">
          <h3>Closure rate by ownership, LA area</h3>
          <p className="about-note">
            Permanently closed ÷ (open + permanently closed), across {count(f.places_with_status)} Overture places with a status.
            Chain = an Overture brand, or a name with a brand tag or 10+ locations across California.
          </p>
          <div className="about-legend"><span><i style={{ background: 'var(--green)' }} />Independent</span><span><i style={{ background: 'var(--orange)' }} />Chain</span></div>
          <Bars w={1000} groups={ownershipGroups} max={Math.max(...ownershipGroups.flatMap((g) => Object.values(g.values)))} format={(v) => pct(v)}
            series={[{ key: 'independent', name: 'Independent', color: 'var(--green)' }, { key: 'chain', name: 'Chain', color: 'var(--orange)' }]} />
        </article>
      </section>

      <section className="about-section page-shell" id="what-predicts-closing">
        <div className="eyebrow">WHAT PREDICTS CLOSING</div>
        <h2>Nearby competition does. <em>Income barely does.</em></h2>
        <p className="about-intro">Both charts use the same scale. Each place is counted by how many active businesses of its own type (cafe, restaurant, retail or services) sit within 500 m, and by the median household income of its nearest census block group (ACS 2019).</p>
        <div className="about-grid">
          <article className="about-card">
            <h3>Closure rate by same-type competitors within 500 m</h3>
            <Columns rows={competition.map(([k, v]) => ({ key: k, value: v[0], detail: `${count(v[1])} of ${count(v[2])} closed` }))}
              max={riskMax} color="var(--green)" label={(r) => r.key} />
          </article>
          <article className="about-card">
            <h3>Closure rate by neighborhood income</h3>
            <Columns rows={income.map(([k, v]) => ({ key: k, value: v[0], detail: `${incomeRange[k]} · ${count(v[1])} of ${count(v[2])} closed` }))}
              max={riskMax} color="#c3c6ba" label={(r) => `${r.key[0].toUpperCase()}${r.key.slice(1)} third`} />
            <p className="about-note">Thirds of places by block-group median household income: {incomeRange.lower}, {incomeRange.middle}, {incomeRange.upper}.</p>
          </article>
        </div>
      </section>

      <section className="about-section page-shell" id="opportunity-map">
        <div className="eyebrow">WHAT WAYPOINT DOES ABOUT IT</div>
        <h2>An opportunity map for anyone <em>starting</em> a business</h2>
        <p className="about-intro">Each hexagon is about 0.74 km², scored over itself and its six neighbors: room in the market compared with a typical LA area this busy (45%), closure rate compared with LA (35%), and enough activity nearby (20%). Areas with too few businesses stay blank.</p>
        <OpportunityMap />
        <div className="about-cta">
          <button type="button" onClick={onExplore}>Explore your area <span>→</span></button>
        </div>
      </section>

      <section className="about-section page-shell" id="limits">
        <div className="eyebrow">WHAT THIS CAN’T TELL YOU</div>
        <ul className="about-limits">
          <li>Closures come from Overture’s operating status, which is incomplete, so the true rates are higher than these.</li>
          <li>These are comparisons, not causes. Busy areas have more competitors and a different mix of businesses.</li>
          <li>Scores are proxies built from listings. We have no foot traffic, sales or review data.</li>
          <li>The chain rule misses small regional chains with fewer than 10 untagged California locations.</li>
          <li>Census income is from the 2019 ACS. National and state figures are from the SBA and BLS, linked beside each number.</li>
        </ul>
      </section>

      <footer className="site-footer page-shell">
        <a className="brand" href="#home" aria-label="WayPoint home" onClick={(e) => { e.preventDefault(); onBack() }}><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>WayPoint</span></a>
        <span>Built for the businesses that make a neighborhood.</span>
        <a href="#about-the-data" className="back-top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Back to top ↑</a>
      </footer>
    </main>
  )
}

export default AboutDataPage
