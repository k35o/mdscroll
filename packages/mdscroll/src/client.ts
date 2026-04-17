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
        <span class="mdscroll-status" id="mdscroll-status" data-state="idle">idle</span>
      </header>
      <main class="mdscroll-main">
        <article id="mdscroll-content" class="markdown-body">{{CONTENT}}</article>
      </main>
    </div>
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
  max-width: 960px;
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
  font-size: 13px;
  text-transform: uppercase;
}
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
.mdscroll-main { padding-bottom: 96px; }
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

const setStatus = (state, text) => {
  if (!statusEl) return;
  statusEl.dataset.state = state;
  statusEl.textContent = text;
};

const source = new EventSource('/events');
source.addEventListener('open', () => setStatus('live', 'live'));
source.addEventListener('error', () => setStatus('idle', 'reconnecting'));
source.addEventListener('update', (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (contentEl && typeof payload.html === 'string') {
      contentEl.innerHTML = payload.html;
    }
  } catch (err) {
    console.warn('mdscroll: bad update payload', err);
  }
});
`;
