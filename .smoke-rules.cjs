const { chromium } = require('playwright')

const port = process.env.SMOKE_PORT || '3311'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(`http://localhost:${port}/rules`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '规则分组' }).waitFor()

  const hint = await page.getByText('仅显示已勾选的规则').count()
  const total = await page.locator('input[type=checkbox]').count()
  const unchecked = await page.locator('input[type=checkbox]:not(:checked)').count()
  const panelGroups = await page.getByText('移除该组').count()

  await page.screenshot({ path: '.smoke-rules-panel.png', fullPage: true })

  await page.getByRole('button', { name: '添加规则' }).first().click()
  const dialog = page.locator('[role=dialog]')
  await dialog.waitFor()
  const title = await dialog.locator('h3').innerText()
  const dialogBoxes = await dialog.locator('input[type=checkbox]').count()
  const dialogUnchecked = await dialog.locator('input[type=checkbox]:not(:checked)').count()
  await page.screenshot({ path: '.smoke-rules-picker.png', fullPage: true })
  await dialog.getByRole('button', { name: '关闭' }).click()

  console.log(
    JSON.stringify({ hint, total, unchecked, panelGroups, title, dialogBoxes, dialogUnchecked, errors }, null, 2)
  )
  await browser.close()

  if (hint === 0 || unchecked !== 0 || panelGroups === 0 || dialogUnchecked === 0 || errors.length > 0) {
    process.exit(1)
  }
})()
