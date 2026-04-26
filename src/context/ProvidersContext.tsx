import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Provider, ProvidersData } from '../types';
import { useProviderStorage } from './StorageContext';
import { OperationQueue } from '../services/operationQueue';

interface ProvidersContextValue {
  data: ProvidersData;
  isLoaded: boolean;
  activeProvider: Provider | null;
  refresh: () => Promise<void>;
  addProvider: (provider: Provider) => Promise<void>;
  updateProvider: (providerId: string, patch: Partial<Provider>) => Promise<void>;
  deleteProvider: (providerId: string) => Promise<void>;
  setActiveProvider: (providerId: string) => Promise<void>;
}

const defaultProvidersData: ProvidersData = {
  activeProviderId: null,
  providers: {},
};

const ProvidersContext = createContext<ProvidersContextValue | null>(null);

export function ProvidersProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ProvidersData>(defaultProvidersData);
  const [isLoaded, setIsLoaded] = useState(false);
  const providerStorage = useProviderStorage();
  const queueRef = React.useRef(new OperationQueue());
  const dataRef = React.useRef(data);

  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(async () => {
    if (!providerStorage) {
      setIsLoaded(true);
      return;
    }

    const incoming = await providerStorage.getAll();
    setData(incoming);
    setIsLoaded(true);
  }, [providerStorage]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const saveAndReplace = useCallback(async (nextData: ProvidersData) => {
    return queueRef.current.enqueue(async () => {
      if (!providerStorage) {
        setData(nextData);
        dataRef.current = nextData;
        return;
      }

      const saved = await providerStorage.save(nextData);
      setData(saved);
      dataRef.current = saved;
    });
  }, [providerStorage]);

  const addProvider = useCallback(async (provider: Provider) => {
    const currentData = dataRef.current;
    const nextData: ProvidersData = {
      activeProviderId: currentData.activeProviderId ?? provider.id,
      providers: {
        ...currentData.providers,
        [provider.id]: provider,
      },
    };
    await saveAndReplace(nextData);
  }, [saveAndReplace]);

  const updateProvider = useCallback(async (providerId: string, patch: Partial<Provider>) => {
    const currentData = dataRef.current;
    const current = currentData.providers[providerId];
    if (!current) {
      return;
    }

    const nextData: ProvidersData = {
      ...currentData,
      providers: {
        ...currentData.providers,
        [providerId]: {
          ...current,
          ...patch,
        },
      },
    };
    await saveAndReplace(nextData);
  }, [saveAndReplace]);

  const deleteProvider = useCallback(async (providerId: string) => {
    const currentData = dataRef.current;
    const { [providerId]: _removed, ...restProviders } = currentData.providers;
    const fallbackId = Object.keys(restProviders)[0] ?? null;
    const nextData: ProvidersData = {
      activeProviderId: currentData.activeProviderId === providerId ? fallbackId : currentData.activeProviderId,
      providers: restProviders,
    };
    await saveAndReplace(nextData);
  }, [saveAndReplace]);

  const setActiveProvider = useCallback(async (providerId: string) => {
    const currentData = dataRef.current;
    if (!currentData.providers[providerId]) {
      return;
    }

    const nextData: ProvidersData = {
      ...currentData,
      activeProviderId: providerId,
    };
    await saveAndReplace(nextData);
  }, [saveAndReplace]);

  const activeProvider = useMemo(() => {
    if (!data.activeProviderId) {
      return null;
    }
    return data.providers[data.activeProviderId] ?? null;
  }, [data]);

  const value = useMemo<ProvidersContextValue>(() => ({
    data,
    isLoaded,
    activeProvider,
    refresh,
    addProvider,
    updateProvider,
    deleteProvider,
    setActiveProvider,
  }), [activeProvider, addProvider, data, deleteProvider, isLoaded, refresh, setActiveProvider, updateProvider]);

  return <ProvidersContext.Provider value={value}>{children}</ProvidersContext.Provider>;
}

export function useProvidersContext() {
  const context = useContext(ProvidersContext);
  if (!context) {
    throw new Error('useProvidersContext must be used within ProvidersProvider');
  }
  return context;
}
