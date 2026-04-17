import { beforeAll, describe, expect, it } from 'vitest';
import { render, warmup } from './render.js';

beforeAll(async () => {
  await warmup();
}, 30_000);

describe('render', () => {
  describe('headings', () => {
    it('renders # as <h1>', async () => {
      const html = await render('# Title');
      expect(html).toContain('<h1>Title</h1>');
    });

    it('renders ## as <h2>', async () => {
      const html = await render('## Sub');
      expect(html).toContain('<h2>Sub</h2>');
    });

    it('supports up to ######', async () => {
      const html = await render('###### Six');
      expect(html).toContain('<h6>Six</h6>');
    });

    it('falls back to paragraph for more than 6 hashes', async () => {
      const html = await render('####### Too many');
      expect(html).toContain('<p>####### Too many</p>');
    });
  });

  describe('inline formatting', () => {
    it('wraps **text** in <strong>', async () => {
      const html = await render('**bold**');
      expect(html).toContain('<strong>bold</strong>');
    });

    it('wraps *text* in <em>', async () => {
      const html = await render('*italic*');
      expect(html).toContain('<em>italic</em>');
    });

    it('wraps ~~text~~ in <s>', async () => {
      const html = await render('~~strike~~');
      expect(html).toContain('<s>strike</s>');
    });

    it('wraps `code` in <code>', async () => {
      const html = await render('`inline`');
      expect(html).toContain('<code>inline</code>');
    });
  });

  describe('links and images', () => {
    it('renders [text](url) as <a>', async () => {
      const html = await render('[Sharp](https://sharp.example)');
      expect(html).toContain('<a href="https://sharp.example">Sharp</a>');
    });

    it('linkifies bare URLs', async () => {
      const html = await render('Visit https://example.com now');
      expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });

    it('renders ![alt](src) as <img>', async () => {
      const html = await render('![logo](/a.png)');
      expect(html).toContain('<img src="/a.png" alt="logo">');
    });
  });

  describe('lists', () => {
    it('renders - as <ul><li>', async () => {
      const html = await render('- one\n- two');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>one</li>');
    });

    it('renders 1. as <ol><li>', async () => {
      const html = await render('1. a\n2. b');
      expect(html).toContain('<ol>');
    });

    describe('task lists', () => {
      it('renders [x] as a checked checkbox', async () => {
        const html = await render('- [x] done');
        expect(html).toMatch(/<input[^>]*checked[^>]*>/);
      });

      it('renders [ ] as an unchecked checkbox', async () => {
        const html = await render('- [ ] todo');
        expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
        expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
      });

      it('adds contains-task-list to the <ul>', async () => {
        const html = await render('- [x] a');
        expect(html).toContain('contains-task-list');
      });

      it('adds task-list-item to the <li>', async () => {
        const html = await render('- [x] a');
        expect(html).toContain('task-list-item');
      });
    });
  });

  describe('tables', () => {
    const table = ['| Col A | Col B |', '|-------|-------|', '| v1    | v2    |'].join('\n');

    it('renders <table><thead><tbody>', async () => {
      const html = await render(table);
      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
    });

    it('wraps header cells in <th>', async () => {
      const html = await render(table);
      expect(html).toContain('<th>Col A</th>');
    });

    it('wraps body cells in <td>', async () => {
      const html = await render(table);
      expect(html).toContain('<td>v1</td>');
    });
  });

  describe('blockquote', () => {
    it('renders > as <blockquote>', async () => {
      const html = await render('> quoted');
      expect(html).toContain('<blockquote>');
    });
  });

  describe('code blocks', () => {
    it('renders a fence as <pre>', async () => {
      const html = await render('```\nraw\n```');
      expect(html).toContain('<pre');
    });

    it('highlights with shiki when a language is specified', async () => {
      const html = await render('```typescript\nconst x = 1;\n```');
      expect(html).toContain('class="shiki');
    });

    it('falls back to plain text highlighting for unknown languages', async () => {
      const html = await render('```unknown-lang\nraw\n```');
      expect(html).toContain('class="shiki');
    });

    it('emits <pre class="mermaid"> for mermaid blocks', async () => {
      const html = await render('```mermaid\nflowchart LR\nA-->B\n```');
      expect(html).toContain('<pre class="mermaid">');
    });

    it('escapes HTML inside mermaid blocks', async () => {
      const html = await render('```mermaid\nA[<evil>]-->B\n```');
      expect(html).toContain('&lt;evil&gt;');
      expect(html).not.toContain('<evil>');
    });

    it('does not apply shiki to mermaid blocks', async () => {
      const html = await render('```mermaid\nflowchart\n```');
      expect(html).not.toContain('class="shiki');
    });
  });

  describe('GFM alerts', () => {
    it('adds markdown-alert-note for [!NOTE]', async () => {
      const html = await render('> [!NOTE]\n> memo');
      expect(html).toContain('markdown-alert-note');
    });

    it('adds markdown-alert-tip for [!TIP]', async () => {
      const html = await render('> [!TIP]\n> hint');
      expect(html).toContain('markdown-alert-tip');
    });

    it('adds markdown-alert-warning for [!WARNING]', async () => {
      const html = await render('> [!WARNING]\n> careful');
      expect(html).toContain('markdown-alert-warning');
    });

    it('adds markdown-alert-important for [!IMPORTANT]', async () => {
      const html = await render('> [!IMPORTANT]\n> read me');
      expect(html).toContain('markdown-alert-important');
    });

    it('adds markdown-alert-caution for [!CAUTION]', async () => {
      const html = await render('> [!CAUTION]\n> danger');
      expect(html).toContain('markdown-alert-caution');
    });

    it('treats unknown markers as a plain blockquote', async () => {
      const html = await render('> [!UNKNOWN]\n> body');
      expect(html).not.toContain('markdown-alert');
      expect(html).toContain('<blockquote>');
    });
  });

  describe('horizontal rule', () => {
    it('renders --- as <hr>', async () => {
      const html = await render('---');
      expect(html).toContain('<hr>');
    });
  });

  describe('safety', () => {
    it('does not pass raw <script> through (html: false)', async () => {
      const html = await render('<script>alert(1)</script>');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('rejects javascript: URLs', async () => {
      const html = await render('[click](javascript:alert(1))');
      expect(html).not.toContain('href="javascript:');
    });
  });

  describe('boundaries', () => {
    it('returns an empty string for empty input', async () => {
      expect(await render('')).toBe('');
    });

    it('returns an empty string for whitespace-only input', async () => {
      expect(await render('\n\n')).toBe('');
    });

    it('wraps plain text in <p>', async () => {
      const html = await render('hello');
      expect(html).toBe('<p>hello</p>\n');
    });
  });
});
