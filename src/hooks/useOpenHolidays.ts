import { useEffect, useMemo, useState } from "react";

interface UseOpenHolidaysOptions {
  endpoint: string;
  params: Record<string, string>;
  enabled: boolean;
  responseErrorPrefix: string;
  timeoutError: string;
  networkError: string;
  unknownError: string;
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
  const [holidays, setHolidays] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    if (!enabled) {
      setHolidays([]);
      setError(null);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutSignal = AbortSignal.timeout(10000);

    const fetchHolidays = async () => {
      setLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams(params);
        const response = await fetch(`https://openholidaysapi.org/${endpoint}?${searchParams}`, {
          headers: {
            Accept: "application/json",
          },
          signal: AbortSignal.any([abortController.signal, timeoutSignal]),
        });

        if (!response.ok) {
          throw new Error(`${responseErrorPrefix}: ${response.status} ${response.statusText}`);
        }

        const data: T[] = await response.json();
        setHolidays(data);
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "AbortError" || err.name === "TimeoutError") {
            // Check if it was a timeout (not a manual abort)
            if (timeoutSignal.aborted && !abortController.signal.aborted) {
              setError(timeoutError);
              setHolidays([]);
            }
            // If manually aborted (cleanup), don't set error - silent abort
            return;
          }
          if (err.message.startsWith(responseErrorPrefix)) {
            setError(err.message);
          } else if (err instanceof TypeError) {
            // TypeError is thrown for network failures across all browsers
            setError(networkError);
          } else {
            setError(err.message);
          }
        } else {
          setError(unknownError);
        }
        setHolidays([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHolidays();

    return () => {
      abortController.abort();
    };
  }, [
    endpoint,
    paramsKey,
    enabled,
    responseErrorPrefix,
    timeoutError,
    networkError,
    unknownError,
  ]); // oxlint-disable-line react/exhaustive-deps -- paramsKey tracks params changes via useMemo, preventing unnecessary re-fetches on identical content

  return { holidays, loading, error };
}
