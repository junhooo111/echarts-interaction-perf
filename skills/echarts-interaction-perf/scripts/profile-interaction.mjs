#!/usr/bin/env node
// Records one interaction in headless Chrome and prints where main-thread time went.
//
//   node profile-interaction.mjs --url=http://localhost:5173/ --interaction=./my-interaction.mjs [--top=12] [--json]
//
// The interaction module must default-export `async (page) => { ... }` that performs the gesture to measure
// (mouse moves, wheel zoom, clicks). The script only reads from the page: it starts a local, headless Chrome through
// Playwright, attaches the Chrome DevTools Protocol profiler, and prints a report. It makes no network requests of
// its own and never writes outside stdout (use --json to get machine-readable output).
//
// Requires: `npm i -D playwright-core` in the folder you run this from, and an installed Chrome (or pass --channel=msedge).

import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// playwright-core is resolved from the directory you run the command in (your project), not from the skill folder.
let chromium
try {
  const requireFromCwd = createRequire(path.join(process.cwd(), 'noop.js'))
  const mod = await import(pathToFileURL(requireFromCwd.resolve('playwright-core')).href)
  chromium = mod.chromium ?? mod.default?.chromium
} catch {
  console.error('playwright-core was not found. Run `npm i -D playwright-core` in your project, then run this command from that folder.')
  process.exit(2)
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=')
    return [k, rest.length ? rest.join('=') : true]
  })
)

if (!args.url || !args.interaction) {
  console.error('usage: profile-interaction.mjs --url=<page> --interaction=<module> [--top=12] [--channel=chrome] [--json]')
  process.exit(2)
}

const top = Number(args.top ?? 12)
const channel = String(args.channel ?? 'chrome')
const interaction = (await import(pathToFileURL(path.resolve(String(args.interaction))).href)).default
if (typeof interaction !== 'function') {
  console.error('the interaction module must default-export an async function (page) => void')
  process.exit(2)
}

const browser = await chromium.launch({ channel, headless: true, args: ['--enable-precise-memory-info'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(String(args.url))
await page.waitForLoadState('load')

const client = await page.context().newCDPSession(page)
await client.send('Performance.enable')
await client.send('Profiler.enable')
await client.send('Profiler.setSamplingInterval', { interval: 200 })

const readMetrics = async () => {
  const { metrics } = await client.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}

const m0 = await readMetrics()
const wall0 = Date.now()
await client.send('Profiler.start')
await interaction(page)
const { profile } = await client.send('Profiler.stop')
const wallSeconds = (Date.now() - wall0) / 1000
const m1 = await readMetrics()
await browser.close()

// ---- main-thread buckets from CDP Performance metrics (seconds -> ms) ----
const delta = (name) => Math.max(0, ((m1[name] ?? 0) - (m0[name] ?? 0)) * 1000)
const task = delta('TaskDuration')
const script = delta('ScriptDuration')
const layout = delta('LayoutDuration')
const style = delta('RecalcStyleDuration')
const other = Math.max(0, task - script - layout - style)

// ---- CPU profile: self time per function, callers, GC share ----
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const parentOf = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id)

const keyOf = (n) => {
  const f = n.callFrame
  const url = f.url ? f.url.split('/').slice(-2).join('/') : ''
  return `${f.functionName || '(anonymous)'} ${url}:${f.lineNumber + 1}`
}

const selfUs = new Map()
const inclusiveUs = new Map()
const callerUs = new Map()
let totalUs = 0
let gcUs = 0
let idleUs = 0
for (let i = 0; i < profile.samples.length; i++) {
  const nodeId = profile.samples[i]
  const dt = profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0
  const node = byId.get(nodeId)
  const name = node.callFrame.functionName
  totalUs += dt
  if (name === '(garbage collector)') gcUs += dt
  if (name === '(idle)') idleUs += dt
  if (name === '(idle)' || name === '(program)' || name === '(root)') continue

  const key = keyOf(node)
  selfUs.set(key, (selfUs.get(key) ?? 0) + dt)

  const seen = new Set()
  let cur = nodeId
  let hop = 0
  while (cur != null) {
    const k = keyOf(byId.get(cur))
    if (!seen.has(k)) {
      seen.add(k)
      inclusiveUs.set(k, (inclusiveUs.get(k) ?? 0) + dt)
    }
    if (hop === 1) {
      const callerKey = `${key} <- ${k}`
      callerUs.set(callerKey, (callerUs.get(callerKey) ?? 0) + dt)
    }
    cur = parentOf.get(cur)
    hop++
  }
}

const busyUs = totalUs - idleUs
const pct = (us, base) => (base > 0 ? `${((us / base) * 100).toFixed(1)}%` : 'n/a')
const ms = (us) => (us / 1000).toFixed(1)
const rank = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)

const report = {
  wallSeconds: Number(wallSeconds.toFixed(2)),
  mainThreadMs: { task, script, layout, recalcStyle: style, otherTaskWork: other },
  profile: {
    sampledBusyMs: Number(ms(busyUs)),
    gcMs: Number(ms(gcUs)),
    topSelf: rank(selfUs).map(([k, us]) => ({ fn: k, selfMs: Number(ms(us)), share: pct(us, busyUs) })),
    topInclusive: rank(inclusiveUs).map(([k, us]) => ({ fn: k, totalMs: Number(ms(us)), share: pct(us, busyUs) })),
    topCallers: rank(callerUs).map(([k, us]) => ({ edge: k, ms: Number(ms(us)) })),
  },
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const lines = []
lines.push(`# Interaction profile (${report.wallSeconds}s wall clock)`, '')
lines.push('## Main-thread time (CDP Performance metrics)', '')
lines.push('| bucket | ms | share of task time |', '|---|---|---|')
for (const [name, v] of [
  ['Scripting (JS)', script],
  ['Layout', layout],
  ['Style recalc', style],
  ['Other task work (paint, composite, ...)', other],
]) {
  lines.push(`| ${name} | ${v.toFixed(0)} | ${pct(v, task)} |`)
}
lines.push(`| **Task total** | ${task.toFixed(0)} | 100% |`, '')
lines.push(`Sampled CPU: ${ms(busyUs)} ms busy, of which garbage collection ${ms(gcUs)} ms (${pct(gcUs, busyUs)}).`, '')
lines.push('## Top functions by self time', '', '| function | self ms | share |', '|---|---|---|')
for (const r of report.profile.topSelf) lines.push(`| ${r.fn} | ${r.selfMs} | ${r.share} |`)
lines.push('', '## Top functions by inclusive time (includes callees)', '', '| function | total ms | share |', '|---|---|---|')
for (const r of report.profile.topInclusive) lines.push(`| ${r.fn} | ${r.totalMs} | ${r.share} |`)
lines.push('', '## Heaviest caller edges (callee <- caller)', '', '| edge | ms |', '|---|---|')
for (const r of report.profile.topCallers) lines.push(`| ${r.edge} | ${r.ms} |`)
console.log(lines.join('\n'))
