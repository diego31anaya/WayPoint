// Opportunity heatmap files written by `python3 -m data.heatmap` into public/data/heat.
let outlinesPromise

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Heatmap request failed (${response.status})`)
  return response.json()
}

function fetchOutlines() {
  outlinesPromise ??= fetchJson('/data/heat/cells.json').catch((error) => {
    outlinesPromise = undefined
    throw error
  })
  return outlinesPromise
}

// One entry per hexagon: outline, center and the score parts for `category`.
export async function fetchHeat(category) {
  const [outlines, data] = await Promise.all([fetchOutlines(), fetchJson(`/data/heat/${category}.json`)])
  const cells = data.cells.map((row) => {
    const cell = Object.fromEntries(data.columns.map((column, i) => [column, row[i]]))
    const flat = outlines[cell.cell]
    cell.outline = []
    for (let i = 0; i < flat.length; i += 2) cell.outline.push([flat[i], flat[i + 1]])
    cell.center = [0, 1].map((k) => cell.outline.reduce((sum, point) => sum + point[k], 0) / cell.outline.length)
    return cell
  })
  return { ...data, cells }
}

// Red (crowded, more closures) through amber to green and blue (more room).
const STOPS = [[35, [214, 73, 51]], [50, [242, 177, 52]], [65, [63, 166, 106]], [80, [43, 123, 185]]]

export function scoreColor(score) {
  if (score <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`
  for (let i = 1; i < STOPS.length; i++) {
    const [hi, to] = STOPS[i]
    const [lo, from] = STOPS[i - 1]
    if (score <= hi) {
      const t = (score - lo) / (hi - lo)
      return `rgb(${from.map((c, k) => Math.round(c + (to[k] - c) * t))})`
    }
  }
  return `rgb(${STOPS.at(-1)[1]})`
}

export const HEAT_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([, c]) => `rgb(${c})`).join(', ')})`
