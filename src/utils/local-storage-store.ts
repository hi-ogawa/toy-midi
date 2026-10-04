import { useSyncExternalStore, type SetStateAction } from "react";
import type { z } from "zod";
import { createStore } from "./store";

/** A store kept in one localStorage entry, read once and written on each update. */
export class LocalStorageStore<State extends object> {
  readonly store;
  private readonly key: string;

  constructor({
    key,
    schema,
    defaults,
  }: {
    key: string;
    schema: z.ZodType<State>;
    defaults: State;
  }) {
    this.key = key;
    // All consumers share one snapshot, including when browser storage is
    // unavailable. Defaults fill keys added by a later build.
    this.store = createStore<State>(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
        return schema.parse({ ...defaults, ...stored });
      } catch {
        return defaults;
      }
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

  /** Like useState, for one value of the store, which stores each change. */
  useValue<Key extends keyof State>(
    key: Key,
  ): readonly [State[Key], (next: SetStateAction<State[Key]>) => void] {
    const value = useSyncExternalStore(
      this.store.subscribe,
      () => this.store.get()[key],
    );
    const setValue = (next: SetStateAction<State[Key]>) => {
      const update: Partial<State> = {};
      update[key] =
        typeof next === "function"
          ? (next as (value: State[Key]) => State[Key])(this.store.get()[key])
          : next;
      this.update(update);
    };
    return [value, setValue];
  }
}
