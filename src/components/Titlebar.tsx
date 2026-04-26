import React from 'react';
import { Minus, Square, X, Edit3 } from 'lucide-react';
import { useOS } from '../hooks/useOS';

interface TitlebarProps {
  chatTitle?: string;
  onRename?: () => void;
}

export default function Titlebar({ chatTitle, onRename }: TitlebarProps) {
  const os = useOS();

  const handleMinimize = () => {
    if (window.electron) {
      window.electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.maximize();
    }
  };

  const handleClose = () => {
    if (window.electron) {
      window.electron.close();
    }
  };

  return (
    <div className="titlebar-drag h-11 flex items-center border-b border-border bg-bg-0 relative z-20 flex-shrink-0">
      {/* macOS traffic lights spacer */}
      {os === 'mac' && <div className="w-20 flex-shrink-0" />}

      {/* Center title */}
      <div className="flex-1 flex items-center justify-center px-4">
        <button 
          onClick={onRename}
          className="group flex items-center gap-2 px-3 py-1 -mx-3 rounded-md hover:bg-bg-2 transition-colors no-drag max-w-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <span className="text-[13px] font-medium text-text-primary/80 group-hover:text-text-primary truncate">
            {chatTitle || 'Untitled Chat'}
          </span>
          <Edit3 size={12} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </button>
      </div>

      {/* Windows / Linux controls */}
      {os !== 'mac' && (
        <div className="flex items-center h-full no-drag text-text-secondary">
          <button 
            onClick={handleMinimize}
            className="h-full px-4 hover:bg-bg-2 hover:text-text-primary transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label="Minimize"
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button 
            onClick={handleMaximize}
            className="h-full px-4 hover:bg-bg-2 hover:text-text-primary transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label="Maximize"
          >
            <Square size={11} strokeWidth={1.5} />
          </button>
          <button 
            onClick={handleClose}
            className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
