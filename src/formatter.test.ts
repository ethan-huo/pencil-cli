import { describe, expect, test } from 'bun:test'
import { formatNodes } from './formatter'

// ── Basic rendering ──────────────────────────────────────────────────────────

describe('formatNodes', () => {
  test('renders a single text node', () => {
    const json = JSON.stringify([
      { type: 'text', id: 'a1', name: 'title', content: 'Hello', fill: '$--foreground' },
    ])
    const out = formatNodes(json)
    expect(out).toContain('<Text')
    expect(out).toContain('id="a1"')
    expect(out).toContain('Hello</Text>')
  })

  test('renders nested frame with children', () => {
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'f1',
        name: 'Card',
        fill: '$--card',
        children: [
          { type: 'text', id: 't1', content: 'Title' },
          { type: 'text', id: 't2', content: 'Body' },
        ],
      },
    ])
    const out = formatNodes(json)
    expect(out).toContain('<Frame')
    expect(out).toContain('Title</Text>')
    expect(out).toContain('Body</Text>')
    expect(out).toContain('</Frame>')
  })

  test('renders self-closing node without children', () => {
    const json = JSON.stringify([{ type: 'rectangle', id: 'r1', fill: '#FF0000' }])
    const out = formatNodes(json)
    expect(out).toContain('<Rect')
    expect(out).toContain('/>')
    expect(out).not.toContain('</Rect>')
  })

  test('renders depth-truncated children as {/* … */}', () => {
    const json = JSON.stringify([{ type: 'frame', id: 'f1', children: '...' }])
    const out = formatNodes(json)
    expect(out).toContain('{/* … */}')
  })

  test('renders icon_font as Icon with icon and family props', () => {
    const json = JSON.stringify([
      { type: 'icon_font', id: 'i1', iconFontName: 'loader', iconFontFamily: 'lucide' },
    ])
    const out = formatNodes(json)
    expect(out).toContain('<Icon')
    expect(out).toContain('icon="loader"')
    expect(out).toContain('family="lucide"')
  })

  test('strips $ prefix from variable values', () => {
    const json = JSON.stringify([{ type: 'rectangle', id: 'r1', fill: '$--card' }])
    const out = formatNodes(json)
    expect(out).toContain('fill="--card"')
    expect(out).not.toContain('$--card')
  })

  // ── Ref nodes ────────────────────────────────────────────────────────────

  test('renders ref node as compact one-liner', () => {
    const json = JSON.stringify([
      { type: 'ref', id: 'inst1', name: 'MyButton', ref: 'comp1' },
    ])
    const out = formatNodes(json)
    expect(out).toContain('<Ref')
    expect(out).toContain('ref="comp1"')
    expect(out).toContain('/>')
    // Footer hint about reusable components
    expect(out).toContain('reusable component(s) referenced')
    expect(out).toContain('pencil get --node comp1')
  })

  test('ref node collects referenced IDs in footer', () => {
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'f1',
        children: [
          { type: 'ref', id: 'r1', ref: 'compA' },
          { type: 'ref', id: 'r2', ref: 'compB' },
          { type: 'ref', id: 'r3', ref: 'compA' }, // duplicate ref
        ],
      },
    ])
    const out = formatNodes(json)
    // Should list both unique refs
    expect(out).toContain('compA')
    expect(out).toContain('compB')
    expect(out).toContain('2 reusable component(s)')
  })

  // ── Compact mode ─────────────────────────────────────────────────────────

  test('compact mode strips style props', () => {
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'f1',
        name: 'Card',
        fill: '$--card',
        cornerRadius: 12,
        padding: [16, 24],
        gap: 8,
        layout: 'vertical',
        children: [
          { type: 'text', id: 't1', content: 'Hello', fill: '$--fg', fontSize: 14 },
        ],
      },
    ])
    const compact = formatNodes(json, { compact: true })
    // Should keep content
    expect(compact).toContain('Hello')
    // Should strip style props
    expect(compact).not.toContain('fill=')
    expect(compact).not.toContain('cornerRadius')
    expect(compact).not.toContain('padding')
    expect(compact).not.toContain('fontSize')
    expect(compact).not.toContain('layout')
  })

  test('compact mode preserves ref and reusable props', () => {
    const json = JSON.stringify([
      { type: 'ref', id: 'r1', ref: 'comp1', width: 200 },
      { type: 'frame', id: 'f1', reusable: true, fill: '#000' },
    ])
    const compact = formatNodes(json, { compact: true })
    expect(compact).toContain('ref="comp1"')
    expect(compact).toContain('reusable')
  })

  // ── Structural dedup ──────────────────────────────────────────────────────

  test('deduplicates structurally identical subtrees', () => {
    const item = { type: 'frame', name: 'NavItem', fill: '#333', children: [{ type: 'text', content: 'Link' }] }
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'nav',
        children: [
          { ...item, id: 'n1' },
          { ...item, id: 'n2' },
          { ...item, id: 'n3' },
        ],
      },
    ])
    const out = formatNodes(json)
    // Repeated items should be collapsed to PascalCase shorthand
    expect(out).toContain('<NavItem id="n2" />')
    expect(out).toContain('<NavItem id="n3" />')
    // Footer should mention repeated patterns
    expect(out).toContain('repeated pattern(s) collapsed')
    expect(out).toContain('NOT reusable components')
  })

  test('does not dedup unique subtrees', () => {
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'root',
        children: [
          { type: 'text', id: 't1', content: 'A' },
          { type: 'text', id: 't2', content: 'B' },
        ],
      },
    ])
    const out = formatNodes(json)
    expect(out).not.toContain('repeated pattern')
    expect(out).toContain('A</Text>')
    expect(out).toContain('B</Text>')
  })

  test('does not dedup ref nodes', () => {
    const json = JSON.stringify([
      {
        type: 'frame',
        id: 'root',
        children: [
          { type: 'ref', id: 'r1', ref: 'comp1' },
          { type: 'ref', id: 'r2', ref: 'comp1' },
        ],
      },
    ])
    const out = formatNodes(json)
    // Both refs should render as Ref, not be collapsed into a dedup tag
    const refCount = (out.match(/<Ref /g) || []).length
    expect(refCount).toBe(2)
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  test('returns raw text for invalid JSON', () => {
    const out = formatNodes('not json at all')
    expect(out).toBe('not json at all')
  })

  test('wraps single object in array', () => {
    const json = JSON.stringify({ type: 'text', id: 't1', content: 'Solo' })
    const out = formatNodes(json)
    expect(out).toContain('Solo</Text>')
  })
})
