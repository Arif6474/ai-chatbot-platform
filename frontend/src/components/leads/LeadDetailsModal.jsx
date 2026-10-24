import { useEffect, useRef, useState } from 'react';
import { Mail, Phone, Clock, UserCheck, X, Loader2, MessageSquare, Tag, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const STATUS_COLORS = {
  new: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  contacted: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  qualified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export default function LeadDetailsModal({ isOpen, lead, loading, onClose, onSave }) {
  const [status, setStatus] = useState('new');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    if (lead) {
      setStatus(lead.status || 'new');
      setNotes(lead.notes || '');
      setError('');
    }
  }, [lead, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !lead) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current || loading) return;

    if (notes && notes.length > 2000) {
      setError('Notes cannot exceed 2000 characters');
      return;
    }

    submitting.current = true;
    try {
      await onSave(lead.id, { status, notes });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="lead-modal-title" className="text-lg font-semibold text-white">
                {lead.name}
              </h2>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${
                  STATUS_COLORS[lead.status] || STATUS_COLORS.new
                }`}
              >
                {lead.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Received {new Date(lead.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={loading}
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Contact Info & Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-lg border border-slate-700/60">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-slate-400">Email:</span>
            {lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="text-blue-400 hover:underline truncate"
              >
                {lead.email}
              </a>
            ) : (
              <span className="text-slate-500 italic">None</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-400">Phone:</span>
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="text-emerald-400 hover:underline truncate"
              >
                {lead.phone}
              </a>
            ) : (
              <span className="text-slate-500 italic">None</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-slate-400">Source:</span>
            <span className="capitalize">{lead.source}</span>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-400">Lead ID:</span>
            <span className="font-mono text-slate-400 truncate">{lead.id}</span>
          </div>
        </div>

        {/* Enquiry Message */}
        {lead.message && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Customer Enquiry
            </Label>
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/80 p-3.5 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
              {lead.message}
            </div>
          </div>
        )}

        {/* Form to update status and notes */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-700/60">
          <div className="space-y-1.5">
            <Label htmlFor="lead-status" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Lead Status
            </Label>
            <select
              id="lead-status"
              value={status}
              disabled={loading}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="new">New — Uncontacted enquiry</option>
              <option value="contacted">Contacted — Initial outreach made</option>
              <option value="qualified">Qualified — Prospective customer engaged</option>
              <option value="closed">Closed — Resolved or archived</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-notes" className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Internal Admin Notes
            </Label>
            <textarea
              id="lead-notes"
              value={notes}
              disabled={loading}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record follow-up details, consultation notes, or appointment requirements..."
              rows={4}
              maxLength={2000}
              className="flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-right text-[10px] text-slate-500">{notes.length}/2000</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Updates
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
