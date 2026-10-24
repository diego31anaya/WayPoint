import { useCallback, useEffect, useState } from 'react'
import { apiRequest, businessCategory, zoneCenter } from './api'
import { fetchZipData } from './zipData'

export function useAnalysis(search) {
  const [state, setState] = useState({ status: 'idle' })
  const [retry, setRetry] = useState(0)
  const [selection, setSelection] = useState(null)
  const [selectionRetry, setSelectionRetry] = useState(0)

  useEffect(() => {
    if (!search) return
    const controller = new AbortController()
    const update = (value) => { if (!controller.signal.aborted) setState(value) }
    async function load() {
      update({ status: 'loading', search })
      try {
        const category = businessCategory(search.businessType)
        const radius = Math.min(5000, Math.max(100, Math.round(search.radiusMiles * 1609.34)))
        // The export supplies only the ZIP centroid, never live dashboard metrics.
        const zip = await fetchZipData(search.zipCode, { signal: controller.signal })
        if (!zip?.center) throw new Error('No ZIP center is available for this ZIP code. Try a supported Los Angeles area ZIP, such as 91768.')
        const place = search.selectedPlace
        const latitude = place?.lat ?? place?.coordinates?.[0] ?? zip.center.lat
        const longitude = place?.lon ?? place?.coordinates?.[1] ?? zip.center.lon
        const request = {
          business_type: category,
          business_description: place ? `${search.businessType}; selected location: ${place.name}` : search.businessType,
          location: { latitude, longitude },
          radius_m: radius,
          include_location_summary: true,
          include_score_explanation: true,
        }
        const analysis = await apiRequest('/analyze', request, { signal: controller.signal })
        update({ status: 'ready', search, request, analysis, mapStatus: 'loading' })
        try {
          const map = await apiRequest('/opportunity-map', { business_type: category, location: request.location }, { signal: controller.signal })
          update({ status: 'ready', search, request, analysis, map, mapStatus: 'ready' })
        } catch (error) {
          update({ status: 'ready', search, request, analysis, mapStatus: 'error', mapError: error.message })
        }
      } catch (error) { update({ status: 'error', search, error: error.message }) }
    }
    load()
    return () => controller.abort()
  }, [search, retry])

  const current = state.search === search ? state : { status: search ? 'loading' : 'idle' }
  const selected = selection?.search === search ? selection.feature : null
  useEffect(() => {
    if (!selected || !current.request) return
    const controller = new AbortController()
    const request = { ...current.request, location: zoneCenter(selected) }
    apiRequest('/analyze', request, { signal: controller.signal })
      .then((analysis) => { if (!controller.signal.aborted) setSelection((value) => ({ ...value, status: 'ready', analysis })) })
      .catch((error) => { if (!controller.signal.aborted) setSelection((value) => ({ ...value, status: 'error', error: error.message })) })
    return () => controller.abort()
  }, [selected, current.request, selectionRetry])

  const selectZone = useCallback((feature) => setSelection((value) => {
    if (!feature) return null
    if (value?.search === search && value.feature === feature) return value
    return { search, feature, status: 'loading' }
  }), [search])
  const selectedState = selected ? selection : null
  const activeAnalysis = selected ? (selectedState.status === 'ready' ? selectedState.analysis : null) : current.analysis
  return {
    ...current, selected: selectedState, activeAnalysis, locationLabel: search?.selectedPlace?.name,
    retry: () => { setSelection(null); setRetry((value) => value + 1) },
    retrySelection: () => { setSelection((value) => ({ ...value, status: 'loading', analysis: null, error: null })); setSelectionRetry((value) => value + 1) },
    selectZone,
  }
}
