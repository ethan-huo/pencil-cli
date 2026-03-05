---
name: pencil
description: Design and iterate on .pen design files via the `pencil` CLI. Use when reading canvas structure, executing design operations, taking screenshots, or managing variables in .pen files.
---

# Pencil Design Workflow

## CLI reference

```bash
pencil --schema               # full typed schema — signatures, flags, examples
pencil --schema=.<command>    # zoom in on one command
```

`--schema` is the authoritative CLI reference. This document covers the **design workflow** — the thinking and process that makes the tools effective.

## Rules

1. **`--file` is global** — pass it before the subcommand: `pencil --file foo.pen get ...`
2. **Never skip discovery** — always run the pre-flight sequence before designing.
3. **Screenshots land in `$PWD/.pencil/screenshots/`** — use the `Read` tool on the printed path to view them.
4. **All colors must be tokens** — hardcoded hex values are wrong. Use `$--background`, `$--card`, `$--primary`, etc.
5. **Output is JSX-serialized scene graph** — the CLI renders the JSON node tree as JSX for readability. It's still a scene graph underneath — node types, IDs, and properties map 1:1 to the .pen schema.

## Commands at a glance

| Command | Purpose |
|---------|---------|
| `state` | Current editor state — active file, selection, top-level nodes |
| `open <path>` | Open a .pen file (or create new) |
| `get` | Read nodes by ID or search patterns (type, name, reusable) |
| `design` | Execute insert/copy/update/replace/move/delete/image ops |
| `screenshot --node <id>` | Capture a node as image for visual verification |
| `vars` | List all design tokens (colors, radii) with Light/Dark values |
| `set-vars` | Create or update design tokens |
| `layout` | Layout snapshot — computed rectangles, `--problems` for issues |
| `space` | Find empty canvas area for placing new frames |
| `search-props` | Audit unique property values across a subtree |
| `replace-props` | Bulk-replace property values (e.g. hex → token) |
| `guidelines --topic <t>` | Fetch design rules for a domain |
| `style-tags` | List available style guide tags |
| `style-guide` | Get style guide by tags or name (palette, typography inspiration) |

Run `pencil --schema=.<command>` for full flags and examples on any command.

## Pre-flight: Understand Before You Touch

Run these before any design task. The goal is to build a mental model of the canvas.

```bash
# 1. What file is open? What's selected?
pencil state

# 2. What tokens exist? Every color/radius/spacing MUST come from here.
pencil --file foo.pen vars

# 3. What reusable components exist? Reuse before rebuilding.
pencil --file foo.pen get --reusable --depth 2 --compact

# 4. What's on the canvas? Orient yourself.
pencil --file foo.pen get --depth 1 --compact

# 5. Visual reference — screenshot an existing screen to match its style.
pencil --file foo.pen screenshot --node <id>
```

**Why this order matters:**
- `state` first — confirm the right file is active and see what's selected.
- `vars` second — you need to know available tokens before writing any fill/stroke/color values.
- Reusable components third — if a Button or Card already exists, reference it (`type: "ref", ref: "<id>"`) instead of rebuilding from scratch.
- Top-level structure fourth — understand what screens/frames already exist and where they sit on the canvas.
- Screenshot last — gives you a visual target to match when designing adjacent screens.

**`--compact` for structure, full output for styling** — use `--compact` when exploring structure (pre-flight, navigation). It strips all style props (fill, padding, font, etc.) and shows only id, name, type, and tree hierarchy. Omit it when you need the actual design properties to match or modify styling.

**Reading multiple nodes:** `--node` accepts comma-separated IDs:

```bash
pencil --file foo.pen get --node abc12,def34,ghi56 --depth 2
```

**Only nodes with `reusable` attribute can be used as `ref` targets.** The output may also show PascalCase tags like `<NavItemsSection />` — these are display-only shorthands for repeated patterns, NOT reusable components. The footer distinguishes the two.

**Reusable components appear as compact refs** in output (e.g. `<Ref ref="abc12" />`). To inspect a component's internal structure, do a secondary get:

```bash
pencil --file foo.pen get --node abc12,def34 --depth 2
```

## Design cycle

The workflow is iterative: **discover → design → verify → adjust**.

```
state + vars + get (discover)
       |
       v
   space (find where to put new content)
       |
       v
   design (batch operations)
       |
       v
   screenshot (verify visually)
       |
       v
   layout --problems (check for clipping/overlap)
       |
       v
   adjust if needed (repeat)
```

### 1. Design operations

`pencil design` accepts a DSL string of operations. Each line is one op with a binding:

| OP | Signature | Purpose |
|----|-----------|---------|
| **I** | `id=I(parent, {...})` | Insert a new node |
| **C** | `id=C(nodeId, parent, {...})` | Copy a node (copying reusable creates a ref instance) |
| **U** | `U(path, {...})` | Update properties (cannot change children) |
| **R** | `id=R(path, {...})` | Replace a node (swap children inside component instances) |
| **M** | `M(nodeId, parent, index?)` | Move a node |
| **D** | `D(nodeId)` | Delete a node |
| **G** | `G(nodeId, "ai"\|"stock", prompt)` | Fill a frame/rect with AI-generated or stock image |

Bindings chain — use a previous binding as parent for the next op:

```
card=I("rootFrame", {type: "frame", fill: "$--card", layout: "vertical", gap: 12})
title=I(card, {type: "text", content: "Hello", fill: "$--foreground"})
```

Max 25 ops per call. For larger designs, split by logical section.

**Preferred: heredoc** (no escaping, no quoting issues):

```bash
pencil --file foo.pen design <<'EOF'
card=I("rootFrame", {type: "frame", fill: "$--card", layout: "vertical", gap: 12})
title=I(card, {type: "text", content: "Hello", fill: "$--foreground"})
EOF
```

Other input methods:

```bash
pencil --file foo.pen design @ops.txt                          # from file
pencil --file foo.pen design "x=I(root, {type: 'text'})"      # inline (single-line only)
cat ops.txt | pencil --file foo.pen design                     # piped
```

### Design DSL gotchas

These are easy to get wrong. Read carefully.

- **`document` is a predefined binding** — references the root node. Use it as parent only for top-level screens/frames.
- **`placeholder: true`** — marks a frame as a layout container. Set this on a frame before inserting children into it.
- **Component instance paths** — to modify a child inside a ref instance, use slash-separated paths: `U("instanceId/childId", {...})`. Works at any nesting depth.
- **Copy + descendants, not Copy + Update** — C() gives children new IDs, so `U(copiedId+"/oldChildId")` will fail. Override descendants in the Copy itself: `C("srcId", parent, {descendants: {"childId": {content: "New"}}})`.
- **Copy positioning** — use `positionDirection` and `positionPadding` on C() to auto-place the copy: `C("srcId", document, {positionDirection: "right", positionPadding: 100})`.
- **No `image` node type** — images are fills on frame/rectangle nodes. First I() a frame, then G() to apply the image fill.
- **Icon type is `icon_font`** — not `icon`. Use `{type: "icon_font", icon: "loader", family: "lucide"}`.
- **Every I/C/R must have a binding** — even if unused. `foo=I(...)` not `I(...)`.
- **On error, the entire batch rolls back** — fix and retry.

### 2. Visual verification

Always screenshot after designing to catch misalignment, clipping, or visual errors:

```bash
pencil --file foo.pen screenshot --node <frame-id>
```

### 3. Layout problems

Check for clipping and overlap issues without reading the full layout tree:

```bash
pencil --file foo.pen layout --problems
```

## Thinking in tokens

The `vars` output gives you a token table like:

| TOKEN | LIGHT | DARK |
|-------|-------|------|
| --background | #FFFFFF | #09090B |
| --card | #FFFFFF | #18181B |
| --foreground | #09090B | #FAFAFA |
| --primary | #FF8400 | #FF8400 |
| --muted | #F4F4F5 | #27272A |

When designing, always write `$--card` instead of `#18181B`. This ensures the design works across Light/Dark themes automatically.

To add or update tokens:

```bash
pencil --file foo.pen set-vars --input '{"variables":{"--brand":{"type":"color","value":[{"theme":{"Mode":"Light"},"value":"#FF8400"},{"theme":{"Mode":"Dark"},"value":"#FF8400"}]}}}'
```

## Bulk property operations

For tokenizing an existing design (replacing hardcoded hex → tokens):

```bash
# 1. Quick audit — see unique values per property (includes already-tokenized colors as resolved hex)
pencil --file foo.pen search-props --parent <id> --prop fillColor --prop textColor

# 2. Deep audit — find ONLY hardcoded hex values (excludes $--var references)
pencil --file foo.pen get --node <id> --depth 50 --raw | jq '[.. | strings | select(test("^#[0-9A-Fa-f]{3,8}$"))] | unique'

# 3. Replace them
pencil --file foo.pen replace-props --input '{"parents":["<id>"],"properties":{"fillColor":[{"from":"#18181B","to":"--card"}]}}'
```

> **Tip:** `search-props` resolves all values to hex — you can't tell which are already tokenized. Use step 2 (`--raw | jq`) to see only the remaining hardcoded colors that still need replacement. Pipe `--raw` through `jq` for any custom filtering on the full scene graph JSON.

`replace-props` uses `batch_get` + `batch_design` internally, so token references (`$--var`) are always stored correctly.

## Style guides

When designing new screens and not working with an existing design system:

```bash
pencil style-tags                        # list available tags
pencil style-guide --tag modern --tag dark  # get a style guide for inspiration
```

## --eval context

`--eval` runs a JS expression with access to all CLI handlers. Use it for programmatic operations that need logic (loops, conditionals, complex payloads).

**Available API** — do NOT probe with console.log, just call directly:

```
argc.handlers.get({file, node, depth, ...})
argc.handlers.design({file, ops})
argc.handlers.vars({file})
argc.handlers['set-vars']({file, variables, replace})
argc.handlers.screenshot({file, node})
argc.handlers.layout({file, parent, depth, problems})
argc.handlers.space({file, direction, width, height, node, padding})
argc.handlers['search-props']({file, parent, prop})
argc.handlers['replace-props']({file, parents, properties})
argc.handlers['style-guide']({tag, name})
```

Parameters match CLI flags. `file` is the --file path.

Example:

```bash
pencil --eval "
  await argc.handlers['replace-props']({
    file: 'design/App.pen',
    parents: ['rootId'],
    properties: {
      fillColor: [{ from: '#18181B', to: '--card' }],
      textColor: [{ from: '#FAFAFA', to: '--foreground' }],
    },
  })
"
```

## --script

Use when operations are predetermined and don't need mid-way inspection.

```bash
pencil --script ./scripts/tokenize.ts
```

**Discovery first, script second** — always run individual `pencil get` calls to understand the canvas before writing a script.

## Guidelines

Pencil has built-in design guidelines for specific domains (mobile-app, web-app, landing-page, etc.). Before starting a design task, fetch the relevant guideline:

```bash
pencil --schema=.guidelines   # see available topics
pencil guidelines --topic <topic>
```
