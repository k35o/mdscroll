import type { FC } from 'hono/jsx';

export const Document: FC = () => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>mdscroll</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <div class="mdscroll-shell">
        <header class="mdscroll-shell-header">
          <span class="mdscroll-brand">mdscroll</span>
          <nav
            class="mdscroll-tabs"
            id="mdscroll-tabs"
            role="tablist"
            aria-label="Open documents"
          />
          <span class="mdscroll-status" id="mdscroll-status" data-state="idle">
            idle
          </span>
        </header>
        <main class="mdscroll-main">
          <article id="mdscroll-content" class="markdown-body" aria-live="polite" />
          <p class="mdscroll-empty" id="mdscroll-empty" hidden>
            No documents yet. Run <code>mdscroll &lt;file&gt;</code> in another terminal to push one
            here.
          </p>
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
  padding: 20px 0 0;
  border-bottom: 1px solid var(--border-mute);
  margin-bottom: 32px;
}
.mdscroll-brand {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--fg-mute);
  font-size: 14px;
  flex-shrink: 0;
  padding-bottom: 20px;
}
.mdscroll-tabs {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  align-items: flex-end;
}
.mdscroll-tab {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 240px;
  padding: 8px 12px 10px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--fg-mute);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
}
.mdscroll-tab:hover { color: var(--fg); }
.mdscroll-tab[aria-selected="true"] {
  color: var(--fg);
  border-bottom-color: var(--accent);
}
.mdscroll-tab .mdscroll-tab-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
  background: var(--status-live);
  flex-shrink: 0;
}
.mdscroll-tab > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.mdscroll-status {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--status-idle);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 20px;
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
.mdscroll-empty {
  color: var(--fg-mute);
  font-size: 14px;
  padding: 24px 0;
}
.mdscroll-empty code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  background: var(--bg-raised);
  padding: 2px 6px;
  border-radius: 4px;
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
.markdown-body .contains-task-list { list-style: none; padding-left: 0; }
.markdown-body .task-list-item input[type="checkbox"] {
  margin-right: .5em;
  vertical-align: middle;
  accent-color: var(--accent);
}
.markdown-body .task-list-item .contains-task-list { padding-left: 1.5em; margin-top: .25em; }
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
const tabsEl = document.getElementById('mdscroll-tabs');
const contentEl = document.getElementById('mdscroll-content');
const emptyEl = document.getElementById('mdscroll-empty');

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
// update, snap back to the bottom after swapping content. Threshold is
// intentionally generous (200px) because users often stop reading a few
// lines above the real bottom.
const BOTTOM_STICK_THRESHOLD = 200;
const isNearBottom = () => {
  const doc = document.documentElement;
  return window.innerHeight + window.scrollY >= doc.scrollHeight - BOTTOM_STICK_THRESHOLD;
};
const scrollToBottom = () => {
  window.scrollTo({ top: document.documentElement.scrollHeight });
};

// ---- State ----
/** Map<id, { id, source, displaySource, html }> */
const docs = new Map();
let activeId = null;

const applyContent = (html, { stick }) => {
  if (!contentEl) return;
  const shouldStick = stick && isNearBottom();
  contentEl.innerHTML = html;
  if (shouldStick) scrollToBottom();
  void (async () => {
    await renderMermaid(contentEl);
    if (shouldStick) scrollToBottom();
  })();
};

const renderEmpty = () => {
  if (contentEl) contentEl.innerHTML = '';
  if (emptyEl) emptyEl.hidden = false;
};

const renderActive = ({ stick }) => {
  if (!activeId) {
    renderEmpty();
    return;
  }
  const doc = docs.get(activeId);
  if (!doc) {
    renderEmpty();
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  applyContent(doc.html, { stick });
};

const renderTabs = () => {
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const doc of docs.values()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'mdscroll-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', doc.id === activeId ? 'true' : 'false');
    tab.dataset.id = doc.id;
    tab.title = doc.source;
    // Dot indicates liveness; reserved for future per-tab state.
    const dot = document.createElement('span');
    dot.className = 'mdscroll-tab-dot';
    tab.appendChild(dot);
    const label = document.createElement('span');
    // Tabs get the basename only; the full path is on the tooltip.
    // displaySource may contain slashes (e.g. "docs/plan.md") or a
    // truncated path ("…ser/plan.md") — split on '/' either way.
    const parts = (doc.displaySource || doc.source || '').split('/');
    label.textContent = parts[parts.length - 1] || doc.displaySource;
    tab.appendChild(label);
    tab.addEventListener('click', () => {
      if (activeId === doc.id) return;
      activeId = doc.id;
      renderTabs();
      renderActive({ stick: false });
    });
    tabsEl.appendChild(tab);
  }
};

const upsertDoc = (doc) => {
  const existed = docs.has(doc.id);
  docs.set(doc.id, doc);
  if (!activeId) activeId = doc.id;
  renderTabs();
  if (doc.id === activeId) {
    // On update of the currently visible doc, preserve tail-follow.
    renderActive({ stick: existed });
  }
};

const removeDoc = (id) => {
  if (!docs.has(id)) return;
  docs.delete(id);
  if (activeId === id) {
    const next = docs.keys().next();
    activeId = next.done ? null : next.value;
  }
  renderTabs();
  renderActive({ stick: false });
};

const stream = new EventSource('/events');
stream.addEventListener('open', () => setStatus('live', 'live'));
stream.addEventListener('error', () => setStatus('idle', 'reconnecting'));
stream.addEventListener('init', (event) => {
  try {
    const payload = JSON.parse(event.data);
    docs.clear();
    activeId = null;
    for (const doc of payload.docs || []) {
      docs.set(doc.id, doc);
    }
    const first = docs.keys().next();
    activeId = first.done ? null : first.value;
    renderTabs();
    renderActive({ stick: false });
  } catch (err) {
    console.warn('mdscroll: bad init payload', err);
  }
});
stream.addEventListener('added', (event) => {
  try {
    const payload = JSON.parse(event.data);
    upsertDoc(payload.doc);
  } catch (err) {
    console.warn('mdscroll: bad added payload', err);
  }
});
stream.addEventListener('updated', (event) => {
  try {
    const payload = JSON.parse(event.data);
    upsertDoc(payload.doc);
  } catch (err) {
    console.warn('mdscroll: bad updated payload', err);
  }
});
stream.addEventListener('removed', (event) => {
  try {
    const payload = JSON.parse(event.data);
    removeDoc(payload.id);
  } catch (err) {
    console.warn('mdscroll: bad removed payload', err);
  }
});
`;
