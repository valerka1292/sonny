import React from 'react';

function detectOS(): 'mac' | 'win' | 'linux' {
  // Sync read from electron preload (set in main.cjs process.platform)
  const platform = window.electron?.platform ?? '';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return 'linux';
  return 'win';
}

export function useOS() {
  // Use state with initializer to prevent flash
  const [os] = React.useState<'mac' | 'win' | 'linux'>(detectOS);
  return os;
}
