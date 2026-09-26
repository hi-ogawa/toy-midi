import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  readStorageEstimate,
  readStoragePersistence,
  requestStoragePersistence,
} from "../lib/browser-storage";

const persistenceKey = ["browser-storage", "persistence"];
const estimateKey = ["browser-storage", "estimate"];

export function useBrowserStorage() {
  const queryClient = useQueryClient();
  const persistence = useQuery({
    queryKey: persistenceKey,
    // Wrap optional API results because query data itself must be defined.
    queryFn: async () => ({ persisted: await readStoragePersistence() }),
    staleTime: 30_000,
    retry: false,
  });
  const estimate = useQuery({
    queryKey: estimateKey,
    queryFn: async () => ({ estimate: await readStorageEstimate() }),
    staleTime: 30_000,
    retry: false,
  });
  const protect = useMutation({
    mutationFn: requestStoragePersistence,
    onSuccess: (persisted) => {
      queryClient.setQueryData(persistenceKey, { persisted });
    },
    // Keep request failures beside the protection control instead of a toast.
    onError: () => {},
  });
  return { persistence, estimate, protect };
}

export function useRefreshStorageEstimate() {
  const queryClient = useQueryClient();
  return () => {
    // Diagnostic refresh must not change whether a project write succeeded.
    void queryClient.invalidateQueries({ queryKey: estimateKey });
  };
}
