import { beforeAll, describe, expect, it } from 'vitest';
import { render, warmup } from './render.js';

beforeAll(async () => {
  await warmup();
}, 30_000);

describe('render', () => {
  describe('見出し', () => {
    it('# から <h1> を生成する', async () => {
      const html = await render('# Title');
      expect(html).toContain('<h1>Title</h1>');
    });

    it('## から <h2> を生成する', async () => {
      const html = await render('## Sub');
      expect(html).toContain('<h2>Sub</h2>');
    });

    it('###### まで対応する', async () => {
      const html = await render('###### Six');
      expect(html).toContain('<h6>Six</h6>');
    });

    it('####### は <h6> 相当にはならず段落になる', async () => {
      const html = await render('####### Too many');
      expect(html).toContain('<p>####### Too many</p>');
    });
  });

  describe('インライン修飾', () => {
    it('**bold** を <strong> にする', async () => {
      const html = await render('**太字**');
      expect(html).toContain('<strong>太字</strong>');
    });

    it('*italic* を <em> にする', async () => {
      const html = await render('*斜体*');
      expect(html).toContain('<em>斜体</em>');
    });

    it('~~strike~~ を <s> にする', async () => {
      const html = await render('~~消す~~');
      expect(html).toContain('<s>消す</s>');
    });

    it('`code` を <code> にする', async () => {
      const html = await render('`inline`');
      expect(html).toContain('<code>inline</code>');
    });
  });

  describe('リンク / 画像', () => {
    it('[text](url) を <a> にする', async () => {
      const html = await render('[Sharp](https://sharp.example)');
      expect(html).toContain('<a href="https://sharp.example">Sharp</a>');
    });

    it('linkify で裸 URL も <a> になる', async () => {
      const html = await render('Visit https://example.com now');
      expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });

    it('![alt](src) を <img> にする', async () => {
      const html = await render('![logo](/a.png)');
      expect(html).toContain('<img src="/a.png" alt="logo">');
    });
  });

  describe('リスト', () => {
    it('- で <ul><li> を作る', async () => {
      const html = await render('- one\n- two');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>one</li>');
    });

    it('1. で <ol><li> を作る', async () => {
      const html = await render('1. a\n2. b');
      expect(html).toContain('<ol>');
    });

    describe('タスクリスト', () => {
      it('[x] はチェック済みの checkbox になる', async () => {
        const html = await render('- [x] done');
        expect(html).toMatch(/<input[^>]*checked[^>]*>/);
      });

      it('[ ] は未チェックの checkbox になる', async () => {
        const html = await render('- [ ] todo');
        expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
        expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
      });

      it('<ul> に contains-task-list クラスが付く', async () => {
        const html = await render('- [x] a');
        expect(html).toContain('contains-task-list');
      });

      it('<li> に task-list-item クラスが付く', async () => {
        const html = await render('- [x] a');
        expect(html).toContain('task-list-item');
      });
    });
  });

  describe('テーブル', () => {
    const table = ['| 列A | 列B |', '|-----|-----|', '| v1  | v2  |'].join('\n');

    it('<table><thead><tbody> を生成する', async () => {
      const html = await render(table);
      expect(html).toContain('<table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
    });

    it('ヘッダーは <th> でラップされる', async () => {
      const html = await render(table);
      expect(html).toContain('<th>列A</th>');
    });

    it('本文は <td> でラップされる', async () => {
      const html = await render(table);
      expect(html).toContain('<td>v1</td>');
    });
  });

  describe('ブロック引用', () => {
    it('> から <blockquote> を作る', async () => {
      const html = await render('> 引用');
      expect(html).toContain('<blockquote>');
    });
  });

  describe('コードブロック', () => {
    it('フェンスで <pre> を作る', async () => {
      const html = await render('```\nraw\n```');
      expect(html).toContain('<pre');
    });

    it('言語指定ありは shiki でハイライトされる', async () => {
      const html = await render('```typescript\nconst x = 1;\n```');
      expect(html).toContain('class="shiki');
    });

    it('未知の言語は text としてハイライトされる', async () => {
      const html = await render('```unknown-lang\nraw\n```');
      expect(html).toContain('class="shiki');
    });

    it('mermaid ブロックは pre.mermaid として出力される', async () => {
      const html = await render('```mermaid\nflowchart LR\nA-->B\n```');
      expect(html).toContain('<pre class="mermaid">');
    });

    it('mermaid ブロックの中身はエスケープされる', async () => {
      const html = await render('```mermaid\nA[<evil>]-->B\n```');
      expect(html).toContain('&lt;evil&gt;');
      expect(html).not.toContain('<evil>');
    });

    it('mermaid ブロックには shiki の <code> は付かない', async () => {
      const html = await render('```mermaid\nflowchart\n```');
      expect(html).not.toContain('class="shiki');
    });
  });

  describe('GFM Alert', () => {
    it('[!NOTE] は markdown-alert-note を付ける', async () => {
      const html = await render('> [!NOTE]\n> memo');
      expect(html).toContain('markdown-alert-note');
    });

    it('[!TIP] は markdown-alert-tip を付ける', async () => {
      const html = await render('> [!TIP]\n> hint');
      expect(html).toContain('markdown-alert-tip');
    });

    it('[!WARNING] は markdown-alert-warning を付ける', async () => {
      const html = await render('> [!WARNING]\n> careful');
      expect(html).toContain('markdown-alert-warning');
    });

    it('[!IMPORTANT] は markdown-alert-important を付ける', async () => {
      const html = await render('> [!IMPORTANT]\n> read me');
      expect(html).toContain('markdown-alert-important');
    });

    it('[!CAUTION] は markdown-alert-caution を付ける', async () => {
      const html = await render('> [!CAUTION]\n> danger');
      expect(html).toContain('markdown-alert-caution');
    });

    it('対応外のマーカーは通常の blockquote になる', async () => {
      const html = await render('> [!UNKNOWN]\n> body');
      expect(html).not.toContain('markdown-alert');
      expect(html).toContain('<blockquote>');
    });
  });

  describe('水平線', () => {
    it('--- は <hr> になる', async () => {
      const html = await render('---');
      expect(html).toContain('<hr>');
    });
  });

  describe('安全性', () => {
    it('html: false なので <script> は素通しされず段落になる', async () => {
      const html = await render('<script>alert(1)</script>');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('javascript: スキームのリンクは拒否される', async () => {
      const html = await render('[click](javascript:alert(1))');
      expect(html).not.toContain('href="javascript:');
    });
  });

  describe('境界値', () => {
    it('空文字列は空文字列を返す', async () => {
      expect(await render('')).toBe('');
    });

    it('改行のみは空文字列を返す', async () => {
      expect(await render('\n\n')).toBe('');
    });

    it('プレーンテキストは <p> で囲まれる', async () => {
      const html = await render('hello');
      expect(html).toBe('<p>hello</p>\n');
    });
  });
});
