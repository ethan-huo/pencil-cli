import { describe, expect, test } from 'bun:test'
import { formatLayout } from './layout-formatter'

describe('formatLayout', () => {
  test('renders node as: id WxH X,Y', () => {
    const json = JSON.stringify([{ id: 'f1', x: 10, y: 20, width: 300, height: 200 }])
    expect(formatLayout(json)).toContain('f1 300x200 10,20')
  })

  test('indents children with 2 spaces', () => {
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
    expect(lines[0]).toBe('root 800x600 0,0')
    expect(lines[1]).toBe('  a 400x50 0,0')
    expect(lines[2]).toBe('  b 400x50 0,50')
  })

  test('deep nesting increases indent', () => {
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
    expect(lines[0]).toBe('a 100x100 0,0')
    expect(lines[1]).toBe('  b 50x50 0,0')
    expect(lines[2]).toBe('    c 25x25 0,0')
  })

  test('shows problems with ⚠ marker', () => {
    const json = JSON.stringify([
      { id: 'f1', x: 0, y: 0, width: 100, height: 50, problems: 'partially clipped' },
    ])
    expect(formatLayout(json)).toContain('⚠ partially clipped')
  })

  test('renders truncated children as …', () => {
    const json = JSON.stringify([
      {
        id: 'root',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [{ id: 'a', x: 0, y: 0, width: 50, height: 50, children: '...' }],
      },
    ])
    const lines = formatLayout(json).split('\n')
    expect(lines[1]).toBe('  a 50x50 0,0')
    expect(lines[2]).toBe('    …')
  })

  test('multiple top-level nodes separated by blank line', () => {
    const json = JSON.stringify([
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 200, y: 0, width: 100, height: 100 },
    ])
    const lines = formatLayout(json).split('\n')
    expect(lines[0]).toBe('a 100x100 0,0')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('b 100x100 200,0')
  })

  test('footer with separator', () => {
    const json = JSON.stringify([{ id: 'f1', x: 0, y: 0, width: 100, height: 50 }])
    const out = formatLayout(json)
    expect(out).toContain('---')
    expect(out).toContain('pencil get --node <id>')
    expect(out).not.toContain('⚠ =')
  })

  test('footer explains ⚠ when problems exist', () => {
    const json = JSON.stringify([
      { id: 'f1', x: 0, y: 0, width: 100, height: 50, problems: 'clipped' },
    ])
    expect(formatLayout(json)).toContain('⚠ = layout problem')
  })

  test('returns raw text for invalid JSON', () => {
    expect(formatLayout('not json')).toBe('not json')
  })

  test('leaf nodes render without trailing …', () => {
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
  })
})
