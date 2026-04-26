import React from 'react';
import type { Provider } from '../types';

export interface ProviderFormValues {
  visualName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindowSize: number;
}

interface ProviderFormProps {
  initialValues?: Provider;
  disabled?: boolean;
  onSubmit: (values: ProviderFormValues) => Promise<void>;
  onTest: (values: ProviderFormValues) => Promise<void>;
  submitLabel: string;
  testLabel?: string;
}

const DEFAULT_VALUES: ProviderFormValues = {
  visualName: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  contextWindowSize: 128000,
};
const BASE_URL_PATTERN = /^(https?:\/\/)[\w.-]+(:\d+)?(\/.*)?$/;
const MODEL_PATTERN = /^[a-zA-Z0-9_/-]+$/;
const MAX_CONTEXT_WINDOW = 2_000_000;

export default function ProviderForm({
  initialValues,
  disabled = false,
  onSubmit,
  onTest,
  submitLabel,
  testLabel = 'Test',
}: ProviderFormProps) {
  const [values, setValues] = React.useState<ProviderFormValues>(DEFAULT_VALUES);

  React.useEffect(() => {
    if (!initialValues) {
      setValues(DEFAULT_VALUES);
      return;
    }

    setValues({
      visualName: initialValues.visualName,
      baseUrl: initialValues.baseUrl,
      apiKey: initialValues.apiKey,
      model: initialValues.model,
      contextWindowSize: initialValues.contextWindowSize,
    });
  }, [initialValues]);

  const onFieldChange =
    (field: keyof ProviderFormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setValues((prev) => ({
        ...prev,
        [field]: field === 'contextWindowSize' ? (Number(value) || 0) : value,
      }));
    };

  const visualName = values.visualName.trim();
  const baseUrl = values.baseUrl.trim();
  const apiKey = values.apiKey.trim();
  const model = values.model.trim();
  const contextRaw = String(values.contextWindowSize);
  const contextValue = Number(contextRaw);

  const errors = {
    visualName: visualName ? '' : 'Visual name is required.',
    baseUrl: !baseUrl
      ? 'Base URL is required.'
      : !BASE_URL_PATTERN.test(baseUrl)
        ? 'Base URL must start with http(s):// and include a valid host.'
        : '',
    apiKey: apiKey ? '' : 'API key is required.',
    model: !model
      ? 'Model is required.'
      : !MODEL_PATTERN.test(model)
        ? 'Model can contain only letters, numbers, _, -, /.'
        : '',
    contextWindowSize:
      !/^\d+$/.test(contextRaw) || contextValue <= 0
        ? 'Context window size must be a positive integer.'
        : contextValue > MAX_CONTEXT_WINDOW
          ? `Context window size must be <= ${MAX_CONTEXT_WINDOW.toLocaleString()}.`
          : '',
  };

  const isInvalid = Object.values(errors).some(Boolean);

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-bg-1 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(values);
      }}
    >
      <input
        className="w-full rounded-md border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        placeholder="Visual name"
        value={values.visualName}
        onChange={onFieldChange('visualName')}
      />
      {errors.visualName && <p className="text-xs text-error">{errors.visualName}</p>}
      <input
        className="w-full rounded-md border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        placeholder="Base URL"
        value={values.baseUrl}
        onChange={onFieldChange('baseUrl')}
      />
      {errors.baseUrl && <p className="text-xs text-error">{errors.baseUrl}</p>}
      <input
        className="w-full rounded-md border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        placeholder="Model"
        value={values.model}
        onChange={onFieldChange('model')}
      />
      {errors.model && <p className="text-xs text-error">{errors.model}</p>}
      <input
        className="w-full rounded-md border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        placeholder="API key"
        value={values.apiKey}
        onChange={onFieldChange('apiKey')}
      />
      {errors.apiKey && <p className="text-xs text-error">{errors.apiKey}</p>}
      <input
        className="w-full rounded-md border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        placeholder="Context window size"
        type="number"
        min={1}
        value={values.contextWindowSize}
        onChange={onFieldChange('contextWindowSize')}
      />
      {errors.contextWindowSize && <p className="text-xs text-error">{errors.contextWindowSize}</p>}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => void onTest(values)}
          disabled={disabled || isInvalid}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-bg-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testLabel}
        </button>
        <button
          type="submit"
          disabled={disabled || isInvalid}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
