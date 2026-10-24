import { test, expect } from '@playwright/test'

// Synthetic Markdown fixtures exercise rendering only; no Snowflake calls are made.
const initial = [
  '# Neighborhood brief', '', '## Competition', '',
  'A **strong opportunity** needs *careful research* and `verified_metrics`.', '',
  'First line', 'Second line', '',
  '- Review competitors', '- Check the neighborhood', '  - Confirm coverage', '',
  '1. Pick a location', '2. Validate the evidence', '',
  '[Source details](https://example.com/source)', '',
  '```sql', 'SELECT category,', '       COUNT(*) AS places', 'FROM verified_places;', '```', '',
  '| Metric | Status |', '| --- | --- |', '| Population | Unavailable |', '| Competition | Verified |', '',
  '<script>window.__markdownUnsafe = true</script>', '',
  '<img src="x" onerror="window.__markdownUnsafe = true">', '',
  '[Unsafe destination](javascript:window.__markdownUnsafe=true)',
].join('\n')
const followup = [
  '### Next steps', '', '**Keep the same location** and *verify the source*.', '',
  '- Compare categories', '- Review limitations', '',
  '1. Visit the area', '2. Record observations', '',
  '| Question | Answer |', '| --- | --- |', '| New data? | Unavailable |', '',
  '```text', '**This code remains literal**', '  indentation stays intact', '```', '',
  '[Follow-up source](https://example.com/followup)',
].join('\n')

test('initial and follow-up replies render safe Markdown inside existing chat messages', async ({ page }) => {
  const turns = []
  await page.addInitScript(() => localStorage.setItem('waypoint-demo-session-v1', JSON.stringify({ email: 'markdown@example.test' })))
  await page.route('**/api/agent/chat', async (route) => {
    turns.push(route.request().postDataJSON())
    await route.fulfill({ json: { response: turns.length === 1 ? initial : followup, conversation_id: '874956580',
      analyst_query_ids: [], supporting_metrics: {}, relevant_location_ids: [], metadata: { simulated: true } } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  const draft = page.getByRole('textbox', { name: 'Message WayPoint' })
  await draft.fill('Show **literal user input**')
  await page.getByRole('button', { name: 'Send message' }).click()
  const first = page.locator('.chat-message.assistant').first()
  await expect(first.getByRole('heading', { name: 'Neighborhood brief', level: 1 })).toBeVisible()
  await expect(first.getByRole('heading', { name: 'Competition', level: 2 })).toBeVisible()
  await expect(first.locator('strong')).toHaveText('strong opportunity')
  await expect(first.locator('em')).toHaveText('careful research')
  await expect(first.locator('ul > li')).toHaveCount(3)
  await expect(first.locator('ol > li')).toHaveCount(2)
  await expect(first.getByRole('link', { name: 'Source details' })).toHaveAttribute('href', 'https://example.com/source')
  await expect(first.locator('pre code')).toHaveText('SELECT category,\n       COUNT(*) AS places\nFROM verified_places;\n')
  await expect(first.locator('code.language-sql')).toHaveCount(1)
  await expect(first.getByRole('columnheader')).toHaveText(['Metric', 'Status'])
  await expect(first.getByRole('cell')).toHaveText(['Population', 'Unavailable', 'Competition', 'Verified'])
  await expect(first.locator('p').filter({ hasText: 'First line' }).locator('br')).toHaveCount(1)
  await expect(first.locator('script, img, iframe, [onerror], [onclick]')).toHaveCount(0)
  await expect(first.getByRole('link', { name: 'Unsafe destination' })).not.toHaveAttribute('href', /^javascript:/i)
  expect(await page.evaluate(() => window.__markdownUnsafe)).toBeUndefined()
  await expect(page.locator('.chat-message.user p')).toHaveText('Show **literal user input**')
  await expect(page.locator('.chat-message.user strong')).toHaveCount(0)

  await draft.fill('And what should I do next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  const second = page.locator('.chat-message.assistant').nth(1)
  await expect(second.getByRole('heading', { name: 'Next steps', level: 3 })).toBeVisible()
  await expect(second.locator('strong')).toHaveText('Keep the same location')
  await expect(second.locator('em')).toHaveText('verify the source')
  await expect(second.locator('ul > li')).toHaveCount(2)
  await expect(second.locator('ol > li')).toHaveCount(2)
  await expect(second.locator('pre code')).toHaveText('**This code remains literal**\n  indentation stays intact\n')
  await expect(second.getByRole('columnheader')).toHaveText(['Question', 'Answer'])
  await expect(second.getByRole('link', { name: 'Follow-up source' })).toHaveAttribute('href', 'https://example.com/followup')
  expect(turns[1].conversation_id).toBe('874956580')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('waypoint-chat-history-v1:markdown@example.test'))[0].messages.filter((item) => item.role === 'assistant').map((item) => item.content))).toEqual([initial, followup])

  await page.reload()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Neighborhood brief', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Next steps', level: 3 })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await second.locator('table').evaluate((table) => table.clientWidth <= table.closest('.chat-message-content').clientWidth)).toBe(true)
})
