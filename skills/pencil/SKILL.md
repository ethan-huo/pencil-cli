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
4. **Complex inputs use `--input '{...}'`** — for `set-vars`, `replace-props`, and anything flags can't fully express. `--file` still works alongside `--input`.
5. **Use `--script` for logic-heavy operations** — loops, conditionals, multi-step sequences → write a `.ts` script, run with `pencil --script ./script.ts`.

## Pre-flight: Canvas Discovery (MANDATORY)

```bash
pencil --file foo.pen get --reusable --depth 2   # discover reusable components
pencil --file foo.pen get --depth 1              # top-level canvas structure
pencil --file foo.pen screenshot --node <id>     # visual reference of existing screen
```

If a matching component exists → use `type: "ref", ref: "<componentId>"` instead of rebuilding it.

## Scripting

```typescript
// scripts/example.ts
export async function main(argc) {
  await argc.handlers.get({ file: 'design/OnType-v2.pen', reusable: true, depth: 2 })
  await argc.handlers.design({ file: 'design/OnType-v2.pen', ops: `...` })
}
```

```bash
pencil --script ./scripts/example.ts
pencil --eval "await argc.handlers.vars({})"
```
