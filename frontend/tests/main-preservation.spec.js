import process from 'node:process'
import { test, expect } from '@playwright/test'

const boundary = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: {
  type: 'Polygon', coordinates: [[[-117.84, 34.03], [-117.74, 34.03], [-117.74, 34.09], [-117.84, 34.09], [-117.84, 34.03]]],
} }] }

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('waypoint-demo-session-v1', JSON.stringify({ email: 'merge-regression@example.test' })))
  // Only the external Census boundary is synthetic. ZIP and precomputed heatmap data come from main's real exports.
  await page.route('https://tigerweb.geo.census.gov/**', (route) => route.fulfill({ json: boundary }))
}

test('main demo, precomputed heatmap, saved spots and dashboard survive the merge', async ({ page, request }) => {
  await prepare(page)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const analyzed = []
  await page.route('**/api/analyze', async (route) => {
    const body = route.request().postDataJSON()
    if (body.include_location_summary) analyzed.push(body)
    const response = await request.post(`http://127.0.0.1:${process.env.BLOCKBOOST_TEST_API_PORT ?? '8000'}/api/analyze`, { data: body })
    await route.fulfill({ json: await response.json() })
  })
  await page.goto('/#demo')
  await expect(page.getByRole('heading', { name: 'Explore 91768' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Nearby business results' })).toBeVisible()
  await expect(page.locator('.search-metric').nth(1).locator('strong')).toHaveText('20')
  await expect(page.getByText('Static data, not a live warehouse query', { exact: false })).toBeVisible()
  await expect(page.locator('.leaflet-map')).toBeVisible()
  await page.getByRole('button', { name: /Recommended/ }).click()
  await expect(page.locator('.place-card')).toHaveCount(3)
  const title = await page.locator('.place-card h3').first().textContent()
  await page.locator('.place-card').first().click()
  await expect(page.locator('.place-card.is-selected')).toHaveCount(1)
  await expect(page.locator('.heat-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.selected-map-ping')).toHaveCount(1)
  await expect.poll(() => analyzed.length).toBeGreaterThan(1)
  expect(analyzed.at(-1).business_description).toContain(title)
  expect(analyzed.at(-1).location).not.toEqual(analyzed[0].location)
  await page.locator('.place-card').first().getByRole('button', { name: 'Save Location' }).click()
  await expect(page.getByText('Location saved!', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Open dashboard for/ }).click()
  await expect(page.locator('.saved-location-card')).toHaveCount(1)
  await expect(page.locator('.saved-location-card')).toContainText(title)
  await page.locator('.saved-location-card').getByRole('button', { name: 'Open map' }).click()
  await expect(page.locator('.selected-map-ping')).toHaveCount(1)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to explore?' })).toBeVisible()
  await page.getByRole('button', { name: 'Close chat' }).click()
  await expect(page.locator('.selected-map-ping')).toHaveCount(1)
  await page.getByRole('button', { name: /Open dashboard for/ }).click()
  await page.locator('.saved-location-card').getByRole('button', { name: /Remove/ }).click()
  await expect(page.getByText('Location unsaved!', { exact: true })).toBeVisible()
  await expect(page.locator('.saved-location-card')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('main About data route and relevance ranking remain available for broad finder searches', async ({ page }) => {
  await prepare(page)
  await page.goto('/#about-the-data')
  await expect(page.getByRole('heading', { name: 'Where a small business opens matters.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Real places, at neighborhood scale' })).toBeVisible()
  await page.goto('/')
  await page.getByLabel('I run a').fill('Starbucks coffee')
  await page.getByLabel('Located in').fill('91768')
  await page.getByLabel('Within', { exact: false }).fill('5')
  await page.getByRole('button', { name: /Explore my area/ }).click()
  await expect(page.locator('.place-card h3').first()).toContainText(/Starbucks/i)
  await expect(page.getByRole('heading', { name: 'Explore 91768' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Backend analysis', exact: true })).toBeVisible()
  // A finder radius above the API's 5000m maximum must not block the existing search.
  await expect(page.locator('.search-metric').nth(1).locator('strong')).toHaveText('59')
})
