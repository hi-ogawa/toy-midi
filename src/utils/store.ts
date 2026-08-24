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

export function shallowEqual(left: object, right: object): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
  );
}
