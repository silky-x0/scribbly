'use client';

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info' | 'success';
}

/** Bottom-center stack. Errors use role=alert, notes use role=status. */
export function Toaster({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="off">
      {toasts.map((t) => (
        <p
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`toast toast-${t.kind}`}
        >
          {t.text}
        </p>
      ))}
    </div>
  );
}
