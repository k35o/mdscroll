import { randomBytes, randomUUID } from 'node:crypto';

/** Internal doc shape. Never returned from the Store — see DocPublic. */
type Doc = {
  id: string;
  source: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  ownerPid?: number;
  /** Stable per-client identifier for POST idempotency. Never exposed. */
  instanceId?: string;
};

/**
 * Public view of a Doc. Declared via `Pick` (rather than aliasing `Doc`)
 * so future private fields on `Doc` cannot accidentally leak to SSE,
 * HTTP responses, or external callers — they must be picked in
 * explicitly.
 */
export type DocPublic = Pick<
  Doc,
  'id' | 'source' | 'markdown' | 'createdAt' | 'updatedAt' | 'ownerPid'
>;

const toPublic = (doc: Doc): DocPublic => ({
  id: doc.id,
  source: doc.source,
  markdown: doc.markdown,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  ownerPid: doc.ownerPid,
});

export type StoreEvent =
  | { kind: 'added'; doc: DocPublic }
  | { kind: 'updated'; doc: DocPublic }
  | { kind: 'removed'; id: string };

export type Listener = (event: StoreEvent) => void;

export type AddInput = {
  source: string;
  markdown: string;
  ownerPid?: number;
  /**
   * Idempotency key. If the store already has a doc with this
   * instanceId, the existing doc is upserted (source/markdown
   * updated, same id, fresh token) instead of creating a new one.
   */
  instanceId?: string;
};

export type UpdateInput = Partial<Pick<Doc, 'source' | 'markdown'>>;

export class Store {
  private docs = new Map<string, Doc>();
  private tokens = new Map<string, string>();
  private byInstance = new Map<string, string>();
  private listeners = new Set<Listener>();

  list(): DocPublic[] {
    return Array.from(this.docs.values(), toPublic);
  }

  get(id: string): DocPublic | null {
    const doc = this.docs.get(id);
    return doc ? toPublic(doc) : null;
  }

  /** True when the supplied token matches the one minted for `id`. */
  authorize(id: string, token: string): boolean {
    const real = this.tokens.get(id);
    return real !== undefined && real === token;
  }

  /** Number of docs in the store — used to enforce admission caps. */
  size(): number {
    return this.docs.size;
  }

  /** True when an instanceId is already registered. */
  hasInstance(instanceId: string): boolean {
    return this.byInstance.has(instanceId);
  }

  /** Number of docs currently owned by `pid`. */
  countByOwnerPid(pid: number): number {
    let n = 0;
    for (const doc of this.docs.values()) {
      if (doc.ownerPid === pid) n += 1;
    }
    return n;
  }

  add(input: AddInput): { doc: DocPublic; token: string } {
    // Idempotent path: a repeat POST from the same client instance
    // refreshes the existing doc in place. This covers timeouts /
    // network hiccups where the client never saw the first POST's
    // response — without it, the client would retry and leak a
    // duplicate doc on every such transient failure.
    if (input.instanceId) {
      const existingId = this.byInstance.get(input.instanceId);
      if (existingId) {
        const existing = this.docs.get(existingId);
        if (existing) {
          const now = Date.now();
          const next: Doc = {
            ...existing,
            source: input.source,
            markdown: input.markdown,
            ownerPid: input.ownerPid,
            updatedAt: now,
          };
          this.docs.set(existingId, next);
          const token = randomBytes(16).toString('hex');
          this.tokens.set(existingId, token);
          const pub = toPublic(next);
          // Emit as `updated` — listeners already know this doc.
          this.emit({ kind: 'updated', doc: pub });
          return { doc: pub, token };
        }
      }
    }

    const id = randomUUID();
    const token = randomBytes(16).toString('hex');
    const now = Date.now();
    const doc: Doc = {
      id,
      source: input.source,
      markdown: input.markdown,
      createdAt: now,
      updatedAt: now,
      ownerPid: input.ownerPid,
      instanceId: input.instanceId,
    };
    this.docs.set(id, doc);
    this.tokens.set(id, token);
    if (input.instanceId) this.byInstance.set(input.instanceId, id);
    const pub = toPublic(doc);
    this.emit({ kind: 'added', doc: pub });
    return { doc: pub, token };
  }

  update(id: string, input: UpdateInput): DocPublic | null {
    const current = this.docs.get(id);
    if (!current) return null;
    const next: Doc = {
      ...current,
      ...input,
      updatedAt: Date.now(),
    };
    this.docs.set(id, next);
    const pub = toPublic(next);
    this.emit({ kind: 'updated', doc: pub });
    return pub;
  }

  remove(id: string): boolean {
    const doc = this.docs.get(id);
    if (!doc) return false;
    this.docs.delete(id);
    this.tokens.delete(id);
    if (doc.instanceId) this.byInstance.delete(doc.instanceId);
    this.emit({ kind: 'removed', id });
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
