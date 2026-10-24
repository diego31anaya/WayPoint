import process from 'node:process'
import { test, expect } from '@playwright/test'

// Explicitly opt in: these requests use the real server token and Snowflake compute.
test('LIVE saved Cortex Agent responds and preserves contextual follow-ups in the existing UI', async ({ page }) => {
  test.skip(process.env.LIVE_AGENT_TESTS !== '1', 'Live Snowflake calls require explicit opt-in.')
  test.setTimeout(420000)
  const baseURL = process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:5174'
  const browserErrors = []
  const turns = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => { if (request.url().endsWith('/api/agent/chat')) turns.push(request.postDataJSON()) })
  await page.addInitScript(() => localStorage.setItem('waypoint-demo-session-v1', JSON.stringify({ email: 'live-verification@example.test' })))
  await page.goto(baseURL)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  const draft = page.getByRole('textbox', { name: 'Message WayPoint' })
  await draft.fill('Which business category has the highest reported closure rate in your semantic view? Give a brief answer and state an important limitation.')
  const firstResponse = page.waitForResponse((response) => response.url().endsWith('/api/agent/chat'), { timeout: 200000 })
  await page.getByRole('button', { name: 'Send message' }).click()
  const firstHTTP = await firstResponse
  const first = await firstHTTP.json()
  expect(firstHTTP.status(), JSON.stringify(first)).toBe(200)
  expect(first.metadata.simulated).toBe(false)
  expect(first.metadata.agent).toBe('WAYPOINT.PUBLIC.BUSINESS_ADVISOR')
  expect(first.analyst_query_ids.length).toBeGreaterThan(0)
  await expect(page.locator('.chat-message.assistant .chat-markdown').last()).not.toBeEmpty()
  // Markdown is rendered into elements; storage preserves the original response verbatim.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('waypoint-chat-history-v1:live-verification@example.test'))[0].messages.find((item) => item.role === 'assistant')?.content)).toBe(first.response)
  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await draft.fill('For the category you just identified, repeat its name and explain briefly why that rate does not predict whether my new business will survive. Do not switch categories.')
  const followupResponse = page.waitForResponse((response) => response.url().endsWith('/api/agent/chat'), { timeout: 200000 })
  await page.getByRole('button', { name: 'Send message' }).click()
  const followupHTTP = await followupResponse
  const followup = await followupHTTP.json()
  expect(followupHTTP.status(), JSON.stringify(followup)).toBe(200)
  expect(followup.conversation_id).toBe(first.conversation_id)
  expect(turns[1].conversation_id).toBe(first.conversation_id)
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2)
  expect(followup.response.length).toBeGreaterThan(30)
  expect(browserErrors).toEqual([])
  let selectedLocationCheck = null
  if (process.env.LIVE_LOCATION_TESTS === '1') {
    await page.getByRole('button', { name: 'Close chat' }).click()
    await page.getByRole('button', { name: /Try the demo/ }).click()
    await page.getByRole('button', { name: /Recommended/ }).click()
    await expect(page.locator('.place-card')).toHaveCount(3)
    const selectedAnalysis = page.waitForResponse((response) => response.url().endsWith('/api/analyze')
      && response.request().postDataJSON().business_description?.includes('selected location'), { timeout: 30000 })
    await page.locator('.place-card').first().click()
    const analysisHTTP = await selectedAnalysis
    const analysis = await analysisHTTP.json()
    expect(analysisHTTP.status()).toBe(200)
    expect(analysis.metadata.data_source).toBe('local')
    expect(analysis.agent_context).not.toBeNull()
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await draft.fill('Using the current verified selected-location context, what is the competitor count and what data source does it come from? Do not substitute category-wide statistics. Give a short answer.')
    const contextResponse = page.waitForResponse((response) => response.url().endsWith('/api/agent/chat'), { timeout: 200000 })
    await page.getByRole('button', { name: 'Send message' }).click()
    const contextHTTP = await contextResponse
    const contextual = await contextHTTP.json()
    expect(contextHTTP.status(), JSON.stringify(contextual)).toBe(200)
    expect(contextual.conversation_id).toBe(first.conversation_id)
    const locationId = analysis.agent_context.location_id
    expect(contextual.metadata.location_context_sources[locationId]).toBe('local')
    expect(contextual.supporting_metrics[locationId].find((metric) => metric.metric_id === 'competitor_count').value).toBe(analysis.metrics.competitor_count)
    selectedLocationCheck = { source: 'local', competitors: analysis.metrics.competitor_count, answer: contextual.response }
  }
  console.log(JSON.stringify({ live: true, agent: first.metadata.agent, conversation_id: first.conversation_id,
    first_answer: first.response, followup_answer: followup.response, selected_location: selectedLocationCheck, query_ids: first.analyst_query_ids }))
  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to explore?' })).toBeVisible()
})
