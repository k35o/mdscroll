import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
- mdscroll never opens a browser itself — open the printed URL however the host UI prefers (cmux pane, OS browser, etc) and let the user know
- Push \`stdout\` includes the URL: \`mdscroll[default]: pushed to http://127.0.0.1:4977/push\`
- The current host/port can also be discovered via \`mdscroll list\`
- Recent pushes are kept (last 20) and accessible from the History drawer in the browser

## Steps

1. Assemble the Markdown you want to display
2. Push it using one of the commands above
3. If the exit code is 0 and you see \`mdscroll[...]: pushed to <url>\`, it worked
4. Open the URL in whatever browser surface fits the host environment (e.g. \`cmux browser open-split <url>\` inside cmux), then point the user at it

## When the command is missing

If \`mdscroll: command not found\` appears, guide the user to install:

\`\`\`bash
pnpm add -g mdscroll   # or: npm i -g mdscroll
\`\`\`

## Configuration

- Default host/port: \`127.0.0.1:4977\`
- Override: \`mdscroll push --port 5000 --host 0.0.0.0 <file>\`
`;

const SKILL_FILENAME = 'SKILL.md';
const DEFAULT_SKILL_NAME = 'mdscroll';

const defaultDir = (): string => join(homedir(), '.claude', 'skills');

export type InstallSkillOptions = {
  dir?: string | undefined;
  name?: string | undefined;
};

export const resolveSkillPath = (opts: InstallSkillOptions = {}): string => {
  const dir = opts.dir ?? defaultDir();
  const name = opts.name ?? DEFAULT_SKILL_NAME;
  return join(dir, name, SKILL_FILENAME);
};

export const installSkill = async (opts: InstallSkillOptions = {}): Promise<string> => {
  const target = resolveSkillPath(opts);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, SKILL_MD, 'utf-8');
  return target;
};
