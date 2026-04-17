import MarkdownIt from 'markdown-it';
import alertsPlugin from 'markdown-it-github-alerts';
import taskListsPlugin from 'markdown-it-task-lists';
import { createHighlighter, type Highlighter } from 'shiki';

const LANGS = [
  'bash',
  'css',
  'diff',
  'go',
  'html',
  'java',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'python',
  'ruby',
  'rust',
  'shell',
  'sql',
  'toml',
  'tsx',
  'typescript',
  'yaml',
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
};

const buildRenderer = (highlighter: Highlighter): MarkdownIt => {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: (code, lang) => {
      if (lang === 'mermaid') return '';
      const resolved = (lang || '').toLowerCase();
      const langSupported = (LANGS as readonly string[]).includes(resolved);
      try {
        return highlighter.codeToHtml(code, {
          lang: langSupported ? resolved : 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
      } catch {
        return '';
      }
    },
  });

  md.use(taskListsPlugin, { enabled: true });
  md.use(alertsPlugin);

  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token) return '';
    if (token.info.trim() === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md;
};

export const render = async (markdown: string): Promise<string> => {
  const highlighter = await getHighlighter();
  const md = buildRenderer(highlighter);
  return md.render(markdown);
};

export const warmup = async (): Promise<void> => {
  await getHighlighter();
};
