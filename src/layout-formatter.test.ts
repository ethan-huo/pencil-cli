import { describe, expect, test } from 'bun:test'
import { formatLayout } from './layout-formatter'

describe('formatLayout', () => {
  test('renders single node with dimensions and position', () => {
    const json = JSON.stringify([{ id: 'f1', x: 10, y: 20, width: 300, height: 200 }])
    expect(formatLayout(json)).toBe('f1 (300×200 @ 10,20)')
  })

  test('renders nested children with tree connectors', () => {
    const json = JSON.stringify([
      {
        id: 'root',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        children: [
          { id: 'a', x: 0, y: 0, width: 400, height: 50 },
          { id: 'b', x: 0, y: 50, width: 400, height: 50 },
        ],
      },
    ])
    const lines = formatLayout(json).split('\n')
    expect(lines[0]).toBe('root (800×600 @ 0,0)')
    expect(lines[1]).toBe('├─ a (400×50 @ 0,0)')
    expect(lines[2]).toBe('└─ b (400×50 @ 0,50)')
  })

  test('renders problems with warning marker', () => {
    const json = JSON.stringify([
      { id: 'f1', x: 0, y: 0, width: 100, height: 50, problems: 'partially clipped' },
    ])
    expect(formatLayout(json)).toContain('⚠ partially clipped')
  })

  test('renders truncated children as ellipsis', () => {
    const json = JSON.stringify([
      {
        id: 'root',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [
          { id: 'a', x: 0, y: 0, width: 50, height: 50, children: '...' },
        ],
      },
    ])
    const out = formatLayout(json)
    expect(out).toContain('└─ …')
  })

  test('truncated children do not leak parent connector', () => {
    const json = JSON.stringify([
      {
        id: 'root',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [
          { id: 'a', x: 0, y: 0, width: 50, height: 50, children: '...' },
          { id: 'b', x: 50, y: 0, width: 50, height: 50 },
        ],
      },
    ])
    const lines = formatLayout(json).split('\n')
    // 'a' is not last child → uses ├─, its truncated child should use │  └─
    expect(lines[1]).toBe('├─ a (50×50 @ 0,0)')
    expect(lines[2]).toBe('│  └─ …')
    expect(lines[3]).toBe('└─ b (50×50 @ 50,0)')
  })

  test('deep nesting uses correct indentation', () => {
    const json = JSON.stringify([
      {
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [
          {
            id: 'b',
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            children: [{ id: 'c', x: 0, y: 0, width: 25, height: 25 }],
          },
        ],
      },
    ])
    const lines = formatLayout(json).split('\n')
    expect(lines[0]).toBe('a (100×100 @ 0,0)')
    expect(lines[1]).toBe('└─ b (50×50 @ 0,0)')
    expect(lines[2]).toBe('   └─ c (25×25 @ 0,0)')
  })

  test('multiple top-level nodes separated by blank line', () => {
    const json = JSON.stringify([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 0, width: 100, height: 100 },
    ])
    const lines = formatLayout(json).split('\n')
    expect(lines[0]).toBe('a (100×100 @ 0,0)')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('b (100×100 @ 200,0)')
  })

  test('returns raw text for invalid JSON', () => {
    expect(formatLayout('not json')).toBe('not json')
  })

  test('leaf nodes without children render cleanly', () => {
    const json = JSON.stringify([
      {
        id: 'root',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [{ id: 'leaf', x: 0, y: 0, width: 50, height: 50 }],
      },
    ])
    const out = formatLayout(json)
    expect(out).not.toContain('…')
    expect(out).toContain('└─ leaf')
  })
})
