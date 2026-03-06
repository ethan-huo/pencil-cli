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

  function render(node: LayoutNode, depth: number) {
    const indent = '  '.repeat(depth)
    const warn = node.problems ? ` ⚠ ${node.problems}` : ''
    lines.push(`${indent}${node.id} ${node.width}x${node.height} ${node.x},${node.y}${warn}`)

    if (node.children === '...') {
      lines.push(`${'  '.repeat(depth + 1)}…`)
      return
    }
    if (!Array.isArray(node.children) || node.children.length === 0) return
    for (const child of node.children) render(child, depth + 1)
  }

  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) lines.push('')
    render(nodes[i], 0)
  }

  const hasProblems = jsonText.includes('"problems"')
  lines.push('')
  lines.push('---')
  lines.push('Geometry only. Inspect: pencil get --node <id>')
  if (hasProblems) lines.push('⚠ = layout problem (clipped, overflow, etc.)')

  return lines.join('\n')
}
