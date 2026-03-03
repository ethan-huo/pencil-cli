// Formats Pencil batch_get JSON output as readable JSX code.
// Deduplicates structurally identical subtrees into named const components.

type PenNode = {
  type: string
  id?: string
  name?: string
  x?: number
  y?: number
  content?: string
  children?: PenNode[] | '...'
  iconFontName?: string
  iconFontFamily?: string
  [key: string]: unknown
}

const TAG: Record<string, string> = {
  frame: 'Frame',
  group: 'Group',
  rectangle: 'Rect',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  path: 'Path',
  text: 'Text',
  connection: 'Connection',
  note: 'Note',
  icon_font: 'Icon',
  image: 'Image',
  ref: 'Ref',
}

// ── Hash ──────────────────────────────────────────────────────────────────────

// Structural hash excluding id, x, y, name (those are instance-level metadata).
function hash(node: PenNode): string {
  const { id: _id, x: _x, y: _y, name: _name, children, ...rest } = node
  const childHash = !children
    ? null
    : children === '...'
      ? '...'
      : (children as PenNode[]).map(hash).join('|')
  return JSON.stringify({ ...rest, _c: childHash })
}

// ── Props ─────────────────────────────────────────────────────────────────────

function prop(key: string, value: unknown): string {
  if (typeof value === 'string') {
    // Strip the $ sigil — --var is the clean CSS-variable convention
    const v = value.startsWith('$') ? value.slice(1) : value
    return `${key}="${v}"`
  }
  if (typeof value === 'number') return `${key}={${value}}`
  if (typeof value === 'boolean') return value ? key : `${key}={false}`
  return `${key}={${JSON.stringify(value)}}`
}

// ── Node → JSX ────────────────────────────────────────────────────────────────

const SKIP = new Set(['type', 'id', 'name', 'x', 'y', 'children', 'content', 'iconFontFamily', 'iconFontName'])

function toJsx(node: PenNode, comps: Map<string, string>, depth: number, skipSubst = false): string {
  const pad = '  '.repeat(depth)
  const h = hash(node)
  const tag = TAG[node.type] ?? node.type

  // Substitute with component reference (unless rendering the declaration itself)
  if (!skipSubst && comps.has(h)) {
    const cname = comps.get(h)!
    const idProp = node.id ? ` id="${node.id}"` : ''
    return `${pad}<${cname}${idProp} />`
  }

  // Build props
  const props: string[] = []
  if (node.id) props.push(prop('id', node.id))
  if (node.name) props.push(prop('name', node.name))
  if (node.type === 'icon_font') {
    if (node.iconFontName) props.push(prop('icon', node.iconFontName))
    if (node.iconFontFamily) props.push(prop('family', node.iconFontFamily))
  }
  for (const [k, v] of Object.entries(node)) {
    if (!SKIP.has(k)) props.push(prop(k, v))
  }

  const ps = props.length ? ' ' + props.join(' ') : ''

  // Text leaf
  if (node.type === 'text' && node.content && !node.children) {
    return `${pad}<${tag}${ps}>${node.content}</${tag}>`
  }

  // No children
  if (!node.children) return `${pad}<${tag}${ps} />`

  // Depth-truncated
  if (node.children === '...') return `${pad}<${tag}${ps}>{/* … */}</${tag}>`

  const lines = (node.children as PenNode[]).map(c => toJsx(c, comps, depth + 1))
  return [`${pad}<${tag}${ps}>`, ...lines, `${pad}</${tag}>`].join('\n')
}

// ── PascalCase helper ─────────────────────────────────────────────────────────

function pascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\w/, c => c.toUpperCase()) || 'Component'
}

// ── Main export ───────────────────────────────────────────────────────────────

export function formatNodes(jsonText: string): string {
  let nodes: PenNode[]
  try {
    const parsed = JSON.parse(jsonText) as unknown
    nodes = Array.isArray(parsed) ? (parsed as PenNode[]) : [parsed as PenNode]
  } catch {
    return jsonText
  }

  // 1. Collect structural hashes from every node in the tree
  const seen = new Map<string, { count: number; node: PenNode }>()

  function collect(n: PenNode) {
    if (!n.type) return
    if (Array.isArray(n.children)) for (const c of n.children as PenNode[]) collect(c)
    const h = hash(n)
    const e = seen.get(h)
    if (e) e.count++
    else seen.set(h, { count: 1, node: n })
  }
  for (const n of nodes) collect(n)

  // 2. Build component map: hash → name (only for duplicates)
  const comps = new Map<string, string>()
  const taken = new Set<string>()

  for (const [h, { count, node }] of seen) {
    if (count < 2) continue
    let base = pascal(node.name || node.type || 'Component')
    let name = base
    let i = 2
    while (taken.has(name)) name = `${base}${i++}`
    taken.add(name)
    comps.set(h, name)
  }

  // 3. Render component declarations (no substitution inside declarations)
  const decls: string[] = []
  for (const [h, name] of comps) {
    const node = seen.get(h)!.node
    // Strip id/name from declaration so it reads as the "template"
    const declNode = { ...node, id: undefined, name: undefined }
    const body = toJsx(declNode, comps, 1, true)
    decls.push(`const ${name} = () => (\n${body}\n)`)
  }

  // 4. Render main tree (with substitution)
  const tree = nodes.map(n => toJsx(n, comps, 0)).join('\n')

  return decls.length ? [...decls, '', tree].join('\n') : tree
}
