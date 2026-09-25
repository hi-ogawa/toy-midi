import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { App } from "./app";
import "./index.css";
import "./e2e";

function main() {
  // Keep a same-origin utility page for E2E setup without initializing the app.
  if (window.location.pathname.startsWith("/__e2e__/")) {
    return;
  }

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
}

main();
