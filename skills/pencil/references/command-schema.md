# pencil CLI — Command Schema
CLI Syntax:
  arrays:  --tag a --tag b             → tag: ["a", "b"]
  objects: --user.name x --user.age 1  → user: { name: "x", age: 1 }

Ergonomic CLI for Pencil design — wraps the Pencil MCP server

type Pencil = {
  // Global options available to all commands
  $globals: { file?: string }

  // Manage the Pencil MCP server process
  server: {
    // Start Pencil MCP server in the background
    start(port?: number = 18899)
    // Stop the running Pencil MCP server
    stop()
    // Show server status
    status()
  }
  // Open a .pen file or create a new one
  open(path: string)
  // Get current editor state
  state(schema?: boolean = false)
  // Retrieve nodes by ID or search patterns
  // $ pencil get --node abc --node def
  // $ pencil get --reusable --depth 2
  // $ pencil --file foo.pen get --name "Comp/.*" --search 3
  // $ pencil get --type frame --search 2
  // $ pencil get --resolve-instances --resolve-variables
  // $ pencil get --input '{"patterns":[{"reusable":true}],"readDepth":3}'
  get(node?: string[], parent?: string, depth?: number, search?: number, reusable?: boolean, name?: string, type?: "frame" | "group" | "rectangle" | "ellipse" | "line" | "polygon" | "path" | "text" | "connection" | "note" | "icon_font" | "image" | "ref", resolve-instances?: boolean, resolve-variables?: boolean, path-geometry?: boolean)
  // Execute design operations on a .pen file
  // $ pencil design "panel=I(parent, {type: 'frame', fill: '$--card'})"
  // $ pencil design @ops.txt
  // $ cat ops.txt | pencil design
  // $ pencil --script ./scripts/my-design.ts
  design(ops?: string)
  // Capture a node screenshot — saved to $PWD/.pencil/screenshots/
  screenshot(node: string)
  // Get variables and themes from a .pen file
  vars()
  // Set variables in a .pen file
  // $ pencil --file foo.pen set-vars --input '{"variables":{"--background":{"light":"#fff","dark":"#000"}},"replace":false}'
  set-vars(variables: object, replace?: boolean = false)
  // Get layout snapshot
  layout(parent?: string, depth?: number, problems?: boolean = false)
  // Find empty space on the canvas
  space(direction: "top" | "right" | "bottom" | "left", width: number, height: number, node?: string, padding?: number = 40)
  // Get design guidelines for a topic
  guidelines(topic: "code" | "table" | "tailwind" | "landing-page" | "design-system" | "mobile-app" | "web-app" | "slides")
  // List available style guide tags
  style-tags()
  // Get a style guide by tags or name
  style-guide(tag?: string[], name?: string)
  // Search unique property values in a node subtree
  search-props(parent: string[], prop: "fillColor" | "textColor" | "strokeColor" | "strokeThickness" | "cornerRadius" | "padding" | "gap" | "fontSize" | "fontFamily" | "fontWeight"[])
  // Replace matching property values across a node subtree
  // $ pencil replace-props --input '{"parents":["id1"],"properties":{"fillColor":[{"from":"#FF0000","to":"$--primary"}]}}'
  replace-props(parents: string[], properties: object)
}
Generated: 2026-03-03
