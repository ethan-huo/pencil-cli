import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MCP_BINARY =
  '/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64'
const DEFAULT_PORT = 18899
const SESSION_FILE = '/tmp/pencil-cli-session.json'

// ── Session ──────────────────────────────────────────────────────────────────

type Session = {
  pid: number
  port: number
  sessionId: string
}

let _session: Session | null = null

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function loadSession(): Promise<Session | null> {
  const f = Bun.file(SESSION_FILE)
  if (!(await f.exists())) return null
  try {
    return (await f.json()) as Session
  } catch {
    return null
  }
}

async function saveSession(s: Session): Promise<void> {
  await Bun.write(SESSION_FILE, JSON.stringify(s))
}

async function pingSession(s: Session): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${s.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
        'Mcp-Session-Id': s.sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(1500),
    })
    return resp.status === 200
  } catch {
    return false
  }
}

export async function startServer(port = DEFAULT_PORT): Promise<Session> {
  const proc = Bun.spawn(
    [MCP_BINARY, '--app', 'desktop', '--http', '--http-port', String(port)],
    { stdout: 'ignore', stderr: 'ignore' },
  )
  // detach so server outlives the CLI process
  proc.unref()
  const pid = proc.pid

  // Wait up to 3s for server to be reachable
  for (let i = 0; i < 15; i++) {
    await Bun.sleep(200)
    try {
      const r = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(400),
      })
      if (r.status < 600) break
    } catch {}
  }

  // Initialize MCP session
  const initResp = await fetch(`http://localhost:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'pencil-cli', version: '0.1.0' },
      },
    }),
  })

  const sessionId = initResp.headers.get('Mcp-Session-Id')
  if (!sessionId) throw new Error('Pencil MCP server did not return a session ID')

  // Send initialized notification
  await fetch(`http://localhost:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
  })

  const session: Session = { pid, port, sessionId }
  await saveSession(session)
  return session
}

export async function stopServer(): Promise<{ stopped: boolean; pid: number | null }> {
  const saved = await loadSession()
  if (!saved) return { stopped: false, pid: null }

  if (isProcessAlive(saved.pid)) {
    process.kill(saved.pid, 'SIGTERM')
  }

  try {
    await Bun.file(SESSION_FILE).delete()
  } catch {}
  _session = null

  return { stopped: true, pid: saved.pid }
}

export async function serverStatus(): Promise<{
  running: boolean
  pid: number | null
  port: number | null
  sessionOk: boolean
}> {
  const saved = await loadSession()
  if (!saved) return { running: false, pid: null, port: null, sessionOk: false }

  const running = isProcessAlive(saved.pid)
  const sessionOk = running && (await pingSession(saved))
  return { running, pid: saved.pid, port: saved.port, sessionOk }
}

async function ensureSession(): Promise<Session> {
  if (_session) return _session

  const saved = await loadSession()
  if (saved && isProcessAlive(saved.pid) && (await pingSession(saved))) {
    _session = saved
    return _session
  }

  // Auto-start
  const port = saved?.port ?? DEFAULT_PORT
  const session = await startServer(port)
  console.error(
    `[pencil] Started MCP server on port ${port} (PID: ${session.pid})\n` +
      `         To stop: pencil server stop  |  kill ${session.pid}`,
  )
  _session = session
  return _session
}

// ── HTTP client ───────────────────────────────────────────────────────────────

async function parseSseStream(resp: Response): Promise<unknown> {
  const reader = resp.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })

      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trimEnd()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        try {
          const msg = JSON.parse(payload)
          if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
            reader.cancel().catch(() => {})
            return msg
          }
        } catch {}
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  throw new Error('SSE stream ended without a JSON-RPC response')
}

type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType?: string }

type ToolOutput = {
  text: string
  screenshots: string[]
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutput> {
  const session = await ensureSession()

  const resp = await fetch(`http://localhost:${session.port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      'Mcp-Session-Id': session.sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })

  // Session expired → clear and retry once
  if (resp.status === 404) {
    _session = null
    try {
      await Bun.file(SESSION_FILE).delete()
    } catch {}
    return callTool(name, args)
  }

  const ct = resp.headers.get('content-type') ?? ''
  const data: unknown = ct.includes('text/event-stream')
    ? await parseSseStream(resp)
    : await resp.json()

  return extractOutput(data)
}

async function extractOutput(data: unknown): Promise<ToolOutput> {
  const d = data as Record<string, unknown>
  const result = (d.result ?? d) as Record<string, unknown>

  if (d.error) {
    const err = d.error as Record<string, unknown>
    throw new Error(`MCP error: ${err.message ?? JSON.stringify(d.error)}`)
  }

  const content = result.content as McpContent[] | undefined
  if (!Array.isArray(content)) {
    return { text: JSON.stringify(result, null, 2), screenshots: [] }
  }

  if (result.isError) {
    const msg = content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('\n')
    throw new Error(msg || 'Tool returned an error')
  }

  const textParts: string[] = []
  const screenshots: string[] = []

  for (const item of content) {
    if (item.type === 'text') {
      textParts.push(item.text)
    } else if (item.type === 'image' && item.data) {
      const screenshotDir = join(process.cwd(), '.pencil', 'screenshots')
      mkdirSync(screenshotDir, { recursive: true })
      const filePath = join(screenshotDir, `screenshot-${Date.now()}.png`)
      await Bun.write(filePath, Buffer.from(item.data, 'base64'))
      screenshots.push(filePath)
    }
  }

  return { text: textParts.join('\n'), screenshots }
}

const MAX_LINES = 1000

export function print(output: ToolOutput): void {
  if (output.text) {
    const lines = output.text.split('\n')
    if (lines.length > MAX_LINES) {
      console.log(lines.slice(0, MAX_LINES).join('\n'))
      console.log(
        `\n--- truncated (${lines.length} lines total) ---\n` +
          'Output too large. Try narrowing: pencil get --node <id> --depth 1',
      )
    } else {
      console.log(output.text)
    }
  }
  for (const p of output.screenshots) {
    console.log(`screenshot: ${p}`)
  }
}
