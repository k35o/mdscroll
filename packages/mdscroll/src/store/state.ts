export type Snapshot = {
  markdown: string;
  version: number;
  updatedAt: number;
};

export type Listener = (snapshot: Snapshot) => void;

export class Store {
  private snapshot: Snapshot = {
    markdown: '',
    version: 0,
    updatedAt: Date.now(),
  };
  private listeners = new Set<Listener>();

  get(): Snapshot {
    return this.snapshot;
  }

  set(markdown: string): Snapshot {
    this.snapshot = {
      markdown,
      version: this.snapshot.version + 1,
      updatedAt: Date.now(),
    };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
