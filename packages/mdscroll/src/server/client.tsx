import type { FC } from 'hono/jsx';

type DocumentProps = {
  /** Pre-rendered HTML (from markdown-it + shiki) inlined into <article>. */
  contentHtml: string;
  /** Label shown in the header describing what we're looking at. */
  source: string;
};

type HeaderProps = { source: string };

const Header: FC<HeaderProps> = ({ source }) => (
  <header class="mdscroll-shell-header">
    <span class="mdscroll-brand">mdscroll</span>
    <span class="mdscroll-source" id="mdscroll-source" title={source}>
      {source}
    </span>
    <span class="mdscroll-status" id="mdscroll-status" data-state="idle">
      idle
    </span>
  </header>
);

export const Document: FC<DocumentProps> = ({ contentHtml, source }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>mdscroll</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <div class="mdscroll-shell">
        <Header source={source} />
        <main class="mdscroll-main">
          <article
            id="mdscroll-content"
            class="markdown-body"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: content
            // is produced by our own markdown-it renderer (html: false,
            // shiki-highlighted) and is the whole point of the server.
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </main>
      </div>
      <script type="module" src="/main.js" />
    </body>
  </html>
);

export const STYLES_CSS = `:root {
  color-scheme: light dark;
  --fg: #1f2328;
  --fg-mute: #59636e;
  --bg: #ffffff;
  --bg-raised: #f6f8fa;
  --border: #d1d9e0;
  --border-mute: #eaeef2;
  --accent: #0969da;
  --status-idle: #59636e;
  --status-live: #1a7f37;
  --color-note: #0969da;
  --color-tip: #1a7f37;
  --color-warning: #9a6700;
  --color-caution: #d1242f;
  --color-important: #8250df;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #f0f6fc;
    --fg-mute: #9198a1;
    --bg: #0d1117;
    --bg-raised: #151b23;
    --border: #3d444d;
    --border-mute: #262c36;
    --accent: #4493f8;
    --status-idle: #9198a1;
    --status-live: #3fb950;
    --color-note: #2f81f7;
    --color-tip: #3fb950;
    --color-warning: #d29922;
    --color-caution: #f85149;
    --color-important: #a371f7;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
    Helvetica, Arial, "Hiragino Sans", "Yu Gothic UI", sans-serif;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
.mdscroll-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}
.mdscroll-shell-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-mute);
  margin-bottom: 32px;
}
.mdscroll-brand {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--fg-mute);
  font-size: 14px;
  flex-shrink: 0;
}
.mdscroll-source {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--fg-mute);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  /* Truncation happens in source.ts (displaySourceLabel) so the end of
     the path — typically the filename — is always visible. No
     text-overflow: ellipsis here: the server already inserts a leading
     horizontal ellipsis character when needed. */
}
.mdscroll-status {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--status-idle);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mdscroll-status::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.mdscroll-status[data-state="live"] { color: var(--status-live); }
.mdscroll-main {
  padding-bottom: 96px;
}
.markdown-body { font-size: 16px; line-height: 1.6; word-wrap: break-word; }
.markdown-body > *:first-child { margin-top: 0; }
.markdown-body > *:last-child { margin-bottom: 0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  font-weight: 600;
  line-height: 1.25;
  margin-top: 24px;
  margin-bottom: 16px;
}
.markdown-body h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--border-mute); }
.markdown-body h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--border-mute); }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: .875em; }
.markdown-body h6 { font-size: .85em; color: var(--fg-mute); }
.markdown-body p { margin: 0 0 16px; }
.markdown-body a { color: var(--accent); text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body ul, .markdown-body ol { margin: 0 0 16px; padding-left: 2em; }
.markdown-body li + li { margin-top: .25em; }
.markdown-body blockquote {
  margin: 0 0 16px;
  padding: 0 1em;
  color: var(--fg-mute);
  border-left: .25em solid var(--border);
}
.markdown-body code {
  padding: .2em .4em;
  margin: 0;
  font-size: 85%;
  background: var(--bg-raised);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background: var(--bg-raised);
  border-radius: 6px;
  margin: 0 0 16px;
}
.markdown-body pre > code { padding: 0; background: transparent; font-size: 100%; }
.markdown-body pre .shiki {
  background: transparent !important;
  padding: 0;
  margin: 0;
}
.markdown-body table {
  border-collapse: collapse;
  margin: 0 0 16px;
  display: block;
  overflow: auto;
  max-width: 100%;
}
.markdown-body table th, .markdown-body table td {
  padding: 6px 13px;
  border: 1px solid var(--border);
}
.markdown-body table tr:nth-child(2n) { background: var(--bg-raised); }
.markdown-body hr {
  border: 0;
  height: 1px;
  background: var(--border-mute);
  margin: 24px 0;
}
.markdown-body img { max-width: 100%; }
.markdown-body del, .markdown-body s { color: var(--fg-mute); }
/* Task lists */
.markdown-body .contains-task-list { list-style: none; padding-left: 0; }
.markdown-body .task-list-item input[type="checkbox"] {
  margin-right: .5em;
  vertical-align: middle;
  accent-color: var(--accent);
}
.markdown-body .task-list-item .contains-task-list { padding-left: 1.5em; margin-top: .25em; }
/* GFM Alerts */
.markdown-body .markdown-alert {
  padding: .5rem 1rem;
  margin: 0 0 16px;
  border-left: .25em solid var(--border);
  color: inherit;
}
.markdown-body .markdown-alert > :first-child { margin-top: 0; }
.markdown-body .markdown-alert > :last-child { margin-bottom: 0; }
.markdown-body .markdown-alert-title {
  display: flex;
  font-weight: 600;
  align-items: center;
  line-height: 1;
  margin-bottom: 8px;
}
.markdown-body .markdown-alert-title .octicon {
  margin-right: .5rem;
  fill: currentColor;
  overflow: visible;
  vertical-align: text-bottom;
}
.markdown-body .markdown-alert-note { border-left-color: var(--color-note); }
.markdown-body .markdown-alert-note .markdown-alert-title { color: var(--color-note); }
.markdown-body .markdown-alert-tip { border-left-color: var(--color-tip); }
.markdown-body .markdown-alert-tip .markdown-alert-title { color: var(--color-tip); }
.markdown-body .markdown-alert-warning { border-left-color: var(--color-warning); }
.markdown-body .markdown-alert-warning .markdown-alert-title { color: var(--color-warning); }
.markdown-body .markdown-alert-caution { border-left-color: var(--color-caution); }
.markdown-body .markdown-alert-caution .markdown-alert-title { color: var(--color-caution); }
.markdown-body .markdown-alert-important { border-left-color: var(--color-important); }
.markdown-body .markdown-alert-important .markdown-alert-title { color: var(--color-important); }
/* Mermaid */
.markdown-body pre.mermaid {
  background: transparent;
  padding: 16px;
  text-align: center;
  margin: 0 0 16px;
  border: 1px solid var(--border-mute);
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body pre.mermaid[data-mermaid-state="error"] {
  text-align: left;
  color: var(--color-caution);
}
/* Shiki dark theme via CSS var */
@media (prefers-color-scheme: dark) {
  .shiki,
  .shiki span {
    color: var(--shiki-dark) !important;
    background-color: var(--shiki-dark-bg) !important;
    font-style: var(--shiki-dark-font-style) !important;
    font-weight: var(--shiki-dark-font-weight) !important;
    text-decoration: var(--shiki-dark-text-decoration) !important;
  }
}
`;

export const CLIENT_JS = `const statusEl = document.getElementById('mdscroll-status');
const sourceEl = document.getElementById('mdscroll-source');
const contentEl = document.getElementById('mdscroll-content');

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.esm.min.mjs';
let mermaidPromise = null;
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_CDN).then((mod) => {
      const mermaid = mod.default;
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
      return mermaid;
    });
  }
  return mermaidPromise;
};

const renderMermaid = async (root) => {
  const blocks = root.querySelectorAll('pre.mermaid:not([data-mermaid-state])');
  if (blocks.length === 0) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    console.warn('mdscroll: failed to load mermaid', err);
    return;
  }
  for (const block of blocks) {
    const source = block.textContent || '';
    const id = 'mdscroll-mermaid-' + Math.random().toString(36).slice(2);
    try {
      const { svg } = await mermaid.render(id, source);
      block.innerHTML = svg;
      block.dataset.mermaidState = 'done';
    } catch (err) {
      block.dataset.mermaidState = 'error';
      block.textContent = String(err && err.message ? err.message : err);
    }
  }
};

const setStatus = (state, text) => {
  if (!statusEl) return;
  statusEl.dataset.state = state;
  statusEl.textContent = text;
};

// Tail-follow: when the viewport is already near the bottom before an
// update, snap back to the bottom after swapping content. This mirrors
// \`tail -f\`: if the user is reading the latest content, stay with it;
// if they've scrolled up to read earlier sections, leave them alone.
// Threshold is intentionally generous (200px) because users often stop
// reading a few lines above the real bottom.
const BOTTOM_STICK_THRESHOLD = 200;
const isNearBottom = () => {
  const doc = document.documentElement;
  return window.innerHeight + window.scrollY >= doc.scrollHeight - BOTTOM_STICK_THRESHOLD;
};
const scrollToBottom = () => {
  window.scrollTo({ top: document.documentElement.scrollHeight });
};

const setContent = (html) => {
  if (!contentEl) return;
  const shouldStick = isNearBottom();
  contentEl.innerHTML = html;
  if (shouldStick) scrollToBottom();
  void (async () => {
    await renderMermaid(contentEl);
    // Mermaid loads asynchronously from the CDN; once its SVGs land the
    // document grows, so re-snap if we were sticking to the bottom.
    if (shouldStick) scrollToBottom();
  })();
};

const setSource = (source) => {
  if (!sourceEl || typeof source !== 'string') return;
  sourceEl.textContent = source;
  sourceEl.title = source;
};

if (contentEl) void renderMermaid(contentEl);

const stream = new EventSource('/events');
stream.addEventListener('open', () => setStatus('live', 'live'));
stream.addEventListener('error', () => setStatus('idle', 'reconnecting'));
stream.addEventListener('update', (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (typeof payload.html === 'string') setContent(payload.html);
    setSource(payload.source);
  } catch (err) {
    console.warn('mdscroll: bad update payload', err);
  }
});
`;
