import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { App } from "./app";
import "./index.css";
import { exposeToneForE2E } from "./lib/audio";
import { exposeStoreForE2E } from "./stores/project-store";

exposeStoreForE2E();
exposeToneForE2E();

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => toast.error(error.message),
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
