export function createStore<State>(initialize: (get: () => State) => State) {
  let state: State;
  const listeners = new Set<() => void>();

  const get = (): State => state;
  state = initialize(get);

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const subscribeWithSelector = <Selection>({
    selector,
    listener,
    equals,
  }: {
    selector: (state: State) => Selection;
    listener: () => void;
    equals: (left: Selection, right: Selection) => boolean;
  }): (() => void) => {
    let selection = selector(state);
    const storeListener = () => {
      const nextSelection = selector(state);
      if (equals(selection, nextSelection)) {
        return;
      }
      selection = nextSelection;
      listener();
    };
    listeners.add(storeListener);
    return () => listeners.delete(storeListener);
  };

  const update = (update: Partial<State>): void => {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  };

  return { get, subscribe, subscribeWithSelector, update };
}

export function shallowEqual<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left) as (keyof T)[];
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}
