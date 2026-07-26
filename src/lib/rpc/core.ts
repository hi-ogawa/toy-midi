interface RpcCallbackStub {
  __rpcCallback: string;
}

type AnyFn = (...args: any[]) => void;

export function serializeParams(
  params: unknown,
  register: (id: string, fn: AnyFn) => void,
): unknown {
  if (typeof params === "function") {
    const id = crypto.randomUUID();
    register(id, params as AnyFn);
    return { __rpcCallback: id } satisfies RpcCallbackStub;
  }
  if (Array.isArray(params)) {
    return params.map((value) => serializeParams(value, register));
  }
  if (isPlainObject(params)) {
    return Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        serializeParams(value, register),
      ]),
    );
  }
  return params;
}

export function deserializeParams(
  params: unknown,
  invoke: (callbackId: string, args: unknown[]) => void,
): unknown {
  if (
    params !== null &&
    typeof params === "object" &&
    "__rpcCallback" in params &&
    typeof (params as RpcCallbackStub).__rpcCallback === "string"
  ) {
    const id = (params as RpcCallbackStub).__rpcCallback;
    return (...args: unknown[]) => invoke(id, args);
  }
  if (Array.isArray(params)) {
    return params.map((value) => deserializeParams(value, invoke));
  }
  if (isPlainObject(params)) {
    return Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        deserializeParams(value, invoke),
      ]),
    );
  }
  return params;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type HandlerParams<Handler> = Handler extends (
  params: infer Params,
) => Promise<unknown>
  ? Params
  : never;

type HandlerResult<Handler> = Handler extends (
  ...args: never[]
) => Promise<infer Result>
  ? Result
  : never;

export type RpcClient<Handlers> = {
  [Method in keyof Handlers]: (
    params: HandlerParams<Handlers[Method]>,
  ) => Promise<HandlerResult<Handlers[Method]>>;
};

export function createRpcProxy<Handlers>(
  call: (method: string, params: unknown) => Promise<unknown>,
): RpcClient<Handlers> {
  return new Proxy({} as RpcClient<Handlers>, {
    get(_target, property) {
      if (
        typeof property !== "string" ||
        property === "then" ||
        property === "toJSON"
      ) {
        return undefined;
      }
      return (params: unknown) => call(property, params);
    },
  });
}
