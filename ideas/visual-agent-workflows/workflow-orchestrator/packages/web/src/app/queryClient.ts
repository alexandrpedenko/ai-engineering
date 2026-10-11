import { QueryClient } from "@tanstack/react-query";

// The app's query cache. Data is refetched only when a mutation invalidates it
// or the page reloads, not on window focus.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
  });
}
