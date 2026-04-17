export const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>mdscroll</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div class="mdscroll-shell">
      <header class="mdscroll-header">
        <span class="mdscroll-brand">mdscroll</span>
        <div class="mdscroll-actions">
          <button id="mdscroll-live" class="mdscroll-live" hidden>Back to live</button>
          <button
            class="mdscroll-icon-button"
            type="button"
            command="toggle-popover"
            commandfor="mdscroll-history-drawer"
            aria-label="Toggle history"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="12" height="10" rx="1.5"/>
              <line x1="6" y1="3" x2="6" y2="13"/>
            </svg>
          </button>
          <span class="mdscroll-status" id="mdscroll-status" data-state="idle">idle</span>
        </div>
      </header>
      <main class="mdscroll-main">
        <article id="mdscroll-content" class="markdown-body">{{CONTENT}}</article>
      </main>
    </div>
    <aside
      id="mdscroll-history-drawer"
      class="mdscroll-drawer"
      popover
      aria-label="History"
    >
      <header class="mdscroll-drawer-header">
        <span class="mdscroll-drawer-title">History</span>
        <button
          class="mdscroll-icon-button"
          type="button"
          command="hide-popover"
          commandfor="mdscroll-history-drawer"
          aria-label="Close history"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/>
            <line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>
          </svg>
        </button>
      </header>
      <ul id="mdscroll-history" class="mdscroll-history">
        <li class="mdscroll-history-empty">No pushes yet</li>
      </ul>
    </aside>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`;

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
.mdscroll-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  border-bottom: 1px solid var(--border-mute);
  margin-bottom: 32px;
}
.mdscroll-brand {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--fg-mute);
  font-size: 14px;
}
.mdscroll-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mdscroll-live {
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.mdscroll-live:hover {
  background: var(--bg-raised);
  border-color: var(--accent);
}
.mdscroll-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px;
  color: var(--fg-mute);
  cursor: pointer;
  line-height: 0;
  transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
}
.mdscroll-icon-button:hover {
  color: var(--fg);
  background: var(--bg-raised);
}
.mdscroll-icon-button[aria-pressed="false"] { color: var(--fg-mute); }
.mdscroll-icon-button[aria-pressed="true"] { color: var(--fg); }
.mdscroll-status {
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
.mdscroll-drawer {
  margin: 0;
  margin-left: auto;
  inset: 0 0 0 auto;
  width: min(320px, 86vw);
  height: 100vh;
  max-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  border: none;
  border-left: 1px solid var(--border-mute);
  box-shadow: -24px 0 48px -24px rgba(0, 0, 0, 0.35);
  padding: 16px 20px 20px;
  overflow-y: auto;
  font-size: 13px;
  transform: translateX(100%);
  transition:
    transform 200ms cubic-bezier(0.2, 0, 0, 1),
    overlay 200ms allow-discrete,
    display 200ms allow-discrete;
}
.mdscroll-drawer:popover-open { transform: translateX(0); }
@starting-style {
  .mdscroll-drawer:popover-open { transform: translateX(100%); }
}
.mdscroll-drawer::backdrop {
  background: rgba(0, 0, 0, 0);
  transition: background-color 200ms ease;
}
.mdscroll-drawer:popover-open::backdrop { background: rgba(0, 0, 0, 0.25); }
.mdscroll-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-mute);
}
.mdscroll-drawer-title {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fg-mute);
  font-weight: 600;
  font-size: 11px;
}
.mdscroll-history {
  list-style: none;
  padding: 0;
  margin: 0;
}
.mdscroll-history-empty {
  color: var(--fg-mute);
  font-style: italic;
  padding: 6px 0;
  font-size: 13px;
}
.mdscroll-history-item {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 5px 0;
  cursor: pointer;
  color: var(--fg-mute);
  transition: color 100ms ease;
}
.mdscroll-history-item:hover { color: var(--fg); }
.mdscroll-history-item.is-current { color: var(--fg); }
.mdscroll-history-time {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
  font-feature-settings: "tnum";
  letter-spacing: 0.02em;
  color: var(--fg-mute);
}
.mdscroll-history-item.is-current .mdscroll-history-time { color: var(--accent); }
.mdscroll-history-source {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
const contentEl = document.getElementById('mdscroll-content');
const historyEl = document.getElementById('mdscroll-history');
const liveBtn = document.getElementById('mdscroll-live');

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

const formatTime = (ms) => {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
};

let viewingId = null;
let currentId = null;
let lastLiveHtml = null;
let lastHistory = [];

const setContent = (html) => {
  if (!contentEl) return;
  contentEl.innerHTML = html;
  void renderMermaid(contentEl);
};

const renderSidebar = () => {
  if (!historyEl) return;
  if (lastHistory.length === 0) {
    historyEl.innerHTML = '<li class="mdscroll-history-empty">No pushes yet</li>';
    return;
  }
  historyEl.innerHTML = '';
  for (const snap of lastHistory) {
    const li = document.createElement('li');
    li.className = 'mdscroll-history-item';
    li.dataset.id = snap.id;
    const isCurrent =
      (viewingId === null && snap.id === currentId) || snap.id === viewingId;
    if (isCurrent) li.classList.add('is-current');
    const time = document.createElement('span');
    time.className = 'mdscroll-history-time';
    time.textContent = formatTime(snap.createdAt);
    const source = document.createElement('span');
    source.className = 'mdscroll-history-source';
    source.textContent = snap.source;
    source.title = snap.source;
    li.appendChild(time);
    li.appendChild(source);
    li.addEventListener('click', () => viewSnapshot(snap.id));
    historyEl.appendChild(li);
  }
};

const updateLiveButton = () => {
  if (!liveBtn) return;
  liveBtn.hidden = viewingId === null || viewingId === currentId;
};

const viewSnapshot = async (id) => {
  try {
    const r = await fetch('/api/snapshot/' + encodeURIComponent(id));
    if (!r.ok) return;
    const data = await r.json();
    if (typeof data.html !== 'string') return;
    viewingId = id;
    setContent(data.html);
    renderSidebar();
    updateLiveButton();
  } catch (err) {
    console.warn('mdscroll: snapshot fetch failed', err);
  }
};

const goLive = () => {
  viewingId = null;
  if (lastLiveHtml !== null) setContent(lastLiveHtml);
  renderSidebar();
  updateLiveButton();
};

if (liveBtn) liveBtn.addEventListener('click', goLive);

if (contentEl) void renderMermaid(contentEl);

const source = new EventSource('/events');
source.addEventListener('open', () => setStatus('live', 'live'));
source.addEventListener('error', () => setStatus('idle', 'reconnecting'));
source.addEventListener('update', (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (typeof payload.html === 'string') lastLiveHtml = payload.html;
    if (Array.isArray(payload.history)) lastHistory = payload.history;
    currentId = payload.current && payload.current.id ? payload.current.id : null;

    if (viewingId === null && lastLiveHtml !== null) {
      setContent(lastLiveHtml);
    }
    renderSidebar();
    updateLiveButton();
  } catch (err) {
    console.warn('mdscroll: bad update payload', err);
  }
});
`;
