import React, { useState, useEffect } from 'react';
import { X, Loader2, Building, Globe, Mail, Tag, Link2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TenantModal({
  isOpen,
  mode = 'create', // 'create' | 'edit'
  tenant = null,
  onClose,
  onSubmit,
  loading = false,
}) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    businessType: '',
    contactEmail: '',
    websiteUrl: '',
    status: 'active',
  });
  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (tenant && mode === 'edit') {
      setFormData({
        name: tenant.name || '',
        slug: tenant.slug || '',
        businessType: tenant.businessType || '',
        contactEmail: tenant.contactEmail || '',
        websiteUrl: tenant.websiteUrl || '',
        status: tenant.status || 'active',
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        businessType: '',
        contactEmail: '',
        websiteUrl: '',
        status: 'active',
      });
    }
    setClientErrors({});
    setServerError(null);
  }, [tenant, mode, isOpen]);

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

  if (!isOpen) return null;

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (clientErrors[field]) {
      setClientErrors((prev) => ({ ...prev, [field]: null }));
    }
    if (serverError) {
      setServerError(null);
    }
  }

  function validate() {
    const errors = {};

    if (!formData.name || formData.name.trim().length < 2) {
      errors.name = 'Business name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Business name cannot exceed 100 characters';
    }

    if (formData.slug && formData.slug.trim()) {
      const slugVal = formData.slug.trim().toLowerCase();
      if (slugVal.length < 2 || slugVal.length > 100) {
        errors.slug = 'Slug must be between 2 and 100 characters';
      }
    }

    if (formData.contactEmail && formData.contactEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.contactEmail.trim())) {
        errors.contactEmail = 'Please enter a valid email address';
      }
    }

    if (formData.websiteUrl && formData.websiteUrl.trim()) {
      const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
      if (!urlRegex.test(formData.websiteUrl.trim())) {
        errors.websiteUrl = 'URL must start with http:// or https://';
      } else if (formData.websiteUrl.trim().length > 255) {
        errors.websiteUrl = 'Website URL cannot exceed 255 characters';
      }
    }

    if (formData.businessType && formData.businessType.trim().length > 50) {
      errors.businessType = 'Business category cannot exceed 50 characters';
    }

    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    const payload = {
      name: formData.name.trim(),
    };

    if (formData.slug && formData.slug.trim()) {
      payload.slug = formData.slug.trim();
    }

    if (mode === 'create') {
      payload.status = formData.status;
    }

    // Set null if empty string so existing optional values can be cleared
    payload.contactEmail = formData.contactEmail.trim() || null;
    payload.websiteUrl = formData.websiteUrl.trim() || null;
    payload.businessType = formData.businessType.trim() || null;

    try {
      await onSubmit(payload);
    } catch (err) {
      setServerError(err.message || 'Failed to save tenant information');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        className="w-full max-w-lg bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: '#1e293b' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 id="tenant-modal-title" className="text-base font-semibold text-white">
                {mode === 'create' ? 'Create Business Tenant' : 'Edit Tenant Information'}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'create'
                  ? 'Onboard a new business for chatbot and knowledge isolation'
                  : `Update configuration for ${tenant?.name}`}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {serverError && (
            <div className="flex items-start gap-3 p-3 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Business Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name" className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <span>Business Name</span>
              <span className="text-red-400">*</span>
            </Label>
            <Input
              id="tenant-name"
              placeholder="e.g. Apex Legal Advisory"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={loading}
              className={`bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500 ${
                clientErrors.name ? 'border-red-500 focus-visible:ring-red-500' : ''
              }`}
            />
            {clientErrors.name && (
              <p className="text-xs text-red-400">{clientErrors.name}</p>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tenant-slug" className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                <span>URL Slug Identifier</span>
              </Label>
              <span className="text-[11px] text-slate-400">
                {mode === 'create' ? 'Optional (auto-generated from name)' : 'Unique URL-safe path'}
              </span>
            </div>
            <Input
              id="tenant-slug"
              placeholder="e.g. apex-legal-advisory"
              value={formData.slug}
              onChange={(e) => handleChange('slug', e.target.value)}
              disabled={loading}
              className={`bg-slate-900/60 border-slate-700 font-mono text-xs text-slate-100 placeholder:text-slate-500 ${
                clientErrors.slug ? 'border-red-500 focus-visible:ring-red-500' : ''
              }`}
            />
            {clientErrors.slug && (
              <p className="text-xs text-red-400">{clientErrors.slug}</p>
            )}
          </div>

          {/* Business Category / Type */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-businessType" className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>Business Category / Industry</span>
            </Label>
            <Input
              id="tenant-businessType"
              placeholder="e.g. Legal Services, Healthcare, Real Estate"
              value={formData.businessType}
              onChange={(e) => handleChange('businessType', e.target.value)}
              disabled={loading}
              className="bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500"
            />
            {clientErrors.businessType && (
              <p className="text-xs text-red-400">{clientErrors.businessType}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contact Email */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-email" className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>Contact Email</span>
              </Label>
              <Input
                id="tenant-email"
                type="email"
                placeholder="contact@business.com"
                value={formData.contactEmail}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                disabled={loading}
                className={`bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs ${
                  clientErrors.contactEmail ? 'border-red-500 focus-visible:ring-red-500' : ''
                }`}
              />
              {clientErrors.contactEmail && (
                <p className="text-xs text-red-400">{clientErrors.contactEmail}</p>
              )}
            </div>

            {/* Website URL */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-website" className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>Website URL</span>
              </Label>
              <Input
                id="tenant-website"
                placeholder="https://example.com"
                value={formData.websiteUrl}
                onChange={(e) => handleChange('websiteUrl', e.target.value)}
                disabled={loading}
                className={`bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs ${
                  clientErrors.websiteUrl ? 'border-red-500 focus-visible:ring-red-500' : ''
                }`}
              />
              {clientErrors.websiteUrl && (
                <p className="text-xs text-red-400">{clientErrors.websiteUrl}</p>
              )}
            </div>
          </div>

          {/* Initial Status (only on Create) */}
          {mode === 'create' && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-medium text-slate-200">Initial Status</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={formData.status === 'active'}
                    onChange={() => handleChange('status', 'active')}
                    className="accent-blue-500"
                  />
                  <span>Active (ready for chatbot config)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="status"
                    value="inactive"
                    checked={formData.status === 'inactive'}
                    onChange={() => handleChange('status', 'inactive')}
                    className="accent-blue-500"
                  />
                  <span>Inactive (draft/paused)</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/60">
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
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'create' ? 'Create Tenant' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
