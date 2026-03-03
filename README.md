# pencil-cli

Ergonomic CLI for [Pencil](https://www.pencil.design) — wraps the Pencil MCP server with composable, agent-friendly commands.

```bash
bun install -g pencil-cli   # coming soon to npm
pencil --schema             # explore all commands
```

---

## Why

The raw MCP server works, but it's awkward to drive from agents or the terminal:

- Output is dense JSON — hard to read at a glance
- Variable references require a `$--var` sigil that's easy to get wrong
- No way to audit design tokens without parsing nested JSON
- Complex inputs require escaped JSON strings in shell

`pencil-cli` fixes all of this.

---

## Features

### `get` — reads canvas nodes as JSX

Instead of raw JSON, `pencil get` outputs a readable JSX snapshot with structural deduplication. Repeated subtrees are automatically extracted as named `const` components.

```bash
pencil --file foo.pen get --parent <nodeId> --depth 6
```

```
PlanTitle = (
  <Text fill="--foreground" fontFamily="Inter" fontSize={13} fontWeight="600">Trial</Text>
)
UsageLabel = (
  <Text fill="--muted-foreground" fontFamily="Inter" fontSize={11} fontWeight="normal">3 / 7 days left</Text>
)
TrialFill = (
  <Frame cornerRadius={2} fill="--muted-foreground" height="fill_container" width={53} />
)
ProgressBar = (
  <Frame cornerRadius={2} fill="--border" height={4} width="fill_container">
    <TrialFill id="nvTHX" />
  </Frame>
)
UsageRow = (
  <Frame gap={4} layout="vertical" width="fill_container">
    <UsageLabel id="PY42K" />
    <ProgressBar id="NIvlq" />
  </Frame>
)

<Frame id="eNsZZ" cornerRadius={10} fill="--muted" gap={10} layout="vertical" padding={12} width={147}>
  <PlanTitle id="MtHmF" />
  <UsageRow id="qj29g" />
  <Frame id="UzCha" alignItems="center" cornerRadius={6} fill="--primary" height={32} justifyContent="center" width="fill_container">
    <Text id="ndpmq" fill="--primary-foreground" fontFamily="Inter" fontSize={12} fontWeight="600">Sign In</Text>
  </Frame>
</Frame>
```

Pass `--raw` to get the original JSON instead.

---

### `vars` — design token table

```bash
pencil --file foo.pen vars
```

```
TOKEN                         TYPE    LIGHT    DARK
────────────────────────────────────────────────────────
--background                  color   #FFFFFF  #09090B
--foreground                  color   #09090B  #FAFAFA
--card                        color   #FFFFFF  #18181B
--card-foreground             color   #09090B  #FAFAFA
--primary                     color   #18181B  #E4E4E7
--primary-foreground          color   #FAFAFA  #18181B
--muted                       color   #F4F4F5  #27272A
--muted-foreground            color   #71717A  #A1A1AA
--border                      color   #E4E4E7  #FFFFFF1A
--destructive                 color   #DC2626  #F87171
--radius                      number  10       10
--radius-md                   number  8        8
--radius-sm                   number  6        6
...
```

---

### `$--var` is hidden

Pencil's internal format for variable references is `$--variable-name`. The CLI abstracts this away entirely:

- **Output**: `get` and `vars` always show `--var` (no `$`)
- **Input**: write `--primary` in `design` ops or `replace-props` values — the CLI injects `$` before sending to the MCP server

Agents never need to know `$--var` exists.

---

## Commands

```
pencil --schema              # full typed schema with examples
pencil --schema=.get         # zoom in on one command

pencil --file foo.pen get --reusable --depth 2
pencil --file foo.pen get --parent <id> --depth 5
pencil --file foo.pen get --raw          # original JSON

pencil --file foo.pen vars
pencil --file foo.pen screenshot --node <id>
pencil --file foo.pen layout --problems

pencil --file foo.pen design "panel=I('root', {type:'frame', fill:'--card'})"
pencil --file foo.pen replace-props --eval ...
pencil --file foo.pen set-vars --eval ...

pencil server status
pencil server start
pencil server stop
```

---

## Agent workflow

```bash
# 1. Check available design tokens
pencil --file foo.pen vars

# 2. Discover reusable components
pencil --file foo.pen get --reusable --depth 2

# 3. See canvas structure
pencil --file foo.pen get --depth 1

# 4. Screenshot a reference screen
pencil --file foo.pen screenshot --node <id>

# 5. Design — use --eval to avoid JSON escaping
pencil --eval "
  await argc.handlers.design({
    file: 'foo.pen',
    ops: \`
      card=I('root', { type: 'frame', fill: '--card', cornerRadius: 12, padding: 24 })
      title=I(card, { type: 'text', content: 'Hello', fill: '--foreground' })
    \`
  })
"
```

Install as an agent skill:

```bash
pencil skills add                          # installs into .agents/skills/pencil/
pencil skills add --to /path/to/project
```

---

## Install

```bash
git clone https://github.com/ethan-huo/pencil-cli
cd pencil-cli
bun install
bun link        # makes `pencil` available globally
```

Requires [Pencil](https://www.pencil.design) to be running with MCP enabled.
