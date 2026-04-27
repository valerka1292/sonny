import React from 'react';
import { ToolRendererProps } from '../../types';
import GlobRenderer from './GlobRenderer';
import GrepRenderer from './GrepRenderer';
import DiffRenderer from './DiffRenderer';
import ReadRenderer from './ReadRenderer';
import TodoRenderer from './TodoRenderer';
import AskUserQuestionRenderer from './AskUserQuestionRenderer';

const rendererMap: Record<string, React.FC<ToolRendererProps>> = {
  Glob: GlobRenderer,
  Grep: GrepRenderer,
  WriteFile: DiffRenderer,
  EditFile: DiffRenderer,
  Write: DiffRenderer,
  Edit: DiffRenderer,
  Read: ReadRenderer,
  TodoWrite: TodoRenderer,
  AskUserQuestion: AskUserQuestionRenderer,
};

export function getToolRenderer(name?: string): React.FC<ToolRendererProps> | null {
  if (!name) return null;
  return rendererMap[name] || null;
}
