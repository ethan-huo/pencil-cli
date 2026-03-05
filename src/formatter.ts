// Formats Pencil batch_get JSON output as readable JSX code.
// Structurally identical subtrees are deduplicated into named references.
// Ref nodes (component instances) are shown as compact one-liners.

type PenNode = {
  type: string
  id?: string
  name?: string
  ref?: string
  reusable?: boolean
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
    const v = value.startsWith('$') ? value.slice(1) : value
    return `${key}="${v}"`
  }
  if (typeof value === 'number') return `${key}={${value}}`
  if (typeof value === 'boolean') return value ? key : `${key}={false}`
  return `${key}={${JSON.stringify(value)}}`
}

// ── Node → JSX ────────────────────────────────────────────────────────────────

const SKIP = new Set(['type', 'id', 'name', 'x', 'y', 'children', 'content', 'iconFontFamily', 'iconFontName', 'ref', 'reusable'])

const COMPACT_KEEP = new Set(['content', 'icon', 'family', 'ref', 'reusable'])

function toJsx(node: PenNode, comps: Map<string, string>, depth: number, refs: Set<string>, compact: boolean): string {
  const pad = '  '.repeat(depth)
  const tag = TAG[node.type] ?? node.type

  // Ref nodes → compact one-liner, collect referenced ID for footer hint
  if (node.type === 'ref' && node.ref) {
    refs.add(node.ref)
    const idProp = node.id ? ` id="${node.id}"` : ''
    const nameProp = node.name ? ` name="${node.name}"` : ''
    const extras: string[] = []
    if (!compact) {
      for (const [k, v] of Object.entries(node)) {
        if (!SKIP.has(k)) extras.push(prop(k, v))
      }
    }
    const ep = extras.length ? ' ' + extras.join(' ') : ''
    return `${pad}<Ref${idProp}${nameProp} ref="${node.ref}"${ep} />`
  }

  // Structural dedup — substitute repeated subtree with compact tag
  const h = hash(node)
  if (comps.has(h)) {
    const cname = comps.get(h)!
    const idProp = node.id ? ` id="${node.id}"` : ''
    return `${pad}<${cname}${idProp} />`
  }

  // Build props
  const props: string[] = []
  if (node.id) props.push(prop('id', node.id))
  if (node.name) props.push(prop('name', node.name))
  if (node.reusable) props.push('reusable')
  if (node.type === 'icon_font') {
    if (node.iconFontName) props.push(prop('icon', node.iconFontName))
    if (node.iconFontFamily) props.push(prop('family', node.iconFontFamily))
  }
  for (const [k, v] of Object.entries(node)) {
    if (SKIP.has(k)) continue
    if (compact && !COMPACT_KEEP.has(k)) continue
    props.push(prop(k, v))
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

  const lines = (node.children as PenNode[]).map(c => toJsx(c, comps, depth + 1, refs, compact))
  return [`${pad}<${tag}${ps}>`, ...lines, `${pad}</${tag}>`].join('\n')
}

// ── PascalCase helper ─────────────────────────────────────────────────────────

function pascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\w/, c => c.toUpperCase()) || 'Component'
}

// ── Main export ───────────────────────────────────────────────────────────────

type FormatOptions = { compact?: boolean }

export function formatNodes(jsonText: string, opts: FormatOptions = {}): string {
  const compact = opts.compact ?? false
  let nodes: PenNode[]
  try {
    const parsed = JSON.parse(jsonText) as unknown
    nodes = Array.isArray(parsed) ? (parsed as PenNode[]) : [parsed as PenNode]
  } catch {
    return jsonText
  }

  // 1. Collect structural hashes — only count non-ref nodes
  const seen = new Map<string, { count: number; node: PenNode }>()

  function collect(n: PenNode) {
    if (!n.type || n.type === 'ref') return
    if (Array.isArray(n.children)) for (const c of n.children as PenNode[]) collect(c)
    const h = hash(n)
    const e = seen.get(h)
    if (e) e.count++
    else seen.set(h, { count: 1, node: n })
  }
  for (const n of nodes) collect(n)

  // 2. Build dedup map: hash → PascalCase name (only for duplicates)
  const comps = new Map<string, string>()
  const taken = new Set<string>()
  const dedupNames: string[] = []

  for (const [h, { count, node }] of seen) {
    if (count < 2) continue
    let base = pascal(node.name || node.type || 'Component')
    let name = base
    let i = 2
    while (taken.has(name)) name = `${base}${i++}`
    taken.add(name)
    comps.set(h, name)
    dedupNames.push(name)
  }

  // 3. Render tree (deduped subtrees replaced with compact tags)
  const refs = new Set<string>()
  const tree = nodes.map(n => toJsx(n, comps, 0, refs, compact)).join('\n')

  const parts: string[] = [tree]

  // 4. Footer hints
  if (refs.size > 0) {
    const ids = [...refs].join(',')
    parts.push(
      '',
      `// ${refs.size} reusable component(s) referenced — only nodes with \`reusable\` can be ref'd.`,
      `// Inspect: pencil get --node ${ids} --depth 2`,
    )
  }

  if (dedupNames.length > 0) {
    parts.push(
      '',
      `// ${dedupNames.length} repeated pattern(s) collapsed: ${dedupNames.join(', ')}`,
      `// These are display-only shorthands, NOT reusable components.`,
      `// Inspect originals: pencil get --node <id> --depth 2`,
    )
  }

  return parts.join('\n')
}
