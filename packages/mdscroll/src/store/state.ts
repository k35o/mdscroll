import { randomUUID } from 'node:crypto';

export type Snapshot = {
  id: string;
  markdown: string;
  source: string;
  createdAt: number;
};

export type SnapshotMeta = Omit<Snapshot, 'markdown'>;

export type Listener = (snapshot: Snapshot) => void;

export const MAX_HISTORY = 20;

export const toMeta = (snapshot: Snapshot): SnapshotMeta => ({
  id: snapshot.id,
  source: snapshot.source,
  createdAt: snapshot.createdAt,
});

export class Store {
  private snapshots: Snapshot[] = [];
  private listeners = new Set<Listener>();

  current(): Snapshot | null {
    return this.snapshots[0] ?? null;
  }

  history(): Snapshot[] {
    return this.snapshots.slice();
  }

  byId(id: string): Snapshot | null {
    return this.snapshots.find((s) => s.id === id) ?? null;
  }

  push(markdown: string, source: string): Snapshot {
    const snapshot: Snapshot = {
      id: randomUUID(),
      markdown,
      source,
      createdAt: Date.now(),
    };
    this.snapshots = [snapshot, ...this.snapshots].slice(0, MAX_HISTORY);
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
