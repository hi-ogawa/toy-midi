import { createStore } from "./store";

/** A store kept in one localStorage entry, read once and written on each update. */
export class LocalStorageStore<State extends object> {
  readonly store;
  private readonly key: string;

  /** `parse` turns the stored value, or undefined when there is none, into the state. */
  constructor({
    key,
    parse,
  }: {
    key: string;
    parse: (stored: unknown) => State;
  }) {
    this.key = key;
    // All consumers share one snapshot, including when browser storage is
    // unavailable.
    this.store = createStore<State>(() => {
      let stored: unknown;
      try {
        const json = localStorage.getItem(key);
        stored = json === null ? undefined : JSON.parse(json);
      } catch {}
      return parse(stored);
    });
  }

  update(update: Partial<State>): void {
    this.store.update(update);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.store.get()));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  }
}
