import { useQuery } from "@tanstack/react-query";

interface UseOpenHolidaysOptions {
  endpoint: string;
  params: Record<string, string>;
  enabled: boolean;
  responseErrorPrefix: string;
  timeoutError: string;
  networkError: string;
  unknownError: string;
}

async function fetchOpenHolidays<T>(
  endpoint: string,
  params: Record<string, string>,
  responseErrorPrefix: string,
  timeoutError: string,
  networkError: string,
  signal: AbortSignal,
): Promise<T[]> {
  const timeoutSignal = AbortSignal.timeout(10000);

  let response: Response;
  try {
    const searchParams = new URLSearchParams(params);
    response = await fetch(`https://openholidaysapi.org/${endpoint}?${searchParams}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([signal, timeoutSignal]),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || timeoutSignal.aborted)) {
      throw new Error(timeoutError);
    }
    // Let React Query handle request cancellation (unmount / query invalidation)
    // silently rather than surfacing a user-visible error toast.
    if (signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw err;
    }
    throw new Error(networkError);
  }

  if (!response.ok) {
    throw new Error(`${responseErrorPrefix}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T[]>;
}

export function useOpenHolidays<T>({
  endpoint,
  params,
  enabled,
  responseErrorPrefix,
  timeoutError,
  networkError,
  unknownError,
}: UseOpenHolidaysOptions) {
  const { data, isLoading, error } = useQuery<T[], Error>({
    queryKey: ["openHolidays", endpoint, params],
    queryFn: ({ signal }) =>
      fetchOpenHolidays<T>(endpoint, params, responseErrorPrefix, timeoutError, networkError, signal),
    enabled,
    staleTime: 1000 * 60 * 60 * 24, // holiday data doesn't change intra-day
    retry: 1,
  });

  const errorMessage = error
    ? error.message.startsWith(responseErrorPrefix) ||
      error.message === timeoutError ||
      error.message === networkError
      ? error.message
      : unknownError
    : null;

  return { holidays: data ?? [], loading: isLoading, error: errorMessage };
}
