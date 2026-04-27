import { useState } from 'react';

interface ConfirmationActionsProps {
  onApprove: () => void;
  onReject: (reason: string) => void;
}

/**
 * Inline approve/reject row + collapsible reason input. Lives at the bottom
 * of a tool's diff card while the agent is awaiting human confirmation.
 */
export default function ConfirmationActions({ onApprove, onReject }: ConfirmationActionsProps) {
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);

  const handleRejectClick = () => {
    if (!showReason) {
      setShowReason(true);
      return;
    }
    onReject(reason.trim() || 'No reason provided');
  };

  return (
    <div className="border-t border-border bg-bg-3/20 px-3 py-2 flex flex-wrap items-center gap-2">
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
          placeholder="Reason for rejection…"
          className="flex-1 min-w-0 rounded border border-border bg-bg-1 px-2 py-1 text-xs text-text-primary"
          autoFocus
        />
      )}
      <button
        onClick={onApprove}
        className="ml-auto rounded bg-green-600/20 px-3 py-1 text-xs text-green-400 hover:bg-green-600/30"
      >
        Approve
      </button>
    </div>
  );
}
