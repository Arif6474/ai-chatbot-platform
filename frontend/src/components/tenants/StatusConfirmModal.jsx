import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StatusConfirmModal({
  isOpen,
  tenant,
  targetStatus,
  onClose,
  onConfirm,
  loading,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen || !tenant) return null;

  const isDeactivating = targetStatus === 'inactive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md bg-slate-850 rounded-xl border border-slate-750 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: '#1e293b' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-full ${
                isDeactivating
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {isDeactivating ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-lg font-semibold text-white">
                {isDeactivating ? 'Deactivate Tenant' : 'Activate Tenant'}
              </h3>
              <p className="text-xs text-slate-400">
                {tenant.name} ({tenant.slug})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-700/50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm text-slate-300 space-y-2">
          {isDeactivating ? (
            <p>
              Are you sure you want to deactivate <strong className="text-white">{tenant.name}</strong>?
              Deactivated tenants cannot serve automated chatbot conversations or ingest new business knowledge.
            </p>
          ) : (
            <p>
              Are you sure you want to activate <strong className="text-white">{tenant.name}</strong>?
              This will re-enable all automated chatbot operations and platform services for this business.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className={
              isDeactivating
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isDeactivating ? 'Confirm Deactivation' : 'Confirm Activation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
