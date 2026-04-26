import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ProvidersProvider } from './context/ProvidersContext';
import { StorageProvider } from './context/StorageContext';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StorageProvider>
        <ProvidersProvider>
          <App />
        </ProvidersProvider>
      </StorageProvider>
    </ErrorBoundary>
  </StrictMode>,
);
