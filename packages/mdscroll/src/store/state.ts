export type DocKind = 'file' | 'static';

/** Internal doc shape. Never returned from the Store — see DocPublic. */
type Doc = {
  key: string;
  label: string;
  kind: DocKind;
  path?: string;
  watched: boolean;
  stale: boolean;
  markdown: string;
  html: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Public view of a Doc. Declared via explicit copy (rather than aliasing
 * `Doc`) so future private fields cannot accidentally leak to SSE, HTTP
 * responses, or external callers — they must be picked in explicitly.
 */
export type DocPublic = Pick<
  Doc,
  | 'key'
  | 'label'
  | 'kind'
  | 'path'
  | 'watched'
  | 'stale'
  | 'markdown'
  | 'html'
  | 'createdAt'
  | 'updatedAt'
>;

const toPublic = (doc: Doc): DocPublic => ({
  key: doc.key,
  label: doc.label,
  kind: doc.kind,
  path: doc.path,
  watched: doc.watched,
  stale: doc.stale,
  markdown: doc.markdown,
  html: doc.html,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type StoreEvent =
  | { kind: 'added'; doc: DocPublic }
  | { kind: 'updated'; doc: DocPublic }
  | { kind: 'removed'; key: string };

export type Listener = (event: StoreEvent) => void;

export type UpsertInput = {
  key: string;
  label: string;
  kind: DocKind;
  path?: string | undefined;
  watched: boolean;
  stale: boolean;
  markdown: string;
  html: string;
};

export type UpdatePatch = Partial<Pick<Doc, 'label' | 'markdown' | 'html' | 'stale' | 'watched'>>;

/**
 * The multi-doc store. Identity is the caller-provided key (realpath for
 * file docs, a name for stdin docs) — there are no random ids, no
 * tokens, and no owners. Same-key writes replace; that is the intended
 * upsert semantics, not an accident to be refereed.
 */
export class Store {
  private docs = new Map<string, Doc>();
  private listeners = new Set<Listener>();

  list(): DocPublic[] {
    return Array.from(this.docs.values(), toPublic);
  }

  get(key: string): DocPublic | null {
    const doc = this.docs.get(key);
    return doc ? toPublic(doc) : null;
  }

  size(): number {
    return this.docs.size;
  }

  /** Create-or-replace by key. Emits `added` on create, `updated` on replace. */
  upsert(input: UpsertInput): { doc: DocPublic; created: boolean } {
    const existing = this.docs.get(input.key);
    const now = Date.now();
    const doc: Doc = {
      key: input.key,
      label: input.label,
      kind: input.kind,
      ...(input.path !== undefined ? { path: input.path } : {}),
      watched: input.watched,
      stale: input.stale,
      markdown: input.markdown,
      html: input.html,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.docs.set(input.key, doc);
    const pub = toPublic(doc);
    this.emit(existing ? { kind: 'updated', doc: pub } : { kind: 'added', doc: pub });
    return { doc: pub, created: !existing };
  }

  /**
   * Patch an existing doc. Returns null (and emits nothing) when the key
   * is absent — this is the write path for internal watcher updates, and
   * it must never create: only an external PUT may resurrect a doc the
   * user closed.
   */
  updateIfPresent(key: string, patch: UpdatePatch): DocPublic | null {
    const current = this.docs.get(key);
    if (!current) return null;
    const next: Doc = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.docs.set(key, next);
    const pub = toPublic(next);
    this.emit({ kind: 'updated', doc: pub });
    return pub;
  }

  remove(key: string): boolean {
    if (!this.docs.has(key)) return false;
    this.docs.delete(key);
    this.emit({ kind: 'removed', key });
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
