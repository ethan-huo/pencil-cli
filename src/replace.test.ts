import { describe, expect, test } from 'bun:test'
import {
  addVarPrefix,
  addVarPrefixInDsl,
  collectMatches,
  PROP_READERS,
  PROP_TO_DSL,
  type NodeLike,
} from './replace'

// ── addVarPrefix ─────────────────────────────────────────────────────────────

describe('addVarPrefix', () => {
  test('prefixes bare --var strings with $', () => {
    expect(addVarPrefix('--card')).toBe('$--card')
    expect(addVarPrefix('--muted-foreground')).toBe('$--muted-foreground')
  })

  test('leaves already-prefixed $--var unchanged', () => {
    expect(addVarPrefix('$--card')).toBe('$--card')
  })

  test('leaves non-var strings unchanged', () => {
    expect(addVarPrefix('#FF0000')).toBe('#FF0000')
    expect(addVarPrefix('hello')).toBe('hello')
  })

  test('recurses into arrays', () => {
    expect(addVarPrefix(['--a', '#FFF', '--b'])).toEqual(['$--a', '#FFF', '$--b'])
  })

  test('recurses into objects', () => {
    expect(addVarPrefix({ from: '#FF0000', to: '--primary' })).toEqual({
      from: '#FF0000',
      to: '$--primary',
    })
  })

  test('handles nested structures', () => {
    const input = {
      fillColor: [{ from: '#18181B', to: '--card' }],
      textColor: [{ from: '#FAFAFA', to: '--foreground' }],
    }
    const out = addVarPrefix(input) as Record<string, unknown>
    expect(out).toEqual({
      fillColor: [{ from: '#18181B', to: '$--card' }],
      textColor: [{ from: '#FAFAFA', to: '$--foreground' }],
    })
  })

  test('passes through numbers and booleans', () => {
    expect(addVarPrefix(42)).toBe(42)
    expect(addVarPrefix(true)).toBe(true)
    expect(addVarPrefix(null)).toBe(null)
  })
})

// ── addVarPrefixInDsl ────────────────────────────────────────────────────────

describe('addVarPrefixInDsl', () => {
  test('prefixes quoted --var in DSL ops', () => {
    const ops = 'card=I("root", {fill: "--card", gap: 12})'
    expect(addVarPrefixInDsl(ops)).toBe('card=I("root", {fill: "$--card", gap: 12})')
  })

  test('handles multiple vars in one line', () => {
    const ops = 'U("id", {fill: "--card", stroke: "--border"})'
    const out = addVarPrefixInDsl(ops)
    expect(out).toContain('"$--card"')
    expect(out).toContain('"$--border"')
  })

  test('does not touch non-var strings', () => {
    const ops = 'I("root", {content: "hello", fill: "#FF0000"})'
    expect(addVarPrefixInDsl(ops)).toBe(ops)
  })

  test('does not double-prefix $--var', () => {
    const ops = 'U("id", {fill: "$--card"})'
    // $--card doesn't match the pattern "--..." (starts with $, not --)
    expect(addVarPrefixInDsl(ops)).toBe(ops)
  })

  test('works across multiple lines', () => {
    const ops = [
      'a=I("root", {fill: "--bg"})',
      'b=I(a, {fill: "--card"})',
    ].join('\n')
    const out = addVarPrefixInDsl(ops)
    expect(out).toContain('"$--bg"')
    expect(out).toContain('"$--card"')
  })
})

// ── PROP_READERS ─────────────────────────────────────────────────────────────

describe('PROP_READERS', () => {
  test('fillColor reads fill from non-text nodes', () => {
    const frame: NodeLike = { id: 'f1', type: 'frame', fill: '#18181B' }
    expect(PROP_READERS.fillColor(frame)).toBe('#18181b')
  })

  test('fillColor returns undefined for text nodes', () => {
    const text: NodeLike = { id: 't1', type: 'text', fill: '#18181B' }
    expect(PROP_READERS.fillColor(text)).toBeUndefined()
  })

  test('textColor reads fill from text nodes', () => {
    const text: NodeLike = { id: 't1', type: 'text', fill: '#FAFAFA' }
    expect(PROP_READERS.textColor(text)).toBe('#fafafa')
  })

  test('textColor returns undefined for non-text nodes', () => {
    const frame: NodeLike = { id: 'f1', type: 'frame', fill: '#FAFAFA' }
    expect(PROP_READERS.textColor(frame)).toBeUndefined()
  })

  test('strokeColor reads simple string stroke fill', () => {
    const node: NodeLike = { id: 'n1', type: 'frame', stroke: { fill: '#007AFF' } }
    expect(PROP_READERS.strokeColor(node)).toBe('#007aff')
  })

  test('strokeColor reads solid-type stroke fill', () => {
    const node: NodeLike = {
      id: 'n1',
      type: 'frame',
      stroke: { fill: { type: 'solid', color: '#007AFF' } },
    }
    expect(PROP_READERS.strokeColor(node)).toBe('#007aff')
  })

  test('strokeColor returns undefined when no stroke', () => {
    const node: NodeLike = { id: 'n1', type: 'frame' }
    expect(PROP_READERS.strokeColor(node)).toBeUndefined()
  })

  test('strokeColor returns undefined for gradient stroke', () => {
    const node: NodeLike = {
      id: 'n1',
      type: 'frame',
      stroke: { fill: { type: 'gradient', colors: [] } },
    }
    expect(PROP_READERS.strokeColor(node)).toBeUndefined()
  })

  test('strokeThickness reads from stroke object', () => {
    const node: NodeLike = { id: 'n1', type: 'frame', stroke: { thickness: 2 } }
    expect(PROP_READERS.strokeThickness(node)).toBe('2')
  })

  test('direct props read as-is', () => {
    const node: NodeLike = {
      id: 'n1',
      type: 'frame',
      cornerRadius: 12,
      padding: 16,
      gap: 8,
      fontSize: 14,
      fontFamily: 'Inter',
      fontWeight: '700',
    }
    expect(PROP_READERS.cornerRadius(node)).toBe('12')
    expect(PROP_READERS.padding(node)).toBe('16')
    expect(PROP_READERS.gap(node)).toBe('8')
    expect(PROP_READERS.fontSize(node)).toBe('14')
    expect(PROP_READERS.fontFamily(node)).toBe('Inter')
    expect(PROP_READERS.fontWeight(node)).toBe('700')
  })
})

// ── PROP_TO_DSL ──────────────────────────────────────────────────────────────

describe('PROP_TO_DSL', () => {
  test('fillColor maps to fill', () => {
    expect(PROP_TO_DSL.fillColor).toBe('fill')
  })

  test('textColor maps to fill', () => {
    expect(PROP_TO_DSL.textColor).toBe('fill')
  })

  test('strokeColor maps to stroke', () => {
    expect(PROP_TO_DSL.strokeColor).toBe('stroke')
  })

  test('unmapped props fall through to their own name', () => {
    // collectMatches uses `PROP_TO_DSL[propName] ?? propName`
    expect(PROP_TO_DSL.cornerRadius).toBeUndefined()
    expect(PROP_TO_DSL.fontSize).toBeUndefined()
  })
})

// ── collectMatches ───────────────────────────────────────────────────────────

describe('collectMatches', () => {
  test('matches fillColor on frame nodes', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#18181B' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
    })
    expect(matches).toEqual([{ id: 'f1', prop: 'fill', to: '$--card' }])
  })

  test('matches textColor on text nodes', () => {
    const nodes: NodeLike[] = [
      { id: 't1', type: 'text', fill: '#A1A1AA' },
    ]
    const matches = collectMatches(nodes, {
      textColor: [{ from: '#A1A1AA', to: '$--muted-foreground' }],
    })
    expect(matches).toEqual([{ id: 't1', prop: 'fill', to: '$--muted-foreground' }])
  })

  test('does not match fillColor on text nodes', () => {
    const nodes: NodeLike[] = [
      { id: 't1', type: 'text', fill: '#18181B' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
    })
    expect(matches).toEqual([])
  })

  test('does not match textColor on frame nodes', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#A1A1AA' },
    ]
    const matches = collectMatches(nodes, {
      textColor: [{ from: '#A1A1AA', to: '$--muted' }],
    })
    expect(matches).toEqual([])
  })

  test('case-insensitive hex matching', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#FAFAFA' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#fafafa', to: '$--fg' }],
    })
    expect(matches).toHaveLength(1)
  })

  test('walks children recursively', () => {
    const nodes: NodeLike[] = [
      {
        id: 'root',
        type: 'frame',
        fill: '#000',
        children: [
          {
            id: 'inner',
            type: 'frame',
            fill: '#18181B',
            children: [
              { id: 'deep', type: 'text', fill: '#FAFAFA' },
            ],
          },
        ],
      },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
      textColor: [{ from: '#FAFAFA', to: '$--fg' }],
    })
    expect(matches).toHaveLength(2)
    expect(matches.find((m) => m.id === 'inner')).toEqual({ id: 'inner', prop: 'fill', to: '$--card' })
    expect(matches.find((m) => m.id === 'deep')).toEqual({ id: 'deep', prop: 'fill', to: '$--fg' })
  })

  test('stops at truncated children ("...")', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#18181B', children: '...' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
    })
    // Should match f1 itself but not crash on "..." children
    expect(matches).toEqual([{ id: 'f1', prop: 'fill', to: '$--card' }])
  })

  test('skips nodes without id', () => {
    const nodes: NodeLike[] = [
      { type: 'frame', fill: '#18181B' }, // no id
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
    })
    expect(matches).toEqual([])
  })

  test('multiple rules for same property', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#18181B' },
      { id: 'f2', type: 'frame', fill: '#27272A' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [
        { from: '#18181B', to: '$--card' },
        { from: '#27272A', to: '$--accent' },
      ],
    })
    expect(matches).toHaveLength(2)
  })

  test('multiple property types in one call', () => {
    const nodes: NodeLike[] = [
      {
        id: 'f1',
        type: 'frame',
        fill: '#18181B',
        stroke: { fill: '#007AFF' },
        children: [
          { id: 't1', type: 'text', fill: '#FAFAFA' },
        ],
      },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#18181B', to: '$--card' }],
      strokeColor: [{ from: '#007AFF', to: '$--brand' }],
      textColor: [{ from: '#FAFAFA', to: '$--fg' }],
    })
    expect(matches).toHaveLength(3)
    expect(matches.map((m) => m.prop).sort()).toEqual(['fill', 'fill', 'stroke'])
  })

  test('returns empty array when nothing matches', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#FFFFFF' },
    ]
    const matches = collectMatches(nodes, {
      fillColor: [{ from: '#000000', to: '$--bg' }],
    })
    expect(matches).toEqual([])
  })

  test('unknown property name is silently ignored', () => {
    const nodes: NodeLike[] = [
      { id: 'f1', type: 'frame', fill: '#000' },
    ]
    const matches = collectMatches(nodes, {
      unknownProp: [{ from: '#000', to: '$--x' }],
    })
    expect(matches).toEqual([])
  })
})
