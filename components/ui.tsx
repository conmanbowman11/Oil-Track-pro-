'use client';

// Shared UI pieces used by the main app and the Filter Sales / Customer Tracking screens.

import React, { useState, useRef, useEffect } from 'react';

// =============================================
// MODAL SHELL
// =============================================
export function ModalShell({
  title, children, onClose, onSave, saveLabel = 'Save', saveDisabled = false, size = 'sm', danger = false,
}: {
  title: string; children: React.ReactNode; onClose: () => void;
  onSave: () => Promise<void> | void; saveLabel?: string; saveDisabled?: boolean; size?: 'sm' | 'lg'; danger?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try { await onSave(); }
    catch (err: any) { setError(err?.message || 'Something went wrong. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mbg">
      <div className={`mdl ${size === 'sm' ? 'sm' : ''}`}>
        <div className="mh">
          <h3>{title}</h3>
          <button className="btn bs bg" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="mb2">{children}</div>
        {error && <div className="merr">{error}</div>}
        <div className="mf">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className={`btn ${danger ? 'bd2btn' : 'bp'}`} onClick={handleSave} disabled={saving || saveDisabled}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// LOCAL NUMBER INPUT
// Fixes typing lag by committing on blur/Enter instead of every keystroke.
// Prevents the whole work order from re-rendering + hitting Supabase per keystroke.
// =============================================
export function LocalNumberInput({
  value, onCommit, style, placeholder, step = '1', className, min, ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  step?: string;
  className?: string;
  min?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState<string>(value ? String(value) : '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setLocal(value ? String(value) : '');
  }, [value]);

  const commit = () => {
    focusedRef.current = false;
    const num = Number(local) || 0;
    if (num !== value) onCommit(num);
  };

  return (
    <input
      type="number"
      step={step}
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
      style={style}
      className={className}
      min={min}
      inputMode="decimal"
      aria-label={ariaLabel}
    />
  );
}


// =============================================
// NULLABLE NUMBER INPUT
// Like LocalNumberInput, but blank means "no value" (null) instead of 0.
// Blank means "no value" (null) rather than 0.
// =============================================
export function NullableNumberInput({
  value, onCommit, style, placeholder, step = '0.01', className, ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  step?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState<string>(value == null ? '' : String(value));
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(value == null ? '' : String(value)); }, [value]);
  const commit = () => {
    focusedRef.current = false;
    const next = local.trim() === '' || isNaN(Number(local)) ? null : Number(local);
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number" step={step} value={local} placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
      style={style} className={className} inputMode="decimal" aria-label={ariaLabel}
    />
  );
}

// =============================================
// COMMIT-ON-BLUR TEXT INPUT (avoids a database write per keystroke)
// =============================================
export function LocalTextInput({
  value, onCommit, placeholder, className, style, multiline = false,
}: {
  value: string; onCommit: (v: string) => void; placeholder?: string;
  className?: string; style?: React.CSSProperties; multiline?: boolean;
}) {
  const [local, setLocal] = useState(value || '');
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(value || ''); }, [value]);
  const commit = () => { focusedRef.current = false; if (local !== (value || '')) onCommit(local); };
  const common = {
    value: local, placeholder, className, style,
    onFocus: () => { focusedRef.current = true; },
    onBlur: commit,
  };
  return multiline
    ? <textarea {...common} onChange={e => setLocal(e.target.value)} />
    : <input {...common} onChange={e => setLocal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />;
}

// =============================================
// ICONS (same stroke icons as the main app)
// =============================================
export const IC = (d: string, s = 18) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const ICONS = {
  plus: 'M12 5v14 M5 12h14',
  check: 'M20 6L9 17l-5-5',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  print: 'M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z',
  phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z',
  mail: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z M22 6l-10 7L2 6',
  note: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 7a3 3 0 100 6 3 3 0 000-6z',
  text: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  truck: 'M1 3h15v13H1z M16 8h4l3 3v5h-7z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  wrench: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  bill: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  undo: 'M3 7v6h6 M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13',
  x: 'M18 6L6 18 M6 6l12 12',
  copy: 'M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  clock: 'M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v6l4 2',
};

// =============================================
// DATE HELPERS (local time, no UTC shift)
// =============================================
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
// MM/DD/YYYY for a YYYY-MM-DD date or a timestamp
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; }
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
// Value for <input type="datetime-local"> from a timestamp (local time)
export function toLocalInput(d: string | null | undefined): string {
  const t = d ? new Date(d) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}
// Local YYYY-MM-DD for a timestamp
export function isoDateOf(d: string | null | undefined): string {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d);
  if (isNaN(t.getTime())) return '';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
export function telHref(phone: string): string { return `tel:${(phone || '').replace(/[^0-9+]/g, '')}`; }

// file-saver is an old-style (CommonJS) module, so a dynamic import can hand back
// saveAs either directly or wrapped in `default` depending on the bundler.
export async function loadSaveAs(): Promise<(data: Blob, filename: string) => void> {
  const mod: any = await import('file-saver');
  return mod.saveAs || mod.default?.saveAs || mod.default;
}
