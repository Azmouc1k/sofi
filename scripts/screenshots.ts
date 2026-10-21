// Captures the main views of the running app into "progress screens/", one
// folder per run named by date and commit, so the folder reads as a
// timeline of how the app looked. Needs `npm run dev` running first.
//
//   npm run screenshots
//
// Only reads the app — it opens a note but never types into it.
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from 'playwright'

const APP_URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5173'
const VIEWPORT = { width: 1440, height: 900 }
// The graph starts from random positions; give it time to settle.
const GRAPH_SETTLE_MS = 3000
const THEMES = ['light', 'dark'] as const
const OUT_ROOT = 'progress screens'

function git(command: string): string {
  return execSync(`git ${command}`, { encoding: 'utf8' }).trim()
}

// e.g. "2026-10-21_a85b0c8", with "+wip" when there are uncommitted changes
// so a mid-feature capture isn't mistaken for that commit.
function runFolderName(): string {
  const date = new Date().toISOString().slice(0, 10)
  const commit = git('rev-parse --short HEAD')
  // Earlier uncommitted captures don't count as changes to the app.
  const dirty = git(`status --porcelain -- . ":(exclude)${OUT_ROOT}"`) !== ''
  return `${date}_${commit}${dirty ? '+wip' : ''}`
}

async function assertAppRunning() {
  try {
    await fetch(APP_URL)
  } catch {
    console.error(`The app isn't reachable at ${APP_URL}. Start it with "npm run dev" first.`)
    process.exit(1)
  }
}

async function openView(page: Page, label: 'Dashboard' | 'Notes' | 'Graph') {
  await page.getByRole('button', { name: label, exact: true }).first().click()
}

async function captureTheme(page: Page, outDir: string, theme: string) {
  const shot = (name: string) => page.screenshot({ path: path.join(outDir, `${name}-${theme}.png`) })

  await page.goto(APP_URL)

  await openView(page, 'Notes')
  await page.locator('li button').first().click()
  await page.waitForTimeout(500)
  await shot('notes')

  await openView(page, 'Graph')
  await page.waitForTimeout(GRAPH_SETTLE_MS)
  await shot('graph')
  await page.getByRole('button', { name: 'Graph settings' }).click()
  await shot('graph-forces')

  await openView(page, 'Dashboard')
  await page.waitForTimeout(GRAPH_SETTLE_MS)
  await shot('dashboard')
}

async function main() {
  await assertAppRunning()
  const outDir = path.join(OUT_ROOT, runFolderName())
  mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT })
      // Same key the app's theme toggle saves to (src/lib/theme.ts).
      await context.addInitScript((t) => localStorage.setItem('theme', t), theme)
      await captureTheme(await context.newPage(), outDir, theme)
      await context.close()
    }
  } finally {
    await browser.close()
  }
  console.log(`Saved screenshots to ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
