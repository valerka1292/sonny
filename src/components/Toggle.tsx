import React from 'react';
import { cn } from '../lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Compact accessible on/off switch. Keyboard-toggleable, ARIA-labelled,
 * matches the dark-theme tokens used elsewhere (bg-bg-2 / accent).
 */
export default function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  size = 'sm',
}: ToggleProps) {
  const dims =
    size === 'sm'
      ? { track: 'h-4 w-7', thumb: 'h-3 w-3', offset: 'translate-x-[14px]' }
      : { track: 'h-5 w-9', thumb: 'h-4 w-4', offset: 'translate-x-[18px]' };

  const handleClick = () => {
    if (disabled) return;
    onChange(!checked);
  };

  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'relative inline-flex flex-shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        dims.track,
        checked ? 'bg-accent/80' : 'bg-bg-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow transition-transform duration-150',
          dims.thumb,
          checked ? dims.offset : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label) return button;

  return (
    <label
      className={cn(
        'flex items-center gap-2 text-xs text-text-secondary',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      {button}
      <span>{label}</span>
    </label>
  );
}
