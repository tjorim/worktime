/**
 * Shared TanStack QueryClient instance.
 *
 * Imported by:
 *  - App.tsx (<QueryClientProvider client={queryClient}>)
 *  - src/db/collections.ts (passed to every QueryCollection)
 *
 * A single QueryClient is required so that QueryCollection observers and
 * standalone useQuery hooks share the same cache.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
