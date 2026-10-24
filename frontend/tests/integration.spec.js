import { test, expect } from '@playwright/test'

async function search(page) {
  await page.goto('/')
  await page.getByLabel('Located in').fill('91768')
  await page.getByRole('button', { name: /Explore my area/ }).click()
}

async function signIn(page) {
  await page.addInitScript(() => localStorage.setItem('waypoint-demo-session-v1', JSON.stringify({ email: 'integration@example.test' })))
}

test('mock dashboard never sends simulated metrics and general chat shows real connection errors', async ({ page }) => {
  const turns = []
  await page.route('**/api/agent/chat', async (route) => {
    turns.push(route.request().postDataJSON())
    await route.fulfill({ status: 503, json: { detail: { message: 'Synthetic unavailable agent connection' } } })
  })
  await signIn(page)
  await search(page)
  await expect(page.getByText('SIMULATED MOCK DATA', { exact: false })).toBeVisible()
  await expect(page.getByText('Mock mode has no geographic zone fixtures.')).toBeVisible()
  await expect(page.getByText('No verified demographic dataset is integrated', { exact: true })).toBeVisible()
  await expect(page.locator('.insight-stat').first().locator('strong')).toHaveText('2')
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByText('General business chat is available.', { exact: false })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message WayPoint' }).fill('How do I research a business idea?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic unavailable agent connection')
  expect(turns[0].business_id).toBeUndefined()
  expect(turns[0].metrics).toBeUndefined()
})

test('fixture-backed full workflow keeps selection, follow-ups, retries and history synchronized', async ({ page, request }) => {
  await signIn(page)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const analyses = []
  const turns = []
  let failNext = false
  await page.route('**/api/analyze', async (route) => {
    const body = route.request().postDataJSON()
    analyses.push(body)
    const response = await request.post('http://127.0.0.1:8000/api/analyze', { data: body })
    const data = await response.json()
    data.agent_context = { business_id: `fixture-business-${analyses.length}`, location_id: `fixture-location-${analyses.length}` }
    await route.fulfill({ json: data })
  })
  await page.route('**/api/opportunity-map', (route) => route.fulfill({ json: {
    type: 'FeatureCollection', metadata: { simulated: true, data_source: 'mock', limitations: ['Explicit synthetic browser test zones.'] },
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-117.80, 34.05], [-117.78, 34.05], [-117.78, 34.07], [-117.80, 34.07], [-117.80, 34.05]]] }, properties: { h3_cell: 'fixture-zone', opportunity_score: 72, competitor_count: 2, competitor_density_per_sq_km: 3, complementary_count: 4 } }],
  } }))
  await page.route('**/api/agent/chat', async (route) => {
    const body = route.request().postDataJSON()
    turns.push(body)
    if (failNext) {
      failNext = false
      return route.fulfill({ status: 503, json: { detail: { message: 'Synthetic connection failure' } } })
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({ json: { response: `Fixture agent answer ${turns.length}`, conversation_id: '874956572', analyst_query_ids: ['fixture-query'], supporting_metrics: {}, relevant_location_ids: [body.location_id], metadata: { simulated: true } } })
  })
  await search(page)
  await expect(page.getByRole('button', { name: 'fixture-zone: 72 / 100' })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  const draft = page.getByRole('textbox', { name: 'Message WayPoint' })
  await draft.fill('What are my competitors?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Cortex Agent is checking Snowflake metrics')).toBeVisible()
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByText('Fixture agent answer 1', { exact: true })).toBeVisible()
  await draft.fill('What should I do next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Fixture agent answer 2', { exact: true })).toBeVisible()
  expect(turns[1].conversation_id).toBe('874956572')
  expect(turns[1].location_id).toBe('fixture-location-1')
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: 'fixture-zone: 72 / 100' }).click()
  await expect(page.getByText('Radius analysis centered on the selected zone', { exact: false })).toBeVisible()
  expect(analyses[1].location.latitude).toBeCloseTo(34.06, 6)
  expect(analyses[1].location.longitude).toBeCloseTo(-117.79, 6)
  await page.getByRole('button', { name: 'fixture-zone: 72 / 100' }).click()
  await expect(page.getByText('Radius analysis centered on the selected zone', { exact: false })).toBeVisible()
  expect(analyses).toHaveLength(2)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByText('Fixture agent answer 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Current location: fixture-zone', { exact: false })).toBeVisible()
  await draft.fill('What about this location?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Fixture agent answer 3', { exact: true })).toBeVisible()
  expect(turns[2].location_id).toBe('fixture-location-2')
  expect(turns[2].conversation_id).toBe('874956572')
  expect(turns[2].selected_zone.h3_cell).toBe('fixture-zone')
  expect(turns[2].message).toBe('What about this location?')
  failNext = true
  await draft.fill('Try this question')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic connection failure')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('Fixture agent answer 5', { exact: true })).toBeVisible()
  await expect(page.locator('.chat-message.user').filter({ hasText: 'Try this question' })).toHaveCount(1)
  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to explore?' })).toBeVisible()
  await draft.fill('Fresh conversation')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Fixture agent answer 6', { exact: true })).toBeVisible()
  expect(turns[5].conversation_id).toBeUndefined()
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: /Open dashboard for/ }).click()
  await expect(page.getByText('Radius analysis centered on the selected zone', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByText('Fixture agent answer 6', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('analysis failure is visible and retry recovers without substituting static data', async ({ page }) => {
  let failure = true
  await page.route('**/api/analyze', async (route) => {
    if (!failure) return route.continue()
    await route.fulfill({ status: 503, json: { detail: { message: 'Synthetic warehouse outage' } } })
  })
  await search(page)
  await expect(page.getByRole('alert')).toContainText('Synthetic warehouse outage')
  await expect(page.locator('.insight-stat')).toHaveCount(0)
  failure = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('SIMULATED MOCK DATA', { exact: false })).toBeVisible()
})


test('fixture heatmap click selects its location and missing map data stays unavailable', async ({ page, request }) => {
  const locations = []
  await page.route('**/api/analyze', async (route) => {
    const body = route.request().postDataJSON()
    locations.push(body.location)
    const response = await request.post('http://127.0.0.1:8000/api/analyze', { data: body })
    await route.fulfill({ json: await response.json() })
  })
  let mapFailed = false
  await page.route('**/api/opportunity-map', async (route) => {
    if (mapFailed) return route.fulfill({ status: 503, json: { detail: { message: 'Synthetic H3 query failure' } } })
    await route.fulfill({ json: { type: 'FeatureCollection', metadata: { simulated: true }, features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-117.80, 34.05], [-117.78, 34.05], [-117.78, 34.07], [-117.80, 34.07], [-117.80, 34.05]]] }, properties: { h3_cell: 'click-zone', opportunity_score: null, competitor_count: 0, competitor_density_per_sq_km: 0, complementary_count: 0 } },
    ] } })
  })
  await search(page)
  const polygon = page.locator('.leaflet-overlay-pane path[fill-opacity="0.5"]')
  await expect(polygon).toHaveCount(1)
  await polygon.click({ force: true })
  await expect(page.getByRole('heading', { name: 'Selected zone click-zone' })).toBeVisible()
  await expect(page.getByText('Zone score: Unavailable', { exact: false })).toBeVisible()
  await expect(page.getByText('Radius analysis centered on the selected zone', { exact: false })).toBeVisible()
  expect(locations[1].longitude).toBeCloseTo(-117.79, 6)
  await page.getByRole('button', { name: 'Return to original location' }).click()
  mapFailed = true
  await page.getByRole('button', { name: 'Edit search' }).click()
  await page.getByRole('button', { name: /Explore my area/ }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic H3 query failure')
  await expect(page.locator('.insight-stat').first().locator('strong')).toHaveText('2')
})
