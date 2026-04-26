import React from 'react';
import { ToolRendererProps } from '../../types';
import GlobRenderer from './GlobRenderer';
import GrepRenderer from './GrepRenderer';
import DiffRenderer from './DiffRenderer';
import ReadRenderer from './ReadRenderer';

const rendererMap: Record<string, React.FC<ToolRendererProps>> = {
  Glob: GlobRenderer,
  Grep: GrepRenderer,
  WriteFile: DiffRenderer,
  EditFile: DiffRenderer,
  Read: ReadRenderer,
};

export function getToolRenderer(name?: string): React.FC<ToolRendererProps> | null {
  if (!name) return null;
  return rendererMap[name] || null;
}
