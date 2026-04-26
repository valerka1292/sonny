import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { useProviders } from '../hooks/useProviders';
import { useProviderTest } from '../hooks/useProviderTest';
import type { Provider } from '../types';
import { cn } from '../lib/utils';
import ProviderCard from './ProviderCard';
import ProviderForm, { ProviderFormValues } from './ProviderForm';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function valuesToProvider(values: ProviderFormValues, id: string): Provider {
  return {
    id,
    visualName: values.visualName.trim(),
    baseUrl: values.baseUrl.trim(),
    apiKey: values.apiKey.trim(),
    model: values.model.trim(),
    contextWindowSize: Number(values.contextWindowSize) || 1,
  };
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { data, addProvider, deleteProvider, setActiveProvider, updateProvider } = useProviders();
  const { clear, result, test, testing } = useProviderTest();

  const [activeTab, setActiveTab] = React.useState<'providers' | 'general'>('providers');
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] = React.useState<Provider | null>(null);

  const providers = React.useMemo(() => Object.values(data.providers), [data.providers]);

  const handleTest = async (values: ProviderFormValues) => {
    await test(valuesToProvider(values, editingProvider?.id ?? 'test-provider'));
  };

  const handleAddProvider = async (values: ProviderFormValues) => {
    const provider = valuesToProvider(values, `provider_${Date.now()}`);
    await addProvider(provider);
    setIsAddOpen(false);
    clear();
  };

  const handleUpdateProvider = async (values: ProviderFormValues) => {
    if (!editingProvider) {
      return;
    }

    await updateProvider(editingProvider.id, valuesToProvider(values, editingProvider.id));
    setEditingProvider(null);
    clear();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setEditingProvider(null);
          setIsAddOpen(false);
          clear();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-bg-0 shadow-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-bg-0 px-6 py-4">
            <Dialog.Title className="text-lg font-medium text-text-primary">Settings</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-text-secondary outline-none transition-colors hover:bg-bg-2 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description id="settings-description" className="sr-only">
            Configuration preferences for your agent workspace.
          </Dialog.Description>

          <div className="flex min-h-[400px] flex-1 overflow-hidden">
            <div className="flex w-[180px] flex-col gap-1 overflow-y-auto border-r border-border bg-bg-1 p-4">
              <button
                onClick={() => setActiveTab('general')}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  activeTab === 'general'
                    ? 'bg-bg-3 font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-bg-2 hover:text-text-primary',
                )}
              >
                General
              </button>
              <button
                onClick={() => setActiveTab('providers')}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  activeTab === 'providers'
                    ? 'bg-bg-3 font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-bg-2 hover:text-text-primary',
                )}
              >
                Providers
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-bg-0 p-6">
              {activeTab === 'providers' && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-text-primary">Model Providers</h3>
                      <p className="mt-1 text-sm text-text-secondary">Manage your AI backend connections.</p>
                    </div>
                    <button
                      className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
                      onClick={() => {
                        setEditingProvider(null);
                        setIsAddOpen((prev) => !prev);
                      }}
                    >
                      <Plus size={16} />
                      Add connection
                    </button>
                  </div>

                  {result && (
                    <div className={`rounded-md border px-3 py-2 text-sm ${result.ok ? 'border-green-500/40 text-green-400' : 'border-red-500/40 text-red-400'}`}>
                      {result.message}
                    </div>
                  )}

                  {(isAddOpen || editingProvider) && (
                    <ProviderForm
                      initialValues={editingProvider ?? undefined}
                      onSubmit={editingProvider ? handleUpdateProvider : handleAddProvider}
                      onTest={handleTest}
                      submitLabel={editingProvider ? 'Update' : 'Save'}
                      testLabel={testing ? 'Testing...' : 'Test'}
                      disabled={testing}
                    />
                  )}

                  <div className="flex flex-col gap-3">
                    {providers.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        isActive={provider.id === data.activeProviderId}
                        onSetActive={setActiveProvider}
                        onEdit={(currentProvider) => {
                          setIsAddOpen(false);
                          clear();
                          setEditingProvider(currentProvider);
                        }}
                        onDelete={deleteProvider}
                      />
                    ))}
                    {providers.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                        No providers yet. Add your first connection.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'general' && <div className="text-sm text-text-secondary">General settings would go here...</div>}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
