# Sync Pencil MCP API → CLI

Update `src/main.ts` to match the current Pencil MCP server's tool definitions.

## Step 1 — Fetch live tool schemas

Pencil must be running. Start the CLI server if needed:

```bash
pencil server start
```

Then fetch the full tool list from the running server:

```bash
SESSION=$(cat /tmp/pencil-cli-session.json | python3 -c "import json,sys; print(json.load(sys.stdin)['sessionId'])")
PORT=$(cat /tmp/pencil-cli-session.json | python3 -c "import json,sys; print(json.load(sys.stdin)['port'])")

curl -s -X POST http://localhost:$PORT/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
| python3 -c "
import json, sys
data = json.load(sys.stdin)
for tool in data['result']['tools']:
    print('=== ' + tool['name'] + ' ===')
    print(json.dumps(tool['inputSchema'], indent=2))
    print()
"
```

## Step 2 — Diff against current CLI

Read `src/main.ts` and compare each MCP tool against the corresponding CLI command:

| MCP tool | CLI command |
|----------|-------------|
| `batch_design` | `design` |
| `batch_get` | `get` |
| `find_empty_space_on_canvas` | `space` |
| `get_editor_state` | `state` |
| `get_guidelines` | `guidelines` |
| `get_screenshot` | `screenshot` |
| `get_style_guide` | `style-guide` |
| `get_style_guide_tags` | `style-tags` |
| `get_variables` | `vars` |
| `open_document` | `open` |
| `replace_all_matching_properties` | `replace-props` |
| `search_all_unique_properties` | `search-props` |
| `set_variables` | `set-vars` |
| `snapshot_layout` | `layout` |

For each tool, check:
- **New parameters** → add to the valibot schema in `main.ts` + handler
- **Removed parameters** → remove from schema + handler
- **Changed enums or types** → update picklist/type in schema
- **New tools** → add new command (schema + handler)
- **Removed tools** → remove command

## Step 3 — Mapping rules

When adding a new parameter to a command schema, follow these conventions:

**Naming**: MCP uses `camelCase` (`resolveInstances`), CLI flags use `kebab-case` (`--resolve-instances`). Map in the handler: `input['resolve-instances'] → args.resolveInstances`.

**`filePath`**: Always comes from the global `--file` context, never as a per-command flag. Skip it in per-command schemas.

**Boolean flags**: Use `v.optional(v.boolean())` — no default unless the MCP schema specifies one.

**Enums**: Use `v.picklist([...])` with the exact values from the MCP `enum` field.

**Complex object inputs** (no obvious flag decomposition): Skip individual flags, let the user pass the full structure via argc's built-in `--input '{...}'`. Document this in `examples`.

**`patterns` array** (batch_get only): Decompose into individual flags (`--reusable`, `--name`, `--type`) and merge into a single pattern object in the handler. If multiple disjoint patterns are needed, the user can use `--input`.

## Step 4 — Update handler

After updating the schema, update the corresponding handler in `app.run({ handlers: { ... } })` to pass the new parameter to `callTool(...)`. Pattern:

```typescript
// schema
'new-param': v.optional(v.boolean()),

// handler
if (input['new-param'] !== undefined) args.newParam = input['new-param']
```

## Step 5 — Verify

```bash
# Check schema output looks right
pencil --schema

# Test the updated command against the live server
pencil <command> [new flags]

# Typecheck
cd /Users/dio/Projects/pencil-cli && bun run tsc --noEmit
```

## Step 6 — Commit

```bash
cd /Users/dio/Projects/pencil-cli
git add src/main.ts
git commit -m "sync: Pencil MCP API update — <brief description of changes>"
```
