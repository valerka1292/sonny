import React from 'react';
import { ToolRendererProps } from '../../types';
import GlobRenderer from './GlobRenderer';
import GrepRenderer from './GrepRenderer';

const rendererMap: Record<string, React.FC<ToolRendererProps>> = {
  Glob: GlobRenderer,
  Grep: GrepRenderer,
};

export function getToolRenderer(name?: string): React.FC<ToolRendererProps> | null {
  if (!name) return null;
  return rendererMap[name] || null;
}
