// Page client for the local agent bridge in cli.ts. The bridge
// streams `eval` requests over Server-Sent Events, and each one runs as an
// async function body with `app` in scope. Its return value, or the error it
// throws, is posted back as JSON.

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

export function connectAgentBridge({
  bridgeUrl,
  app,
}: {
  bridgeUrl: string;
  app: unknown;
}): () => void {
  const connectUrl = new URL("/connect", bridgeUrl);
  connectUrl.searchParams.set("url", window.location.href);
  const source = new EventSource(connectUrl);
  source.addEventListener("eval", async (event) => {
    const { requestId, code } = JSON.parse(event.data) as {
      requestId: string;
      code: string;
    };
    let body: string;
    try {
      const value = await new AsyncFunction("app", code)(app);
      body = JSON.stringify({ requestId, ok: true, value });
    } catch (error) {
      body = JSON.stringify({
        requestId,
        ok: false,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
    }
    await fetch(new URL("/result", bridgeUrl), { method: "POST", body });
  });
  return () => source.close();
}
