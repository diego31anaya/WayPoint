import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const available = (value) => value == null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 2 })

function OpportunityMap({ analysis, map, onSelect }) {
  const element = useRef(null)
  useEffect(() => {
    if (!analysis || !element.current) return
    const center = analysis.location
    const instance = L.map(element.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([center.latitude, center.longitude], 13)
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(instance)
    L.circle([center.latitude, center.longitude], { radius: analysis.radius_m, color: '#365b43', fillOpacity: 0.03 }).addTo(instance)
    const zones = L.geoJSON(map, {
      style: (feature) => ({ color: '#365b43', weight: 1, fillOpacity: 0.5,
        fillColor: feature.properties.opportunity_score == null ? '#999' : feature.properties.opportunity_score >= 60 ? '#365b43' : feature.properties.opportunity_score >= 35 ? '#b8b46b' : '#d27a4e' }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(`Opportunity: ${available(feature.properties.opportunity_score)} / 100`)
        layer.on('click', () => onSelect(feature))
      },
    }).addTo(instance)
    if (zones.getLayers().length) instance.fitBounds(zones.getBounds(), { padding: [20, 20] })
    for (const place of analysis.nearby_businesses) {
      const label = document.createElement('span')
      label.textContent = `${place.name} · ${place.category} · ${available(place.distance_m)} m`
      L.circleMarker([place.latitude, place.longitude], { radius: 4, color: '#365b43' }).bindPopup(label).addTo(instance)
    }
    return () => { instance.stop(); instance.remove() }
  }, [analysis, map, onSelect])
  return <div className="neighborhood-map-stage"><div ref={element} className="leaflet-map" role="region" aria-label="Opportunity scores and nearby businesses" /></div>
}

export default function AnalysisResults({ integration, compact = false }) {
  const { status, analysis, map, selected, activeAnalysis, selectZone } = integration
  if (status === 'idle') return null
  if (status === 'loading') return <div className="insights-status" role="status">Loading Snowflake neighborhood analysis…</div>
  if (status === 'error') return <div className="insights-status" role="alert"><strong>{integration.error}</strong><button onClick={integration.retry}>Try again</button></div>
  const result = activeAnalysis
  const metrics = result?.metrics
  const ranked = [...(map?.features ?? [])].filter((feature) => feature.properties.opportunity_score != null)
    .sort((a, b) => b.properties.opportunity_score - a.properties.opportunity_score)
  return <section className="neighborhood-insights" aria-label="Backend analysis results">
    <p role="status"><strong>{analysis.metadata.simulated ? 'SIMULATED MOCK DATA — not live observations' : `Snowflake · ${analysis.metadata.dataset_release}`}</strong></p>
    {!compact && <>
      <section className="neighborhood-map-shell">
        <div className="neighborhood-map-toolbar">Opportunity zones · green: 60–100 · yellow: 35–59 · orange: below 35 · gray: unavailable</div>
        <OpportunityMap analysis={activeAnalysis ?? analysis} map={map} onSelect={selectZone} />
      </section>
      {integration.mapStatus === 'loading' && <p role="status">Loading opportunity zones…</p>}
      {integration.mapStatus === 'error' && <p role="alert">{integration.mapError} <button onClick={integration.retry}>Retry analysis and map</button></p>}
      {map && !map.features.length && <p>{map.metadata.simulated ? 'Mock mode has no geographic zone fixtures.' : 'No geographic zones returned. Opportunity data is unavailable.'}</p>}
      {(map?.metadata.limitations ?? []).map((text) => <p className="map-screen-footnote" key={text}>{text}</p>)}
      {ranked.length > 0 && <article className="insight-list"><h3>Recommended locations</h3><p>Ranked by mapped-place heuristic, not measured demand.</p><ol>{ranked.slice(0, 5).map((feature) => <li key={feature.properties.h3_cell}><button onClick={() => selectZone(feature)}>{feature.properties.h3_cell}: {available(feature.properties.opportunity_score)} / 100</button> · {feature.properties.competitor_count} competitors · {feature.properties.complementary_count} complements</li>)}</ol></article>}
    </>}
    {selected && <article className="insight-list"><h3>Selected zone {selected.feature.properties.h3_cell}</h3><p>Zone score: {available(selected.feature.properties.opportunity_score)} / 100 · {selected.feature.properties.competitor_count} competitors · density {available(selected.feature.properties.competitor_density_per_sq_km)} / km² · {selected.feature.properties.complementary_count} complements</p><p>Potential market gaps are inferred from mapped competition and complements. No measured demand data is available.</p><button onClick={() => selectZone(null)}>Return to original location</button></article>}
    {selected?.status === 'loading' && <p role="status">Analyzing the selected location and generating its explanation…</p>}
    {selected?.status === 'error' && <p role="alert">{selected.error} <button onClick={integration.retrySelection}>Try again</button></p>}
    {result && <>
      <p>{selected ? 'Radius analysis centered on the selected zone' : 'Radius analysis centered on the ZIP centroid'} · {available(result.radius_m)} meters. Zone counts cover the whole H3 cell; radius counts below cover this circle.</p>
      <div className="insight-stats">{[
        ['COMPETITION', metrics.competitor_count, `${available(metrics.competitor_density_per_sq_km)} per km²`],
        ['NEAREST COMPETITOR', metrics.nearest_competitor_distance_m, 'meters; unavailable when none are mapped'],
        ['COMPLEMENTARY BUSINESSES', metrics.complementary_count, `${available(metrics.total_businesses)} mapped businesses in total`],
        ['DEMOGRAPHICS', null, 'No verified demographic dataset is integrated'],
      ].map(([label, value, detail]) => <article className="insight-stat" key={label}><span className="insight-stat-label">{label}</span><strong>{available(value)}</strong><small>{detail}</small></article>)}</div>
      <div className="insight-lists">
        <article className="insight-list"><h3>Nearby competitors</h3>{result.neighborhood_insights?.nearest_competitors.length ? <ol>{result.neighborhood_insights.nearest_competitors.map((place, index) => <li key={place.business_id ?? index}>{place.name} · {available(place.distance_m)} m</li>)}</ol> : <p>No competitor markers available.</p>}</article>
        <article className="insight-list"><h3>Category distribution</h3>{Object.entries(metrics.category_distribution).map(([category, count]) => <p key={category}>{category.replaceAll('_', ' ')}: {count}</p>)}</article>
        <article className="insight-list"><h3>Relevant nearby businesses</h3>{result.neighborhood_insights?.points_of_interest.length ? <ol>{result.neighborhood_insights.points_of_interest.map((place, index) => <li key={place.business_id ?? index}>{place.name} ? {place.category.replaceAll('_', ' ')} ? {available(place.distance_m)} m</li>)}</ol> : <p>No relevant business markers available.</p>}</article>
        {result.opportunity_signals.map((signal) => <article className="insight-list" key={signal.signal_id}><h3>{signal.signal_id.replaceAll('_', ' ')}</h3><strong>{metrics.total_businesses > metrics.unknown_category_count ? `${available(signal.score)} / 100` : 'Unavailable'}</strong><p>{signal.explanation}</p></article>)}
      </div>
      {!result.opportunity_signals.length && <p>Opportunity score and market-gap indicators: unavailable because there are no classified mapped businesses.</p>}
      {result.neighborhood_insights?.marker_subset_only && <p className="map-screen-footnote">Business markers and nearest competitor lists are truncated. Counts and scalar nearest distance use the full query.</p>}
      {result.location_summary && <article className="insight-list"><h3>Location explanation</h3><p>{result.location_summary.summary}</p><small>Source: {result.location_summary.source}</small><ul>{result.location_summary.supporting_evidence.map((e) => <li key={e.metric_id}>{e.metric_id}: {available(e.value)} {e.unit}</li>)}</ul></article>}
      {result.score_explanation && <article className="insight-list"><h3>Score explanation</h3><p>{result.score_explanation.summary}</p><small>Source: {result.score_explanation.source}</small></article>}
      <div className="insight-lists">{result.recommendations.map((recommendation) => <article className="insight-list" key={recommendation.title}><h3>{recommendation.title}</h3><p>{recommendation.description}</p><p>{recommendation.reason}</p><ul>{recommendation.supporting_evidence.map((e) => <li key={e.metric_id}>{e.metric_id}: {available(e.value)} {e.unit}</li>)}</ul><ul>{recommendation.action_steps.map((step) => <li key={step}>{step}</li>)}</ul></article>)}</div>
      <p className="map-screen-footnote">Recommendations: {result.metadata.recommendation_source}. Ownership and demographics are unavailable. Scores are unvalidated heuristics.</p>
      {result.metadata.warnings.map((warning) => <p className="map-screen-footnote" key={warning}>{warning}</p>)}
    </>}
  </section>
}
