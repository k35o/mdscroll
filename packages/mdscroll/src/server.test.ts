import { beforeAll, describe, expect, it } from 'vitest';
import { warmup } from './render.js';
import { createApp } from './server.js';
import { Store } from './state.js';

beforeAll(async () => {
  await warmup();
}, 30_000);

describe('createApp', () => {
  describe('GET /', () => {
    it('HTML ドキュメントを返す', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
    });

    it('コンテンツが空ならプレースホルダを表示する', async () => {
      const app = createApp(new Store());
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('No content yet');
    });

    it('Store に入った markdown をレンダリングして埋め込む', async () => {
      const store = new Store();
      store.set('# Hello 世界');
      const app = createApp(store);
      const res = await app.request('/');
      const body = await res.text();
      expect(body).toContain('<h1>Hello 世界</h1>');
    });

    it('スタイルシートへのリンクを含む', async () => {
      const app = createApp(new Store());
      const body = await (await app.request('/')).text();
      expect(body).toContain('href="/style.css"');
    });
  });

  describe('GET /style.css', () => {
    it('CSS を text/css で返す', async () => {
      const app = createApp(new Store());
      const res = await app.request('/style.css');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/css/);
    });
  });

  describe('GET /main.js', () => {
    it('JS を application/javascript で返す', async () => {
      const app = createApp(new Store());
      const res = await app.request('/main.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/javascript/);
    });

    it('SSE クライアントコードを含む', async () => {
      const app = createApp(new Store());
      const body = await (await app.request('/main.js')).text();
      expect(body).toContain("new EventSource('/events')");
    });
  });

  describe('POST /push', () => {
    it('body の内容で Store を更新する', async () => {
      const store = new Store();
      const app = createApp(store);
      await app.request('/push', {
        method: 'POST',
        body: '# Pushed',
      });
      expect(store.get().markdown).toBe('# Pushed');
    });

    it('更新後の version を返す', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', { method: 'POST', body: 'a' });
      const json = (await res.json()) as { ok: boolean; version: number };
      expect(json).toEqual({ ok: true, version: 1 });
    });

    it('複数回の push で version が進む', async () => {
      const store = new Store();
      const app = createApp(store);
      await app.request('/push', { method: 'POST', body: 'a' });
      await app.request('/push', { method: 'POST', body: 'b' });
      const res = await app.request('/push', { method: 'POST', body: 'c' });
      const json = (await res.json()) as { ok: boolean; version: number };
      expect(json.version).toBe(3);
    });

    it('空 body も受け付ける', async () => {
      const store = new Store();
      const app = createApp(store);
      const res = await app.request('/push', { method: 'POST', body: '' });
      expect(res.status).toBe(200);
      expect(store.get().markdown).toBe('');
    });
  });

  describe('未定義ルート', () => {
    it('GET /unknown は 404 を返す', async () => {
      const app = createApp(new Store());
      const res = await app.request('/unknown');
      expect(res.status).toBe(404);
    });
  });
});
