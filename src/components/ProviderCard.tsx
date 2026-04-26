import React from 'react';
import { Cpu, Edit2, Globe, Key, Trash2 } from 'lucide-react';
import type { Provider } from '../types';

interface ProviderCardProps {
  provider: Provider;
  isActive: boolean;
  onSetActive: (id: string) => Promise<void>;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function ProviderCard({ provider, isActive, onSetActive, onEdit, onDelete }: ProviderCardProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-gradient-to-br from-bg-2 to-bg-3">
            <Cpu size={18} className="text-text-primary" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{provider.visualName}</div>
            <div className="truncate font-mono text-xs text-text-secondary">{provider.model}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onSetActive(provider.id)}
            className={`rounded px-2 py-1 text-xs ${
              isActive ? 'bg-green-600/20 text-green-400' : 'bg-bg-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {isActive ? 'Active' : 'Set active'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(provider)}
            className="rounded p-1.5 text-text-secondary transition-colors hover:bg-bg-3 hover:text-text-primary"
            aria-label="Edit provider"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(provider.id)}
            className="rounded p-1.5 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-400"
            aria-label="Delete provider"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <Globe size={12} className="flex-shrink-0" />
          <span className="truncate font-mono">{provider.baseUrl}</span>
        </div>
        <div className="flex items-center gap-2">
          <Key size={12} className="flex-shrink-0" />
          <span className="font-mono">{provider.apiKey ? '••••••••' : 'No key'}</span>
          <span>· {provider.contextWindowSize.toLocaleString()} ctx</span>
        </div>
      </div>
    </div>
  );
}
