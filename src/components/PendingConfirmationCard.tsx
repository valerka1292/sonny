import { useState } from 'react';
import type { DiffHunk, ToolCall } from '../types';
import DiffRenderer from './toolRenderers/DiffRenderer';
import { buildDiffFile } from './toolRenderers/shared';

interface PendingConfirmationOutput {
  type?: 'create' | 'update';
  filePath?: string;
  structuredPatch?: DiffHunk[];
}

interface PendingConfirmationCardProps {
  toolCall: ToolCall;
  output: PendingConfirmationOutput;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export default function PendingConfirmationCard({ toolCall, output, onApprove, onReject }: PendingConfirmationCardProps) {
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);
  const isUpdate = output?.type === 'update';

  const handleRejectClick = () => {
    if (!showReason) {
      setShowReason(true);
      return;
    }
    onReject(reason.trim() || 'No reason provided');
  };

  return (
    <div className="my-2 w-full rounded-lg border border-border bg-bg-2 p-4">
      <div className="mb-3 text-xs text-text-secondary">
        Pending confirmation: {toolCall.function?.name} {output.filePath ? `(${output.filePath})` : ''}
      </div>

      {isUpdate ? (
        <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
          <DiffRenderer
            toolCall={{
              ...toolCall,
              result: {
                status: 'success',
                output: {
                  diff: buildDiffFile(output.filePath || '', output.structuredPatch || []),
                },
              },
            }}
          />
        </div>
      ) : (
        <div className="mb-3 rounded border border-green-500/30 bg-green-950/20 p-2 text-xs text-green-300">
          New file will be created at {output.filePath || 'unknown path'}.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleRejectClick}
          className="rounded bg-red-600/20 px-3 py-1 text-xs text-red-400 hover:bg-red-600/30"
        >
          {showReason ? 'Confirm Reject' : 'Reject'}
        </button>
        {showReason && (
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for rejection..."
            className="flex-1 rounded border border-border bg-bg-1 px-2 py-1 text-xs text-text-primary"
          />
        )}
        <button
          onClick={onApprove}
          className="ml-auto rounded bg-green-600/20 px-3 py-1 text-xs text-green-400 hover:bg-green-600/30"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
