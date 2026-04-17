export const SKILL_MD = `---
name: mdscroll
description: Preview generated Markdown (plans, design notes, reviews, research reports) in the user's browser. Use when sharing long, structured output — documents with headings, tables, code blocks, or Mermaid diagrams — that is hard to read in the terminal.
---

# mdscroll

Pipe generated Markdown through \`mdscroll push\` to the local browser preview. The server renders it with GitHub-style styling, Shiki syntax highlighting, Mermaid diagrams, GFM alerts, task lists, and tables.

## When to use

Use this skill when ANY of the following is true:

- The user explicitly asks: "show it in the browser", "preview this", "open it in mdscroll", or similar
- You produced a structured document (roughly 20+ lines, or containing headings, tables, code blocks, or Mermaid) that would be cumbersome to read scrolling the terminal
- You are delivering a plan, design doc, code review, or research report — the kind of output the user will sit down and read

Do NOT use this for short answers, one-off replies, or small code snippets.

## How to use

Push content via stdin or a temp file:

\`\`\`bash
# 1) stdin (heredoc)
cat <<'MDSCROLL_EOF' | mdscroll push
# Title

Body...
MDSCROLL_EOF

# 2) temp file
TMP=$(mktemp -t mdscroll.XXXXXX.md)
printf '%s\\n' "$CONTENT" > "$TMP"
mdscroll push "$TMP"
rm -f "$TMP"
\`\`\`

- \`mdscroll push\` auto-spawns the server if it isn't already running
- To also open the browser, run \`mdscroll\` separately (it's a no-op if already running)
- Each push **replaces** the previous content — there is no history

## Steps

1. Assemble the Markdown you want to display
2. Push it using one of the commands above
3. If the exit code is 0 and you see \`mdscroll: pushed to ...\`, it worked. Tell the user the content is now in their browser.

## When the command is missing

If \`mdscroll: command not found\` appears, guide the user to install:

\`\`\`bash
pnpm add -g mdscroll   # or: npm i -g mdscroll
\`\`\`

## Configuration

- Default host/port: \`127.0.0.1:4977\`
- Override: \`mdscroll push --port 5000 --host 0.0.0.0 <file>\`
`;

export const SKILL_FILENAME = 'SKILL.md';
export const DEFAULT_SKILL_NAME = 'mdscroll';
