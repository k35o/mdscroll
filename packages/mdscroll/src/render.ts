import MarkdownIt from 'markdown-it';
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
