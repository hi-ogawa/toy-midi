export function createStore<State>(initialize: (get: () => State) => State) {
  let state: State;
  const listeners = new Set<() => void>();

  const get = (): State => state;
  state = initialize(get);

  function subscribe(listener: () => void): () => void;
  function subscribe<Selection>(
    selector: (state: State) => Selection,
    listener: () => void,
    equals: (left: Selection, right: Selection) => boolean,
  ): () => void;
  function subscribe<Selection>(
    selectorOrListener: ((state: State) => Selection) | (() => void),
    listener?: () => void,
    equals?: (left: Selection, right: Selection) => boolean,
  ): () => void {
    if (arguments.length === 1) {
      const storeListener = selectorOrListener as () => void;
      listeners.add(storeListener);
      return () => listeners.delete(storeListener);
    }
    const selector = selectorOrListener as (state: State) => Selection;
    const selectionListener = listener!;
    const selectionEquals = equals!;
    let selection = selector(state);
    const storeListener = () => {
      const nextSelection = selector(state);
      if (selectionEquals(selection, nextSelection)) {
        return;
      }
      selection = nextSelection;
      selectionListener();
    };
    listeners.add(storeListener);
    return () => listeners.delete(storeListener);
  }

  const update = (update: Partial<State>): void => {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  };

  return { get, subscribe, update };
}

export function shallowEqual<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left) as (keyof T)[];
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}
