import { useProviders } from '../hooks/useProviders';

interface ContextIndicatorProps {
  usedTokens: number;
}

export function ContextIndicator({ usedTokens }: ContextIndicatorProps) {
  const { activeProvider } = useProviders();

  const contextWindow = activeProvider?.contextWindowSize ?? 1;
  const modelName = activeProvider?.model ?? 'No model';

  const percent = Math.min((usedTokens / contextWindow) * 100, 100);
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex items-center gap-2">
      <div className="group/ctx relative h-5 w-5 cursor-default">
        <svg className="h-full w-full -rotate-90">
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="white"
            strokeWidth="1.5"
            fill="transparent"
            strokeOpacity="0.1"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="white"
            strokeWidth="1.5"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeOpacity="0.8"
            strokeLinecap="round"
          />
        </svg>
        <div className="pointer-events-none absolute right-0 bottom-full z-50 mb-1.5 rounded-md border border-border bg-bg-1 px-2 py-1 font-mono text-[0.65rem] whitespace-nowrap text-text-secondary opacity-0 transition-opacity duration-150 group-hover/ctx:opacity-100">
          {percent.toFixed(2)}% · {usedTokens.toLocaleString()} / {contextWindow.toLocaleString()} tokens
        </div>
      </div>

      <span className="max-w-[120px] truncate text-[0.7rem] text-text-secondary" title={modelName}>
        {modelName}
      </span>
    </div>
  );
}
