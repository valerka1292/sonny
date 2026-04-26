import { AgentMode } from './types';

export const AGENT_MODES: { id: AgentMode; label: string; description: string }[] = [
  { id: 'Chat', label: 'Chat', description: 'Standard conversation with the agent.' },
  { id: 'Autonomy', label: 'Autonomy', description: 'Agent executes tasks independently in loops.' },
  { id: 'Improve', label: 'Improve', description: 'Agent analyzes and enhances its own code/logic.' },
  { id: 'Dream', label: 'Dream', description: 'Exploratory mode for creative ideation.' },
];
