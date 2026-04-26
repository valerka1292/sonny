import React from 'react';
import { testProviderStream } from '../services/llmService';
import type { Provider } from '../types';

interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export function useProviderTest() {
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<ProviderTestResult | null>(null);
  const mountedRef = React.useRef(true);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const test = React.useCallback(async (provider: Provider) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    if (!mountedRef.current) {
      return;
    }
    setTesting(true);
    setResult(null);

    try {
      const ok = await testProviderStream(provider, abortRef.current.signal);
      if (!mountedRef.current) {
        return;
      }
      setResult({
        ok,
        message: ok ? 'Connection successful' : 'Connection failed',
      });
    } finally {
      if (mountedRef.current) {
        setTesting(false);
      }
    }
  }, []);

  const clear = React.useCallback(() => {
    if (mountedRef.current) {
      setResult(null);
    }
  }, []);

  return { test, testing, result, clear };
}
