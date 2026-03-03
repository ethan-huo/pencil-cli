---
name: pencil
description: Operate Pencil .pen design files via the `pencil` CLI. Use when reading canvas structure, executing design operations, taking screenshots, or managing variables in .pen files. Replaces direct MCP tool calls with composable, scriptable CLI commands.
---

# Pencil CLI Skill

## Discover commands first

```bash
pencil --schema               # full typed schema — signatures, flags, examples, descriptions
pencil --schema=.<command>    # zoom in on one command
```

`--schema` is the authoritative reference. Everything below covers behavior and gotchas that the schema doesn't tell you.

## Agent Rules (MANDATORY)

1. **`--file` is global** — pass it before the subcommand: `pencil --file foo.pen get ...`, not `pencil get --file foo.pen`.
2. **Pre-flight before any design task** — run canvas discovery first (see below). Never skip.
3. **Screenshots land in `$PWD/.pencil/screenshots/`** — use the `Read` tool on the printed path to view them.
4. **Never inline large JSON in shell** — `--input '{"huge":"json"}'` is unreadable and error-prone. Use `--eval` with an object literal or write a `--script` file instead (see below).
5. **Use `--script` for logic-heavy operations** — loops, conditionals, multi-step sequences → write a `.ts` script, run with `pencil --script ./script.ts`.

## Pre-flight: Canvas Discovery (MANDATORY)

```bash
pencil --file foo.pen get --reusable --depth 2   # discover reusable components
pencil --file foo.pen get --depth 1              # top-level canvas structure
pencil --file foo.pen screenshot --node <id>     # visual reference of existing screen
```

If a matching component exists → use `type: "ref", ref: "<componentId>"` instead of rebuilding it.

## Preferred input patterns

### --eval (best for complex, one-off calls)

Use `--eval` with a plain JS object literal — no JSON escaping, no shell quoting hell:

```bash
pencil --eval "
  await argc.handlers['replace-props']({
    file: 'design/OnType-v2.pen',
    parents: ['rootId'],
    properties: {
      fillColor: [{ from: '#18181B', to: '--card' }],
      textColor: [{ from: '#FAFAFA', to: '--foreground' }],
    },
  })
"
```

```bash
pencil --eval "
  await argc.handlers['set-vars']({
    file: 'design/OnType-v2.pen',
    variables: { '--brand': { light: '#FF8400', dark: '#FF8400' } },
  })
"
```

### --script (best for predetermined multi-step logic)

Use `--script` when the operations are already decided and don't require reading output mid-way to make decisions. Typical cases: bulk updates, loops over known node IDs, applying a fixed set of changes.

```typescript
// scripts/tokenize-cards.ts
// Run AFTER you have already discovered node IDs and mapped colors via individual pencil get calls.
export async function main(argc) {
  const file = 'design/OnType-v2.pen'

  // Apply token replacements across multiple known subtrees
  for (const parentId of ['abc12', 'def34', 'ghi56']) {
    await argc.handlers['replace-props']({
      file,
      parents: [parentId],
      properties: {
        fillColor: [
          { from: '#18181B', to: '--card' },
          { from: '#09090B', to: '--background' },
        ],
        textColor: [{ from: '#FAFAFA', to: '--foreground' }],
      },
    })
  }
}
```

```bash
pencil --script ./scripts/tokenize-cards.ts
```

**Discovery first, script second** — always run individual `pencil get` calls interactively to understand the canvas before writing a script. Scripts don't pause for inspection.

### --input (only for simple flag overrides)

Acceptable only when the payload is small and flat. For anything deeply nested, use `--eval` instead.
