type LayoutNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
  problems?: string
  children?: LayoutNode[] | '...'
}

export function formatLayout(jsonText: string): string {
  let nodes: LayoutNode[]
  try {
    const parsed = JSON.parse(jsonText)
    nodes = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return jsonText
  }

  const lines: string[] = []

  function render(node: LayoutNode, prefix: string, connector: string) {
    const dim = `${node.width}×${node.height}`
    const pos = ` @ ${node.x},${node.y}`
    const warn = node.problems ? ` ⚠ ${node.problems}` : ''
    lines.push(`${prefix}${connector}${node.id} (${dim}${pos})${warn}`)

    const childPrefix = prefix + (connector === '├─ ' ? '│  ' : connector === '└─ ' ? '   ' : '')

    if (node.children === '...') {
      lines.push(`${childPrefix}└─ …`)
      return
    }
    if (!Array.isArray(node.children) || node.children.length === 0) return
    const kids = node.children
    for (let i = 0; i < kids.length; i++) {
      const isLast = i === kids.length - 1
      render(kids[i], childPrefix, isLast ? '└─ ' : '├─ ')
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) lines.push('')
    render(nodes[i], '', '')
  }

  lines.push('')
  lines.push('// Layout shows geometry only (id, size, position).')
  lines.push('// Inspect node details: pencil get --node <id> --depth 1')

  return lines.join('\n')
}
