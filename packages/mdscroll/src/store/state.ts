export type Snapshot = {
  markdown: string;
  source: string;
  createdAt: number;
};

export type Listener = (snapshot: Snapshot | null) => void;

export class Store {
  private snapshot: Snapshot | null = null;
  private listeners = new Set<Listener>();

  current(): Snapshot | null {
    return this.snapshot;
  }

  setCurrent(markdown: string, source: string): Snapshot {
    const next: Snapshot = { markdown, source, createdAt: Date.now() };
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(next);
    }
    return next;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
