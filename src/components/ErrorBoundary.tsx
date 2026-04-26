import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UI render failure', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg-0 p-6 text-text-primary">
        <div className="max-w-md rounded-lg border border-border bg-bg-1 p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
          <p className="mb-4 text-sm text-text-secondary">
            {this.state.error?.message ?? 'Unexpected UI error'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border bg-bg-2 px-4 py-2 text-sm hover:bg-bg-3"
          >
            Reload application
          </button>
        </div>
      </div>
    );
  }
}
