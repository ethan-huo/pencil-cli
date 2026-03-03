---
name: pencil
description: Operate Pencil .pen design files via the `pencil` CLI. Use when reading canvas structure, executing design operations, taking screenshots, or managing variables in .pen files. Replaces direct MCP tool calls with composable, scriptable CLI commands.
---

# Pencil CLI Skill

## Agent Rules (MANDATORY)

1. **Always pass `--file`** as a global flag before the subcommand — not per-command. Example: `pencil --file design/OnType-v2.pen get --reusable`.
2. **Check server before first use** — run `pencil server status`. If not running, any command auto-starts it; the PID and stop instructions are printed to stderr.
3. **Run canvas discovery before any design task** — two calls, always, no exceptions (see Pre-flight below).
4. **Screenshots land in `$PWD/.pencil/screenshots/`** — use the `Read` tool on the printed path to view them. Do not attempt to display base64 inline.
5. **Complex inputs use `--input '{...}'`** — for `set-vars`, `replace-props`, and any command where flags don't cover the full structure. Global `--file` still works alongside `--input`.
6. **Use `--script` for multi-step operations** — when a design task needs logic, loops, or conditionals, write a `.ts` script and run it with `pencil --script ./script.ts` instead of chaining CLI calls.
7. **Never call `pencil server start` manually** in most cases — auto-start is transparent. Only use explicit `server` commands when debugging process issues.

## Server Management

```bash
pencil server status          # check if running + session health
pencil server start           # explicit start (usually not needed)
pencil server stop            # stop and clean up session
```

Auto-start: any command will start the server if it's not running and print:
```
[pencil] Started MCP server on port 18899 (PID: 12345)
         To stop: pencil server stop  |  kill 12345
```

## Pre-flight: Canvas Discovery (MANDATORY before any design task)

Before designing anything — new screen, modification, or component reuse — run:

```bash
# 1. Discover all reusable components
pencil --file design/OnType-v2.pen get --reusable --depth 2

# 2. See top-level canvas structure
pencil --file design/OnType-v2.pen get --depth 1

# 3. Screenshot an existing related screen for visual reference
pencil --file design/OnType-v2.pen screenshot --node <existingFrameId>
# → saved to .pencil/screenshots/screenshot-{ts}.png — use Read tool to view
```

If a matching component exists, reference it via `type: "ref", ref: "<componentId>"` in `design` ops.

## Command Reference

Full schema: `pencil --schema`
Detailed flag docs: `pencil --schema=.<command>`

### Read / Discover

```bash
# Current active file + selection
pencil state
pencil state --schema                      # include .pen file schema docs

# Fetch nodes
pencil --file foo.pen get --node id1 --node id2
pencil --file foo.pen get --reusable --depth 2
pencil --file foo.pen get --name "Comp/.*" --search 3
pencil --file foo.pen get --type frame --search 2
pencil --file foo.pen get --resolve-instances   # expand component instances
pencil --file foo.pen get --resolve-variables   # show computed values
pencil --file foo.pen get --input '{"patterns":[{"reusable":true,"type":"frame"}],"readDepth":3}'

# Layout inspection
pencil --file foo.pen layout
pencil --file foo.pen layout --parent nodeId --depth 3
pencil --file foo.pen layout --problems          # only layout-broken nodes

# Find canvas space for a new frame
pencil --file foo.pen space --direction right --width 1440 --height 900

# Variables
pencil --file foo.pen vars

# Property audit across a subtree
pencil --file foo.pen search-props --parent rootId --prop fillColor --prop textColor
```

### Write / Design

```bash
# Inline operations string
pencil --file foo.pen design "panel=I('parent', {type: 'frame', fill: '\$--card', cornerRadius: 12})"

# From a file
pencil --file foo.pen design @ops.txt

# Piped from stdin
cat ops.txt | pencil --file foo.pen design

# TypeScript script with full handler access (for complex/conditional logic)
pencil --script ./scripts/build-home.ts
```

### Variables

```bash
# Set / update variables
pencil --file foo.pen set-vars --input '{
  "variables": {
    "--brand": { "light": "#FF8400", "dark": "#FF8400" }
  },
  "replace": false
}'
```

### Replace properties across a subtree

```bash
pencil --file foo.pen replace-props --input '{
  "parents": ["rootNodeId"],
  "properties": {
    "fillColor": [{ "from": "#18181B", "to": "$--card" }],
    "textColor": [{ "from": "#FAFAFA", "to": "$--foreground" }]
  }
}'
```

### Screenshot

```bash
pencil --file foo.pen screenshot --node <nodeId>
# Prints: screenshot: /path/to/.pencil/screenshots/screenshot-1234567890.png
# Then: use Read tool on that path to view the image
```

## Scripting (--script / --eval)

For operations that require logic, use a TypeScript script. The `argc` object exposes all CLI handlers:

```typescript
// scripts/build-home.ts
export async function main(argc) {
  const filePath = 'design/OnType-v2.pen'

  // Discover existing components
  const comps = await argc.handlers.get({ file: filePath, reusable: true, depth: 2 })

  // Execute design based on discovered structure
  await argc.handlers.design({
    file: filePath,
    ops: `
      frame=I("canvas", {type: "frame", name: "Page/Home", width: 1440, height: 900, fill: "$--background"})
      sidebar=I(frame, {type: "frame", fill: "$--sidebar", width: 172, layout: "vertical"})
    `,
  })
}
```

Run with:
```bash
pencil --script ./scripts/build-home.ts
```

## Design Operation DSL

The `design` command accepts Pencil's operation DSL directly. Quick reference:

```javascript
// Insert
panel=I("parentId", { type: "frame", fill: "$--card", cornerRadius: 12, padding: 24 })

// Copy (within same file)
copy=C("sourceId", "parentId", { name: "NewName", positionDirection: "right" })

// Update
U("nodeId", { fill: "$--muted", cornerRadius: 8 })
U(panel+"/childName", { content: "Hello" })   // update descendant via path

// Replace
R("nodeId", { type: "text", content: "Replaced" })

// Delete
D("nodeId")

// Move
M("nodeId", "newParentId", 2)   // 2 = position index

// Component instance
btn=I("parentId", { type: "ref", ref: "ButtonCompId" })
```

Variable references in any color property: `"$--variable-name"` (see the pencil-design skill for token list).

## Common Patterns

### Discover → screenshot → design loop

```bash
# 1. Discover
pencil --file v2.pen get --reusable --depth 2

# 2. Screenshot existing frame for visual reference
pencil --file v2.pen screenshot --node existingFrameId
# Read the printed path with Read tool

# 3. Design
pencil --file v2.pen design @ops.txt

# 4. Verify
pencil --file v2.pen screenshot --node newFrameId
```

### Audit and migrate hardcoded colors

```bash
# Find all unique fill colors in a subtree
pencil --file v2.pen search-props --parent rootId --prop fillColor --prop textColor --prop strokeColor

# Replace them with tokens
pencil --file v2.pen replace-props --input '{
  "parents": ["rootId"],
  "properties": {
    "fillColor": [
      { "from": "#18181B", "to": "$--card" },
      { "from": "#09090B", "to": "$--background" }
    ]
  }
}'
```

## References

- `references/command-schema.md` — Full `pencil --schema` output, pinned at install time
- Run `pencil --schema` live for the current version
- Run `pencil --schema=.<command>` for a specific command's full flag docs
