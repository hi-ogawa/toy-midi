import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { App } from "./app";
import "./index.css";
import { flushAutoSave } from "./lib/project-session";
import { preloadMidiAssets } from "./lib/runtime-assets";
import "./e2e";

function main() {
  // Keep a same-origin utility page for E2E setup without initializing the app.
  if (window.location.pathname.startsWith("/__e2e__/")) {
    return;
  }

  // Auto-save is debounced; flush pending changes when leaving the page
  // (navigation away or tab close).
  window.addEventListener("pagehide", () => flushAutoSave());

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
    void preloadMidiAssets();
  });
}

main();
