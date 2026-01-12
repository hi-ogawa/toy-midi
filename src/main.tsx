import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { App } from "./app";
import "./index.css";
import { exposeStoreForE2E } from "./stores/project-store";
import oxisynthWasmUrl from "@/assets/oxisynth/oxisynth.wasm?url";
import soundfontUrl from "@/assets/soundfonts/A320U.sf2?url";

exposeStoreForE2E();

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => {
        console.error(error);
        toast.error(error.message);
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
);

// Preload large assets after initial render
requestIdleCallback(() => {
  for (const href of [oxisynthWasmUrl, soundfontUrl]) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.crossOrigin = "anonymous";
    link.href = href;
    document.head.appendChild(link);
  }
});
