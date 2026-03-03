#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

import { c, cli, group } from 'argc'
import { fmt, printTable } from 'argc/terminal'
import { callTool, print, serverStatus, startServer, stopServer } from './client'
import { formatNodes } from './formatter'

const s = toStandardJsonSchema

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = {
  skills: group(
    { description: 'Manage installable agent skills' },
    {
      add: c
        .meta({
          description: 'Install the pencil skill into an agent skills directory',
          examples: [
            'pencil skills add',
            'pencil skills add --to /path/to/project',
            'pencil skills add --name my-pencil',
          ],
        })
        .input(
          s(
            v.object({
              to: v.optional(v.string()),
              name: v.optional(v.string(), 'pencil'),
            }),
          ),
        ),
    },
  ),

  server: group(
    { description: 'Manage the Pencil MCP server process' },
    {
      start: c
        .meta({ description: 'Start Pencil MCP server in the background' })
        .input(s(v.object({ port: v.optional(v.number(), 18899) }))),

      stop: c
        .meta({ description: 'Stop the running Pencil MCP server' })
        .input(s(v.object({}))),

      status: c
        .meta({ description: 'Show server status', aliases: ['ps'] })
        .input(s(v.object({}))),
    },
  ),

  open: c
    .meta({ description: 'Open a .pen file or create a new one' })
    .args('path')
    .input(s(v.object({ path: v.string() }))),

  state: c
    .meta({ description: 'Get current editor state', aliases: ['s'] })
    .input(
      s(
        v.object({
          schema: v.optional(v.boolean(), false),
        }),
      ),
    ),

  get: c
    .meta({
      description: 'Retrieve nodes by ID or search patterns',
      aliases: ['g'],
      examples: [
        'pencil get --node abc --node def',
        'pencil get --reusable --depth 2',
        'pencil --file foo.pen get --name "Comp/.*" --search 3',
        'pencil get --type frame --search 2',
        'pencil get --resolve-instances --resolve-variables',
        'pencil get --input \'{"patterns":[{"reusable":true}],"readDepth":3}\'',
      ],
    })
    .input(
      s(
        v.object({
          node: v.optional(v.array(v.string())),
          parent: v.optional(v.string()),
          depth: v.optional(v.number()),
          search: v.optional(v.number()),
          reusable: v.optional(v.boolean()),
          name: v.optional(v.string()),
          type: v.optional(
            v.picklist([
              'frame',
              'group',
              'rectangle',
              'ellipse',
              'line',
              'polygon',
              'path',
              'text',
              'connection',
              'note',
              'icon_font',
              'image',
              'ref',
            ]),
          ),
          'resolve-instances': v.optional(v.boolean()),
          'resolve-variables': v.optional(v.boolean()),
          'path-geometry': v.optional(v.boolean()),
          raw: v.optional(v.boolean()),
        }),
      ),
    ),

  design: c
    .meta({
      description: 'Execute design operations on a .pen file',
      aliases: ['d'],
      examples: [
        'pencil design "panel=I(parent, {type: \'frame\', fill: \'$--card\'})"',
        'pencil design @ops.txt',
        'cat ops.txt | pencil design',
        'pencil --script ./scripts/my-design.ts',
      ],
    })
    .args('ops?')
    .input(s(v.object({ ops: v.optional(v.string()) }))),

  screenshot: c
    .meta({
      description: 'Capture a node screenshot — saved to $PWD/.pencil/screenshots/',
      aliases: ['ss'],
    })
    .input(s(v.object({ node: v.string() }))),

  vars: c
    .meta({ description: 'Get variables and themes from a .pen file', aliases: ['v'] })
    .input(s(v.object({}))),

  'set-vars': c
    .meta({
      description: 'Set variables in a .pen file',
      examples: [
        'pencil --file foo.pen set-vars --input \'{"variables":{"--background":{"light":"#fff","dark":"#000"}},"replace":false}\'',
      ],
    })
    .input(
      s(
        v.object({
          variables: v.record(v.string(), v.unknown()),
          replace: v.optional(v.boolean(), false),
        }),
      ),
    ),

  layout: c
    .meta({ description: 'Get layout snapshot', aliases: ['l'] })
    .input(
      s(
        v.object({
          parent: v.optional(v.string()),
          depth: v.optional(v.number()),
          problems: v.optional(v.boolean(), false),
        }),
      ),
    ),

  space: c
    .meta({ description: 'Find empty space on the canvas' })
    .input(
      s(
        v.object({
          direction: v.picklist(['top', 'right', 'bottom', 'left']),
          width: v.number(),
          height: v.number(),
          node: v.optional(v.string()),
          padding: v.optional(v.number(), 40),
        }),
      ),
    ),

  guidelines: c
    .meta({ description: 'Get design guidelines for a topic' })
    .input(
      s(
        v.object({
          topic: v.picklist([
            'code',
            'table',
            'tailwind',
            'landing-page',
            'design-system',
            'mobile-app',
            'web-app',
            'slides',
          ]),
        }),
      ),
    ),

  'style-tags': c
    .meta({ description: 'List available style guide tags' })
    .input(s(v.object({}))),

  'style-guide': c
    .meta({ description: 'Get a style guide by tags or name' })
    .input(
      s(
        v.object({
          tag: v.optional(v.array(v.string())),
          name: v.optional(v.string()),
        }),
      ),
    ),

  'search-props': c
    .meta({ description: 'Search unique property values in a node subtree' })
    .input(
      s(
        v.object({
          parent: v.array(v.string()),
          prop: v.array(
            v.picklist([
              'fillColor',
              'textColor',
              'strokeColor',
              'strokeThickness',
              'cornerRadius',
              'padding',
              'gap',
              'fontSize',
              'fontFamily',
              'fontWeight',
            ]),
          ),
        }),
      ),
    ),

  'replace-props': c
    .meta({
      description: 'Replace matching property values across a node subtree',
      examples: [
        'pencil replace-props --input \'{"parents":["id1"],"properties":{"fillColor":[{"from":"#FF0000","to":"$--primary"}]}}\'',
      ],
    })
    .input(
      s(
        v.object({
          parents: v.array(v.string()),
          properties: v.record(v.string(), v.unknown()),
        }),
      ),
    ),
}

// ── Var normalization ─────────────────────────────────────────────────────────

// Agents write "--var"; MCP expects "$--var". Normalize before sending.
// Walks any JSON-serializable value and prefixes bare "--..." strings with "$".
function addVarPrefix(v: unknown): unknown {
  if (typeof v === 'string') return v.startsWith('--') ? '$' + v : v
  if (Array.isArray(v)) return v.map(addVarPrefix)
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, addVarPrefix(val)]))
  return v
}

// In the design DSL string, quoted "--..." values → "$--..."
function addVarPrefixInDsl(ops: string): string {
  return ops.replace(/"(--[a-zA-Z0-9-]+)"/g, (_, name: string) => `"$${name}"`)
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = cli(schema, {
  name: 'pencil',
  version: '0.1.0',
  description: 'Ergonomic CLI for Pencil design — wraps the Pencil MCP server',
  globals: s(
    v.object({
      file: v.optional(v.string()),
    }),
  ),
  context: (globals) => ({ filePath: globals.file }),
})

// ── Handlers ──────────────────────────────────────────────────────────────────

app.run({
  handlers: {
    skills: {
      add: ({ input }) => {
        const targetBase = input.to ?? process.cwd()
        const skillName = input.name ?? 'pencil'
        const dest = join(targetBase, '.agents', 'skills', skillName)
        const src = join(import.meta.dir, '..', 'skills', 'pencil')

        if (!existsSync(src)) {
          console.error(`Skill source not found: ${src}`)
          process.exit(1)
        }

        mkdirSync(dest, { recursive: true })
        cpSync(src, dest, { recursive: true })
        console.log(`Installed skill → ${dest}`)
      },
    },

    server: {
      start: async ({ input }) => {
        const port = input.port
        console.log(`Starting Pencil MCP server on port ${port}...`)
        const session = await startServer(port)
        console.log(
          `Started (PID: ${session.pid})\n` +
            `  Stop with:  pencil server stop\n` +
            `  Or:         kill ${session.pid}`,
        )
      },

      stop: async () => {
        const { stopped, pid } = await stopServer()
        if (stopped) {
          console.log(`Stopped server (PID: ${pid})`)
        } else {
          console.log('No running server found')
        }
      },

      status: async () => {
        const { running, pid, port, sessionOk } = await serverStatus()
        if (!running) {
          console.log('Server: not running')
          return
        }
        console.log(
          `Server: running\n  PID:     ${pid}\n  Port:    ${port}\n  Session: ${sessionOk ? 'ok' : 'expired'}`,
        )
      },
    },

    open: async ({ input }) => {
      print(await callTool('open_document', { filePathOrTemplate: input.path }))
    },

    state: async ({ input }) => {
      print(await callTool('get_editor_state', { include_schema: input.schema }))
    },

    get: async ({ input, context }) => {
      const args: Record<string, unknown> = {}
      if (context.filePath) args.filePath = context.filePath
      if (input.node?.length) args.nodeIds = input.node
      if (input.parent) args.parentId = input.parent
      if (input.depth !== undefined) args.readDepth = input.depth
      if (input.search !== undefined) args.searchDepth = input.search
      if (input['resolve-instances'] !== undefined) args.resolveInstances = input['resolve-instances']
      if (input['resolve-variables'] !== undefined) args.resolveVariables = input['resolve-variables']
      if (input['path-geometry'] !== undefined) args.includePathGeometry = input['path-geometry']

      // Build patterns array from individual filters
      const pattern: Record<string, unknown> = {}
      if (input.reusable !== undefined) pattern.reusable = input.reusable
      if (input.name) pattern.name = input.name
      if (input.type) pattern.type = input.type
      if (Object.keys(pattern).length) args.patterns = [pattern]

      const result = await callTool('batch_get', args)
      if (input.raw) {
        print(result)
      } else {
        print({ ...result, text: formatNodes(result.text) })
      }
    },

    design: async ({ input, context }) => {
      let ops: string

      if (input.ops) {
        // Positional: inline string or @file reference
        if (input.ops.startsWith('@')) {
          ops = await Bun.file(input.ops.slice(1)).text()
        } else {
          ops = input.ops
        }
      } else if (!process.stdin.isTTY) {
        // Piped stdin
        ops = await Bun.stdin.text()
      } else {
        console.error('Usage: pencil design "<ops>"  |  pencil design @ops.txt  |  cat ops.txt | pencil design')
        process.exit(1)
      }

      const args: Record<string, unknown> = { operations: addVarPrefixInDsl(ops.trim()) }
      if (context.filePath) args.filePath = context.filePath

      const result = await callTool('batch_design', args)

      // Workaround: batch_design may escape $ to \$ in variable references.
      // Post-process the file to fix "\\$--var" → "$--var" if file is known.
      if (context.filePath) {
        const file = Bun.file(context.filePath)
        const text = await file.text()
        const fixed = text.replace(/\\{1,2}\$--/g, '$--')
        if (fixed !== text) {
          await Bun.write(context.filePath, fixed)
          await callTool('open_document', { filePathOrTemplate: context.filePath })
        }
      }

      print(result)
    },

    screenshot: async ({ input, context }) => {
      const args: Record<string, unknown> = { nodeId: input.node }
      if (context.filePath) args.filePath = context.filePath
      print(await callTool('get_screenshot', args))
    },

    vars: async ({ context }) => {
      const args: Record<string, unknown> = {}
      if (context.filePath) args.filePath = context.filePath
      const result = await callTool('get_variables', args)
      try {
        const { variables } = JSON.parse(result.text) as {
          variables: Record<string, { type: string; value: unknown }>
        }
        const rows = Object.entries(variables).map(([token, { type, value }]) => {
          if (Array.isArray(value)) {
            const byTheme: Record<string, string> = {}
            for (const entry of value as { theme: Record<string, string>; value: string }[]) {
              const label = Object.values(entry.theme).join('/')
              byTheme[label] = entry.value
            }
            return { token, type, light: byTheme['Light'] ?? '', dark: byTheme['Dark'] ?? '' }
          }
          const v = String(value)
          return { token, type, light: fmt.dim(v), dark: fmt.dim(v) }
        })
        printTable(
          [
            { key: 'token', label: 'TOKEN' },
            { key: 'type', label: 'TYPE' },
            { key: 'light', label: 'LIGHT' },
            { key: 'dark', label: 'DARK' },
          ],
          rows,
        )
      } catch {
        print(result)
      }
    },

    'set-vars': async ({ input, context }) => {
      const args: Record<string, unknown> = {
        variables: input.variables,
        replace: input.replace,
      }
      if (context.filePath) args.filePath = context.filePath
      print(await callTool('set_variables', args))
    },

    layout: async ({ input, context }) => {
      const args: Record<string, unknown> = {}
      if (context.filePath) args.filePath = context.filePath
      if (input.parent) args.parentId = input.parent
      if (input.depth !== undefined) args.maxDepth = input.depth
      if (input.problems) args.problemsOnly = true
      print(await callTool('snapshot_layout', args))
    },

    space: async ({ input, context }) => {
      const args: Record<string, unknown> = {
        direction: input.direction,
        width: input.width,
        height: input.height,
        padding: input.padding,
      }
      if (context.filePath) args.filePath = context.filePath
      if (input.node) args.nodeId = input.node
      print(await callTool('find_empty_space_on_canvas', args))
    },

    guidelines: async ({ input }) => {
      print(await callTool('get_guidelines', { topic: input.topic }))
    },

    'style-tags': async () => {
      print(await callTool('get_style_guide_tags', {}))
    },

    'style-guide': async ({ input }) => {
      const args: Record<string, unknown> = {}
      if (input.tag?.length) args.tags = input.tag
      if (input.name) args.name = input.name
      print(await callTool('get_style_guide', args))
    },

    'search-props': async ({ input, context }) => {
      const args: Record<string, unknown> = {
        parents: input.parent,
        properties: input.prop,
      }
      if (context.filePath) args.filePath = context.filePath
      print(await callTool('search_all_unique_properties', args))
    },

    'replace-props': async ({ input, context }) => {
      const args: Record<string, unknown> = {
        parents: input.parents,
        properties: addVarPrefix(input.properties),
      }
      if (context.filePath) args.filePath = context.filePath
      const result = await callTool('replace_all_matching_properties', args)

      // Bug workaround: replace_all_matching_properties escapes $ to \$ in the
      // .pen JSON, producing "\\$--var" instead of the valid "$--var" variable
      // reference format. Strip the spurious backslash and reload in Pencil.
      if (context.filePath) {
        const file = Bun.file(context.filePath)
        const fixed = (await file.text()).replace(/\\{1,2}\$--/g, '$--')
        await Bun.write(context.filePath, fixed)
        await callTool('open_document', { filePathOrTemplate: context.filePath })
      }

      print(result)
    },
  },
})
