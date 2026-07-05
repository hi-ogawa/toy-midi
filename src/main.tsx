import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { App } from "./app";
import "./index.css";
import oxisynthWasmUrl from "./assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "./assets/oxisynth/worklet.js?url";
import soundfontUrl from "./assets/soundfonts/A320U.sf2?url";
import { unlockAudioOnFirstGesture } from "./lib/audio";
import { projectStorage, seedProjectV1 } from "./lib/project-storage";
import { useProjectStore } from "./stores/project-store";

function main() {
  // expose utility for e2e
  if (import.meta.env.DEV) {
    window.__e2e = {
      useProjectStore,
      projectStorage,
      seedProjectV1,
    };
    if (window.location.pathname.startsWith("/__e2e__/")) {
      return;
    }
  }

  unlockAudioOnFirstGesture();

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
    for (const href of [oxisynthWasmUrl, oxisynthWorkletUrl, soundfontUrl]) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "fetch";
      link.crossOrigin = "anonymous";
      link.href = href;
      document.head.appendChild(link);
    }
  });
}

main();
