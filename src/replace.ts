// Pure logic for replace-props: property reading, matching, and var normalization.
// Extracted from main.ts for testability — no MCP/IO dependencies.

// ── Var normalization ────────────────────────────────────────────────────────

// Agents write "--var"; MCP expects "$--var". Normalize before sending.
// Walks any JSON-serializable value and prefixes bare "--..." strings with "$".
export function addVarPrefix(v: unknown): unknown {
  if (typeof v === 'string') return v.startsWith('--') ? '$' + v : v
  if (Array.isArray(v)) return v.map(addVarPrefix)
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, addVarPrefix(val)]))
  return v
}

// In the design DSL string, quoted "--..." values → "$--..."
export function addVarPrefixInDsl(ops: string): string {
  return ops.replace(/"(--[a-zA-Z0-9-]+)"/g, (_, name: string) => `"$${name}"`)
}

// ── Replace-props engine ─────────────────────────────────────────────────────

export type ReplaceRule = { from: string; to: string }
export type NodeLike = { id?: string; type?: string; children?: NodeLike[] | '...'; [k: string]: unknown }
export type PropMatch = { id: string; prop: string; to: string; strokeMeta?: { align: string; thickness: unknown } }

function asColorStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v.toLowerCase() : undefined
}
function asStr(v: unknown): string | undefined {
  return v !== undefined && v !== null ? String(v) : undefined
}

// search-props uses abstract names (fillColor, textColor, strokeColor).
// batch_get returns raw schema names (fill, stroke).
// Map abstract → how to read from a node.
export const PROP_READERS: Record<string, (node: NodeLike) => string | undefined> = {
  fillColor: (n) => (n.type !== 'text' ? asColorStr(n.fill) : undefined),
  textColor: (n) => (n.type === 'text' ? asColorStr(n.fill) : undefined),
  strokeColor: (n) => {
    const s = n.stroke as Record<string, unknown> | undefined
    if (!s) return undefined
    if (typeof s.fill === 'string') return asColorStr(s.fill)
    const f = s.fill as Record<string, unknown> | undefined
    if (f?.type === 'solid' && typeof f.color === 'string') return asColorStr(f.color)
    return undefined
  },
  cornerRadius: (n) => asStr(n.cornerRadius),
  padding: (n) => asStr(n.padding),
  gap: (n) => asStr(n.gap),
  fontSize: (n) => asStr(n.fontSize),
  fontFamily: (n) => asStr(n.fontFamily),
  fontWeight: (n) => asStr(n.fontWeight),
  strokeThickness: (n) => {
    const s = n.stroke as Record<string, unknown> | undefined
    return s ? asStr(s.thickness) : undefined
  },
}

// DSL prop name to use in U() for each search-props property
export const PROP_TO_DSL: Record<string, string> = {
  fillColor: 'fill',
  textColor: 'fill',
  strokeColor: 'stroke',
  strokeThickness: 'strokeThickness',
}

export function collectMatches(
  nodes: NodeLike[],
  properties: Record<string, ReplaceRule[]>,
): PropMatch[] {
  const results: PropMatch[] = []

  function walk(node: NodeLike) {
    if (!node.id) return
    for (const [propName, rules] of Object.entries(properties)) {
      const reader = PROP_READERS[propName]
      if (!reader) continue
      const value = reader(node)
      if (value === undefined) continue
      for (const rule of rules) {
        if (value === rule.from.toLowerCase()) {
          const dslProp = PROP_TO_DSL[propName] ?? propName
          const match: PropMatch = { id: node.id, prop: dslProp, to: rule.to }
          if (propName === 'strokeColor') {
            const s = node.stroke as Record<string, unknown> | undefined
            if (s) match.strokeMeta = { align: (s.align as string) ?? 'inside', thickness: s.thickness ?? 1 }
          }
          results.push(match)
        }
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child)
    }
  }

  for (const node of nodes) walk(node)
  return results
}
