'use client';

// Customer Tracking (light CRM): contacts, activity log, follow-up reminders,
// and the per-customer timeline.

import React, { useMemo, useState } from 'react';
import type {
  Customer,
  CustomerContact,
  CustomerActivity,
  ActivityType,
  FollowUp,
  FilterOrder,
  FilterOrderItem,
  WorkOrder,
} from '@/types/database';
import { useCustomers, useUpdateCustomer, useWorkOrders } from '@/lib/hooks';
import {
  contactsApi,
  activitiesApi,
  followUpsApi,
  filterOrdersApi,
  filterOrderItemsApi,
  useSetPrimaryContact,
} from '@/lib/crmHooks';
import { calculateFilterOrderTotals, formatMoney } from '@/lib/calculations';
import {
  ModalShell, IC, ICONS, todayISO, addDaysISO, fmtDate, fmtDateTime, toLocalInput, isoDateOf, telHref,
} from '@/components/ui';

export type NavFn = (p: string, id: string, lbl: string) => void;
export type ToastFn = (msg: string, err?: boolean) => void;

// ─────────────────────────────────────────────
// Labels + small badges
// ─────────────────────────────────────────────
export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  service: 'Service', filter_only: 'Filter only', both: 'Service + Filters',
};
export function CustomerTypeBadge({ c }: { c: Customer }) {
  const t = c.customer_type || 'service';
  const cls = t === 'filter_only' ? 'tg' : t === 'both' ? 'tb' : 'tc';
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <span className={`tag ${cls}`}>{CUSTOMER_TYPE_LABEL[t] || t}</span>
      {c.status === 'inactive' && <span className="tag tgray">Inactive</span>}
    </span>
  );
}

const ACTIVITY_LABEL: Record<ActivityType, string> = { note: 'Note', call: 'Call', visit: 'Visit', text: 'Text', email: 'Email' };
const ACTIVITY_ICON: Record<ActivityType, string> = { note: ICONS.note, call: ICONS.phone, visit: ICONS.pin, text: ICONS.text, email: ICONS.mail };

export function orderLabel(o: { order_number: number }) { return `F-${o.order_number}`; }

// Follow-ups: overdue / due today / next 7 days
export function followUpBuckets(list: FollowUp[]) {
  const today = todayISO();
  const week = addDaysISO(today, 7);
  const open = list.filter(f => f.status === 'open');
  return {
    overdue: open.filter(f => f.due_date < today),
    today: open.filter(f => f.due_date === today),
    week: open.filter(f => f.due_date > today && f.due_date <= week),
    later: open.filter(f => f.due_date > week),
  };
}

// Count shown on the sidebar badge (overdue + due today)
export function useFollowUpBadgeCount(): number {
  const { data = [] } = followUpsApi.useList();
  const b = followUpBuckets(data);
  return b.overdue.length + b.today.length;
}

// ─────────────────────────────────────────────
// Contact modal
// ─────────────────────────────────────────────
function ContactModal({ customer, initial, isFirst, onClose, toast }: {
  customer: Customer; initial: CustomerContact | null; isFirst: boolean; onClose: () => void; toast: ToastFn;
}) {
  const create = contactsApi.useCreate();
  const update = contactsApi.useUpdate();
  const setPrimary = useSetPrimaryContact();
  const updateCustomer = useUpdateCustomer();
  const [f, setF] = useState<Partial<CustomerContact>>(initial || { name: '', role: '', phone: '', email: '', notes: '', is_primary: isFirst });

  return (
    <ModalShell title={initial ? 'Edit Contact' : 'Add Contact'} onClose={onClose} saveDisabled={!f.name?.trim()}
      onSave={async () => {
        const wantPrimary = !!f.is_primary;
        const fields = { name: f.name || '', role: f.role || '', phone: f.phone || '', email: f.email || '', notes: f.notes || '' };
        let id = initial?.contact_id;
        if (initial) await update.mutateAsync({ id: initial.contact_id, updates: fields });
        else id = (await create.mutateAsync({ ...fields, customer_id: customer.customer_id, is_primary: false })).contact_id;
        if (wantPrimary && id && !initial?.is_primary) await setPrimary.mutateAsync({ customer_id: customer.customer_id, contact_id: id });
        // Keep the customer's main contact name (used on invoices) in sync with the primary contact
        if (wantPrimary && fields.name !== customer.contact_name) {
          await updateCustomer.mutateAsync({ customer_id: customer.customer_id, updates: { contact_name: fields.name } });
        }
        toast(initial ? 'Contact updated' : 'Contact added');
        onClose();
      }}>
      <div className="fr">
        <div className="fld"><label>Name</label><input value={f.name || ''} onChange={e => setF(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
        <div className="fld"><label>Role</label><input value={f.role || ''} onChange={e => setF(p => ({ ...p, role: e.target.value }))} placeholder="Owner, Shop foreman, Office…" /></div>
      </div>
      <div className="fr">
        <div className="fld"><label>Phone</label><input type="tel" value={f.phone || ''} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} /></div>
        <div className="fld"><label>Email</label><input type="email" value={f.email || ''} onChange={e => setF(p => ({ ...p, email: e.target.value }))} /></div>
      </div>
      <div className="fld"><label>Notes</label><textarea value={f.notes || ''} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
      <label className="cbx">
        <input type="checkbox" checked={!!f.is_primary} disabled={!!initial?.is_primary} onChange={e => setF(p => ({ ...p, is_primary: e.target.checked }))} />
        Primary contact {initial?.is_primary && '(already primary)'}
      </label>
    </ModalShell>
  );
}

function ContactLinks({ phone, email }: { phone?: string; email?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {phone && <a className="btn bs" href={telHref(phone)} onClick={e => e.stopPropagation()}>{IC(ICONS.phone, 13)} {phone}</a>}
      {email && <a className="btn bs" href={`mailto:${email}`} onClick={e => e.stopPropagation()}>{IC(ICONS.mail, 13)} Email</a>}
    </span>
  );
}

function ContactsTab({ customer, toast, confirmDelete }: { customer: Customer; toast: ToastFn; confirmDelete: (what: string, fn: () => Promise<void>) => void }) {
  const { data: all = [] } = contactsApi.useList();
  const del = contactsApi.useDelete();
  const setPrimary = useSetPrimaryContact();
  const updateCustomer = useUpdateCustomer();
  const [modal, setModal] = useState<{ c: CustomerContact | null } | null>(null);
  const contacts = all.filter(c => c.customer_id === customer.customer_id)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

  return (
    <div className="card">
      <div className="ch">
        <h3>Contacts ({contacts.length})</h3>
        <button className="btn bs bp" onClick={() => setModal({ c: null })}>{IC(ICONS.plus, 15)} Add Contact</button>
      </div>
      {contacts.length === 0 ? <div className="empty"><p>No contacts yet. Add the owner, shop foreman, or office manager.</p></div> : (
        <div className="ctc-list">
          {contacts.map(c => (
            <div key={c.contact_id} className="ctc">
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name} {c.is_primary && <span className="tag tc">Primary</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{c.role || '—'}</div>
                {c.notes && <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{c.notes}</div>}
              </div>
              <ContactLinks phone={c.phone} email={c.email} />
              <div style={{ display: 'flex', gap: 4 }}>
                {!c.is_primary && <button className="btn bs bg" onClick={async () => {
                  try {
                    await setPrimary.mutateAsync({ customer_id: customer.customer_id, contact_id: c.contact_id });
                    await updateCustomer.mutateAsync({ customer_id: customer.customer_id, updates: { contact_name: c.name } });
                    toast(`${c.name} is now the primary contact`);
                  } catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
                }}>Make primary</button>}
                <button className="btn bs" aria-label="Edit contact" onClick={() => setModal({ c })}>{IC(ICONS.edit, 13)}</button>
                <button className="btn bs bd2btn" aria-label="Delete contact" onClick={() => confirmDelete(`contact "${c.name}"`, async () => { await del.mutateAsync(c.contact_id); toast('Contact deleted'); })}>{IC(ICONS.trash, 13)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <ContactModal customer={customer} initial={modal.c} isFirst={contacts.length === 0} onClose={() => setModal(null)} toast={toast} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Log activity (inline box or modal), with optional follow-up
// ─────────────────────────────────────────────
export function ActivityForm({ customerId, initial, prefillBody, mode, onDone, toast }: {
  customerId: string | null;          // null = pick a customer in the form
  initial?: CustomerActivity | null;  // edit an existing activity
  prefillBody?: string;
  mode: 'inline' | 'modal';
  onDone?: () => void;
  toast: ToastFn;
}) {
  const { data: customers = [] } = useCustomers();
  const { data: allContacts = [] } = contactsApi.useList();
  const create = activitiesApi.useCreate();
  const update = activitiesApi.useUpdate();
  const createFU = followUpsApi.useCreate();

  const blank = () => ({
    customer_id: customerId || '', type: 'call' as ActivityType, contact_id: '', body: prefillBody || '',
    when: toLocalInput(null), addFU: false, fuTitle: '', fuDue: addDaysISO(todayISO(), 7),
  });
  const [f, setF] = useState(() => initial ? {
    customer_id: initial.customer_id, type: initial.type, contact_id: initial.contact_id || '', body: initial.body,
    when: toLocalInput(initial.occurred_at), addFU: false, fuTitle: '', fuDue: addDaysISO(todayISO(), 7),
  } : blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const contacts = allContacts.filter(c => c.customer_id === f.customer_id);
  const canSave = !!f.customer_id && !!f.body.trim() && (!f.addFU || !!f.fuTitle.trim());

  const save = async () => {
    const row = {
      customer_id: f.customer_id, type: f.type, contact_id: f.contact_id || null, body: f.body.trim(),
      occurred_at: new Date(f.when).toISOString(),
    };
    if (initial) await update.mutateAsync({ id: initial.activity_id, updates: row });
    else await create.mutateAsync(row);
    if (f.addFU) {
      await createFU.mutateAsync({ customer_id: f.customer_id, contact_id: f.contact_id || null, title: f.fuTitle.trim(), due_date: f.fuDue, status: 'open' });
    }
    toast(initial ? 'Activity updated' : f.addFU ? 'Logged + follow-up set' : `${ACTIVITY_LABEL[f.type]} logged`);
    if (mode === 'inline') setF(blank());
    onDone?.();
  };

  const fields = (
    <>
      {!customerId && !initial && (
        <div className="fld"><label>Customer</label>
          <select value={f.customer_id} onChange={e => setF(p => ({ ...p, customer_id: e.target.value, contact_id: '' }))}>
            <option value="">— Select customer —</option>
            {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="chips" role="radiogroup" aria-label="Activity type">
        {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map(t => (
          <button key={t} type="button" className={`chip${f.type === t ? ' on' : ''}`} onClick={() => setF(p => ({ ...p, type: t }))}>
            {IC(ACTIVITY_ICON[t], 12)} {ACTIVITY_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="fld"><textarea value={f.body} onChange={e => setF(p => ({ ...p, body: e.target.value }))} placeholder="What happened? e.g. Called Joe — needs fuel filters before harvest" style={{ minHeight: 64 }} /></div>
      <div className="fr">
        <div className="fld"><label>Contact (optional)</label>
          <select value={f.contact_id} onChange={e => setF(p => ({ ...p, contact_id: e.target.value }))}>
            <option value="">— None —</option>
            {contacts.map(c => <option key={c.contact_id} value={c.contact_id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
          </select>
        </div>
        <div className="fld"><label>Date / time</label><input type="datetime-local" value={f.when} onChange={e => setF(p => ({ ...p, when: e.target.value }))} /></div>
      </div>
      {!initial && (
        <>
          <label className="cbx"><input type="checkbox" checked={f.addFU} onChange={e => setF(p => ({ ...p, addFU: e.target.checked }))} /> Add a follow-up</label>
          {f.addFU && (
            <div className="fr" style={{ marginTop: 8 }}>
              <div className="fld"><label>Follow-up</label><input value={f.fuTitle} onChange={e => setF(p => ({ ...p, fuTitle: e.target.value }))} placeholder="Call Joe about harvest filters" /></div>
              <div className="fld"><label>Due</label><input type="date" value={f.fuDue} onChange={e => setF(p => ({ ...p, fuDue: e.target.value }))} /></div>
            </div>
          )}
        </>
      )}
    </>
  );

  if (mode === 'modal') {
    return (
      <ModalShell title={initial ? 'Edit Activity' : 'Log Activity'} onClose={() => onDone?.()} onSave={save} saveDisabled={!canSave} saveLabel={initial ? 'Save' : 'Log it'}>
        {fields}
      </ModalShell>
    );
  }
  return (
    <div className="card">
      <div className="ch"><h3>Log activity</h3></div>
      {fields}
      {err && <div className="merr" style={{ margin: '8px 0' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn bp" disabled={!canSave || saving} onClick={async () => {
          setSaving(true); setErr(null);
          try { await save(); } catch (e: any) { setErr(e?.message || 'Failed to save'); } finally { setSaving(false); }
        }}>{saving ? 'Saving…' : 'Log it'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Follow-up create/edit modal
// ─────────────────────────────────────────────
export function FollowUpModal({ initial, customerId, relatedOrderId, defaultTitle, defaultDue, onClose, toast }: {
  initial?: FollowUp | null; customerId?: string | null; relatedOrderId?: string | null;
  defaultTitle?: string; defaultDue?: string; onClose: () => void; toast: ToastFn;
}) {
  const { data: customers = [] } = useCustomers();
  const { data: allContacts = [] } = contactsApi.useList();
  const create = followUpsApi.useCreate();
  const update = followUpsApi.useUpdate();
  const [f, setF] = useState(() => ({
    customer_id: initial?.customer_id || customerId || '',
    contact_id: initial?.contact_id || '',
    title: initial?.title || defaultTitle || '',
    notes: initial?.notes || '',
    due_date: initial?.due_date || defaultDue || addDaysISO(todayISO(), 1),
  }));
  const contacts = allContacts.filter(c => c.customer_id === f.customer_id);
  return (
    <ModalShell title={initial ? 'Edit Follow-up' : 'New Follow-up'} onClose={onClose} saveDisabled={!f.customer_id || !f.title.trim() || !f.due_date}
      onSave={async () => {
        const row = { customer_id: f.customer_id, contact_id: f.contact_id || null, title: f.title.trim(), notes: f.notes, due_date: f.due_date };
        if (initial) await update.mutateAsync({ id: initial.follow_up_id, updates: row });
        else await create.mutateAsync({ ...row, status: 'open', related_filter_order_id: relatedOrderId || null });
        toast(initial ? 'Follow-up updated' : `Follow-up set for ${fmtDate(f.due_date)}`);
        onClose();
      }}>
      {!customerId && (
        <div className="fld"><label>Customer</label>
          <select value={f.customer_id} onChange={e => setF(p => ({ ...p, customer_id: e.target.value, contact_id: '' }))} autoFocus>
            <option value="">— Select customer —</option>
            {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="fld"><label>What to do</label><input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="Call Joe about harvest filters" autoFocus={!!customerId} /></div>
      <div className="fr">
        <div className="fld"><label>Due date</label><input type="date" value={f.due_date} onChange={e => setF(p => ({ ...p, due_date: e.target.value }))} /></div>
        <div className="fld"><label>Contact (optional)</label>
          <select value={f.contact_id} onChange={e => setF(p => ({ ...p, contact_id: e.target.value }))}>
            <option value="">— None —</option>
            {contacts.map(c => <option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="chips">
        {[['Tomorrow', 1], ['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]].map(([l, d]) => (
          <button key={l} type="button" className={`chip${f.due_date === addDaysISO(todayISO(), d as number) ? ' on' : ''}`} onClick={() => setF(p => ({ ...p, due_date: addDaysISO(todayISO(), d as number) }))}>{l}</button>
        ))}
      </div>
      <div className="fld"><label>Notes</label><textarea value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────
// One follow-up row: Done / Snooze / Open customer
// ─────────────────────────────────────────────
function FollowUpRow({ fu, nav, toast, showCustomer = true, onLog, onEdit }: {
  fu: FollowUp; nav: NavFn; toast: ToastFn; showCustomer?: boolean;
  onLog: (fu: FollowUp) => void; onEdit: (fu: FollowUp) => void;
}) {
  const { data: customers = [] } = useCustomers();
  const { data: contacts = [] } = contactsApi.useList();
  const update = followUpsApi.useUpdate();
  const [picking, setPicking] = useState(false);
  const c = customers.find(x => x.customer_id === fu.customer_id);
  const contact = contacts.find(x => x.contact_id === fu.contact_id) || contacts.find(x => x.customer_id === fu.customer_id && x.is_primary);
  const phone = contact?.phone || c?.phone || '';
  const today = todayISO();
  const overdue = fu.status === 'open' && fu.due_date < today;
  const done = fu.status === 'done';

  const snooze = async (due: string) => {
    try { await update.mutateAsync({ id: fu.follow_up_id, updates: { due_date: due } }); toast(`Snoozed to ${fmtDate(due)}`); }
    catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
  };
  const base = fu.due_date > today ? fu.due_date : today;

  return (
    <div className={`fu-row${overdue ? ' overdue' : ''}${done ? ' done' : ''}`}>
      <div style={{ flex: 1, minWidth: 170, cursor: 'pointer' }} onClick={() => onEdit(fu)}>
        <div style={{ fontWeight: 600, fontSize: 13, textDecoration: done ? 'line-through' : 'none' }}>{fu.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx2)' }}>
          {showCustomer && <>{c?.name || 'Unknown customer'}{contact ? ` · ${contact.name}` : ''} · </>}
          <span style={{ color: overdue ? 'var(--rd)' : 'inherit', fontWeight: overdue ? 700 : 400 }}>
            {done ? `Done ${fmtDate(fu.completed_at)}` : `Due ${fmtDate(fu.due_date)}`}
          </span>
        </div>
        {fu.notes && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{fu.notes}</div>}
      </div>
      <div className="fu-actions">
        {phone && !done && <a className="btn bs" href={telHref(phone)} aria-label={`Call ${phone}`}>{IC(ICONS.phone, 13)}<span className="hide-sm"> Call</span></a>}
        {!done ? (
          <>
            <button className="btn bs bp" onClick={async () => {
              try {
                await update.mutateAsync({ id: fu.follow_up_id, updates: { status: 'done', completed_at: new Date().toISOString() } });
                onLog(fu);
              } catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
            }}>{IC(ICONS.check, 13)} Done</button>
            {picking ? (
              <input type="date" className="sort-sel" autoFocus defaultValue={addDaysISO(base, 1)}
                onBlur={() => setPicking(false)}
                onChange={e => { if (e.target.value) { snooze(e.target.value); setPicking(false); } }} />
            ) : (
              <select className="sort-sel" value="" aria-label="Snooze" onChange={e => {
                const v = e.target.value;
                if (v === 'pick') setPicking(true);
                else if (v) snooze(addDaysISO(base, Number(v)));
              }}>
                <option value="">Snooze…</option>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">1 week</option>
                <option value="pick">Pick a date…</option>
              </select>
            )}
          </>
        ) : (
          <button className="btn bs bg" onClick={() => update.mutate({ id: fu.follow_up_id, updates: { status: 'open', completed_at: null } })}>{IC(ICONS.undo, 13)} Reopen</button>
        )}
        {showCustomer && c && <button className="btn bs bg" onClick={() => nav('cust', c.customer_id, c.name)}>Open</button>}
      </div>
    </div>
  );
}

// After marking a follow-up done: offer to log what happened
function DoneLogPrompt({ fu, onClose, toast }: { fu: FollowUp; onClose: () => void; toast: ToastFn }) {
  const [logging, setLogging] = useState(false);
  if (logging) return <ActivityForm mode="modal" customerId={fu.customer_id} prefillBody={`Follow-up "${fu.title}": `} onDone={onClose} toast={toast} />;
  return (
    <div className="mbg">
      <div className="mdl sm">
        <div className="mh"><h3>Follow-up done</h3><button className="btn bs bg" onClick={onClose}>✕</button></div>
        <div className="mb2"><p style={{ fontSize: 13 }}>Marked <strong>{fu.title}</strong> as done. Log what happened?</p></div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Skip</button>
          <button className="btn bp" onClick={() => setLogging(true)}>Log what happened</button>
        </div>
      </div>
    </div>
  );
}

// Shared state + modals for any list of follow-up rows
function useFollowUpModals(toast: ToastFn) {
  const [logFor, setLogFor] = useState<FollowUp | null>(null);
  const [editFor, setEditFor] = useState<FollowUp | null>(null);
  const modals = (
    <>
      {logFor && <DoneLogPrompt fu={logFor} onClose={() => setLogFor(null)} toast={toast} />}
      {editFor && <FollowUpModal initial={editFor} customerId={editFor.customer_id} onClose={() => setEditFor(null)} toast={toast} />}
    </>
  );
  return { onLog: setLogFor, onEdit: setEditFor, modals };
}

// ─────────────────────────────────────────────
// Dashboard widget
// ─────────────────────────────────────────────
export function FollowUpsWidget({ nav, toast }: { nav: NavFn; toast: ToastFn }) {
  const { data = [], isLoading } = followUpsApi.useList();
  const [adding, setAdding] = useState(false);
  const { onLog, onEdit, modals } = useFollowUpModals(toast);
  const b = followUpBuckets(data);
  const sections: [string, FollowUp[], string][] = [
    ['Overdue', b.overdue, 'var(--rd)'], ['Due Today', b.today, 'var(--am)'], ['Next 7 Days', b.week, 'var(--bl)'],
  ];
  const empty = !b.overdue.length && !b.today.length && !b.week.length;
  return (
    <div className="card">
      <div className="ch">
        <h3>{IC(ICONS.bell, 15)} Follow-ups</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn bs bg" onClick={() => nav('followups', '', 'Follow-ups')}>See all</button>
          <button className="btn bs bp" onClick={() => setAdding(true)}>{IC(ICONS.plus, 14)} Follow-up</button>
        </div>
      </div>
      {isLoading ? <div className="loading">Loading…</div> : empty ? (
        <div className="empty" style={{ padding: 16 }}><p>Nothing due this week.{b.later.length ? ` ${b.later.length} scheduled later.` : ''}</p></div>
      ) : sections.filter(([, list]) => list.length).map(([label, list, color]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div className="fu-sec" style={{ color }}>{label} ({list.length})</div>
          {list.map(fu => <FollowUpRow key={fu.follow_up_id} fu={fu} nav={nav} toast={toast} onLog={onLog} onEdit={onEdit} />)}
        </div>
      ))}
      {adding && <FollowUpModal onClose={() => setAdding(false)} toast={toast} />}
      {modals}
    </div>
  );
}

// ─────────────────────────────────────────────
// Full Follow-ups page
// ─────────────────────────────────────────────
export function FollowUpsPage({ nav, toast }: { nav: NavFn; toast: ToastFn }) {
  const { data = [], isLoading } = followUpsApi.useList();
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open');
  const [asc, setAsc] = useState(true);
  const [adding, setAdding] = useState(false);
  const { onLog, onEdit, modals } = useFollowUpModals(toast);
  const list = data
    .filter(f => show === 'all' || f.status === show)
    .sort((a, b) => (asc ? 1 : -1) * a.due_date.localeCompare(b.due_date));
  const b = followUpBuckets(data);
  return (
    <>
      <div className="stats">
        <div className="st"><div className="st-l">Overdue</div><div className="st-v" style={{ color: b.overdue.length ? 'var(--rd)' : 'var(--gn)' }}>{b.overdue.length}</div></div>
        <div className="st"><div className="st-l">Due Today</div><div className="st-v" style={{ color: b.today.length ? 'var(--am)' : 'var(--gn)' }}>{b.today.length}</div></div>
        <div className="st"><div className="st-l">Next 7 Days</div><div className="st-v" style={{ color: 'var(--bl)' }}>{b.week.length}</div></div>
        <div className="st"><div className="st-l">Later</div><div className="st-v" style={{ color: 'var(--tx2)' }}>{b.later.length}</div></div>
      </div>
      <div className="card">
        <div className="ch">
          <h3>Follow-ups ({list.length})</h3>
          <button className="btn bs bp" onClick={() => setAdding(true)}>{IC(ICONS.plus, 14)} Follow-up</button>
        </div>
        <div className="chips">
          {(['open', 'done', 'all'] as const).map(s => (
            <button key={s} className={`chip${show === s ? ' on' : ''}`} onClick={() => setShow(s)}>{s === 'open' ? 'Open' : s === 'done' ? 'Completed' : 'All'}</button>
          ))}
          <button className="chip" onClick={() => setAsc(a => !a)}>Due date {asc ? '↑ soonest' : '↓ latest'}</button>
        </div>
        {isLoading ? <div className="loading">Loading…</div> : list.length === 0 ? <div className="empty"><p>No follow-ups here.</p></div> :
          list.map(fu => <FollowUpRow key={fu.follow_up_id} fu={fu} nav={nav} toast={toast} onLog={onLog} onEdit={onEdit} />)}
      </div>
      {adding && <FollowUpModal onClose={() => setAdding(false)} toast={toast} />}
      {modals}
    </>
  );
}

// ─────────────────────────────────────────────
// Timeline: one merged list per customer (built from the real records)
// ─────────────────────────────────────────────
type TLKind = 'activity' | 'followup' | 'order' | 'service' | 'invoice';
interface TLItem {
  key: string; at: string; kind: TLKind; icon: string; title: string; detail?: string;
  onClick?: () => void; activity?: CustomerActivity;
}

function useCustomerTimeline(customerId: string, nav: NavFn): TLItem[] {
  const { data: activities = [] } = activitiesApi.useList();
  const { data: followUps = [] } = followUpsApi.useList();
  const { data: orders = [] } = filterOrdersApi.useList();
  const { data: items = [] } = filterOrderItemsApi.useList();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: contacts = [] } = contactsApi.useList();

  return useMemo(() => {
    const out: TLItem[] = [];
    const contactName = (id: string | null) => contacts.find(c => c.contact_id === id)?.name;
    activities.filter(a => a.customer_id === customerId).forEach(a => out.push({
      key: `a-${a.activity_id}`, at: a.occurred_at, kind: 'activity', icon: ACTIVITY_ICON[a.type] || ICONS.note,
      title: `${ACTIVITY_LABEL[a.type] || a.type}${contactName(a.contact_id) ? ` with ${contactName(a.contact_id)}` : ''}`,
      detail: a.body, activity: a,
    }));
    followUps.filter(f => f.customer_id === customerId).forEach(f => {
      out.push({ key: `fc-${f.follow_up_id}`, at: f.created_at, kind: 'followup', icon: ICONS.bell, title: `Follow-up set: ${f.title}`, detail: `Due ${fmtDate(f.due_date)}` });
      if (f.status === 'done' && f.completed_at) out.push({ key: `fd-${f.follow_up_id}`, at: f.completed_at, kind: 'followup', icon: ICONS.check, title: `Follow-up done: ${f.title}` });
    });
    orders.filter(o => o.customer_id === customerId).forEach(o => {
      const its = items.filter(i => i.filter_order_id === o.filter_order_id);
      const t = calculateFilterOrderTotals(its, o.tax_rate_percent);
      const open = () => nav('forder', o.filter_order_id, orderLabel(o));
      const steps: [string | null, string][] = [
        [o.requested_at, 'requested'], [o.ordered_at, 'ordered'], [o.delivered_at, 'delivered'], [o.paid_at, 'paid'], [o.cancelled_at, 'cancelled'],
      ];
      steps.forEach(([at, step]) => {
        if (at) out.push({ key: `o-${o.filter_order_id}-${step}`, at, kind: 'order', icon: ICONS.filter, title: `Filter order ${orderLabel(o)} ${step}`, detail: `${t.item_count} filter${t.item_count === 1 ? '' : 's'} · ${formatMoney(t.total)}`, onClick: open });
      });
      if (o.billed && o.billed_at) out.push({ key: `ob-${o.filter_order_id}`, at: o.billed_at, kind: 'invoice', icon: ICONS.bill, title: `Invoice ${o.invoice_number ? `INV-${o.invoice_number}` : ''} billed (filters)`, detail: formatMoney(t.total), onClick: open });
    });
    workOrders.filter(w => w.customer_id === customerId).forEach((w: WorkOrder) => {
      const open = () => nav('wo', w.work_order_id, w.tier);
      out.push({ key: `w-${w.work_order_id}`, at: w.completed_at || w.service_date, kind: 'service', icon: ICONS.wrench, title: `Service: ${w.tier}`, detail: `${w.status === 'complete' ? 'Completed' : 'Open'} · ${formatMoney(w.total_retail)}`, onClick: open });
      if (w.billed && w.billed_at) out.push({ key: `wb-${w.work_order_id}`, at: w.billed_at, kind: 'invoice', icon: ICONS.bill, title: `Invoice ${w.invoice_number ? `INV-${w.invoice_number}` : ''} billed (service)`, detail: formatMoney(w.total_retail), onClick: open });
    });
    // Date-only values (service_date) sort as midday so they land sensibly among timestamps
    const ts = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s).getTime() || 0;
    return out.sort((a, b) => ts(b.at) - ts(a.at));
  }, [customerId, activities, followUps, orders, items, workOrders, contacts, nav]);
}

const TL_FILTERS: [TLKind | 'all', string][] = [['all', 'All'], ['activity', 'Notes & calls'], ['followup', 'Follow-ups'], ['order', 'Filter orders'], ['service', 'Services'], ['invoice', 'Invoices']];

function TimelineList({ items, toast, confirmDelete, limit }: { items: TLItem[]; toast: ToastFn; confirmDelete: (what: string, fn: () => Promise<void>) => void; limit?: number }) {
  const del = activitiesApi.useDelete();
  const [editing, setEditing] = useState<CustomerActivity | null>(null);
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) return <div className="empty" style={{ padding: 16 }}><p>Nothing here yet.</p></div>;
  return (
    <>
      <div className="tl">
        {shown.map(it => (
          <div key={it.key} className={`tl-item tl-${it.kind}`} onClick={it.onClick} style={{ cursor: it.onClick ? 'pointer' : 'default' }}>
            <div className="tl-ic">{IC(it.icon, 14)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{it.title}</span>
                <span className="m" style={{ color: 'var(--tx3)', fontSize: 11 }}>{/^\d{4}-\d{2}-\d{2}$/.test(it.at) ? fmtDate(it.at) : fmtDateTime(it.at)}</span>
              </div>
              {it.detail && <div style={{ fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{it.detail}</div>}
              {it.activity && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button className="btn bs bg" onClick={() => setEditing(it.activity!)}>{IC(ICONS.edit, 12)} Edit</button>
                  <button className="btn bs bg" onClick={() => confirmDelete('this activity', async () => { await del.mutateAsync(it.activity!.activity_id); toast('Activity deleted'); })}>{IC(ICONS.trash, 12)} Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <ActivityForm mode="modal" customerId={editing.customer_id} initial={editing} onDone={() => setEditing(null)} toast={toast} />}
    </>
  );
}

// ─────────────────────────────────────────────
// Customer detail tabs
// ─────────────────────────────────────────────
type CustTab = 'overview' | 'contacts' | 'timeline' | 'equipment' | 'orders' | 'services';

export function CustomerTabs({ customer, nav, toast, confirmDelete, renderEquipment, renderServices, renderFilterOrders }: {
  customer: Customer; nav: NavFn; toast: ToastFn;
  confirmDelete: (what: string, fn: () => Promise<void>) => void;
  renderEquipment: () => React.ReactNode;
  renderServices: () => React.ReactNode;
  renderFilterOrders: () => React.ReactNode;
}) {
  const isFilterOnly = customer.customer_type === 'filter_only';
  const [tab, setTab] = useState<CustTab>('overview');
  const [tlFilter, setTlFilter] = useState<TLKind | 'all'>('all');
  const [addingFU, setAddingFU] = useState(false);
  const { onLog, onEdit, modals } = useFollowUpModals(toast);

  const { data: contacts = [] } = contactsApi.useList();
  const { data: followUps = [] } = followUpsApi.useList();
  const { data: orders = [] } = filterOrdersApi.useList();
  const { data: items = [] } = filterOrderItemsApi.useList();
  const { data: workOrders = [] } = useWorkOrders();
  const timeline = useCustomerTimeline(customer.customer_id, nav);

  const myContacts = contacts.filter(c => c.customer_id === customer.customer_id);
  const primary = myContacts.find(c => c.is_primary);
  const myFUs = followUps.filter(f => f.customer_id === customer.customer_id && f.status === 'open').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const myOrders = orders.filter(o => o.customer_id === customer.customer_id);
  const myWOs = workOrders.filter(w => w.customer_id === customer.customer_id);
  const openOrders = myOrders.filter(o => !['paid', 'cancelled'].includes(o.status)).length;
  const orderTotal = (o: FilterOrder) => calculateFilterOrderTotals(items.filter((i: FilterOrderItem) => i.filter_order_id === o.filter_order_id), o.tax_rate_percent).total;
  const unbilled =
    myWOs.filter(w => w.status === 'complete' && !w.billed).reduce((s, w) => s + (w.total_retail || 0), 0) +
    myOrders.filter(o => ['delivered', 'paid'].includes(o.status) && !o.billed).reduce((s, o) => s + orderTotal(o), 0);
  const lastService = myWOs.filter(w => w.status === 'complete').map(w => w.service_date).sort().reverse()[0];

  const tabs: [CustTab, string, number | null][] = [
    ['overview', 'Overview', null], ['contacts', 'Contacts', myContacts.length], ['timeline', 'Timeline', null],
    ['equipment', 'Equipment', null], ['orders', 'Filter Orders', myOrders.length], ['services', 'Services', myWOs.length],
  ];

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label, ct]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}{ct ? <span className="ct">{ct}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stats">
            <div className="st"><div className="st-l">Open filter orders</div><div className="st-v" style={{ color: 'var(--ac)' }}>{openOrders}</div></div>
            <div className="st"><div className="st-l">Unbilled</div><div className="st-v" style={{ color: unbilled ? 'var(--am)' : 'var(--gn)' }}>{formatMoney(unbilled)}</div></div>
            <div className="st"><div className="st-l">Last service</div><div className="st-v" style={{ fontSize: 16 }}>{lastService ? fmtDate(lastService) : (isFilterOnly ? 'n/a' : '—')}</div></div>
            <div className="st"><div className="st-l">Open follow-ups</div><div className="st-v" style={{ color: myFUs.some(f => f.due_date < todayISO()) ? 'var(--rd)' : 'var(--bl)' }}>{myFUs.length}</div></div>
          </div>
          <div className="card">
            <div className="ch"><h3>Primary contact</h3><button className="btn bs bg" onClick={() => setTab('contacts')}>All contacts</button></div>
            {primary ? (
              <div className="ctc" style={{ border: 'none', padding: 0 }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{primary.name}</div><div style={{ fontSize: 12, color: 'var(--tx2)' }}>{primary.role || '—'}</div></div>
                <ContactLinks phone={primary.phone || customer.phone} email={primary.email || customer.email} />
              </div>
            ) : (
              <div className="ctc" style={{ border: 'none', padding: 0 }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--tx2)' }}>{customer.contact_name || 'No contact yet'}</div>
                <ContactLinks phone={customer.phone} email={customer.email} />
              </div>
            )}
          </div>
          <div className="card">
            <div className="ch"><h3>Open follow-ups ({myFUs.length})</h3><button className="btn bs bp" onClick={() => setAddingFU(true)}>{IC(ICONS.plus, 14)} Follow-up</button></div>
            {myFUs.length === 0 ? <div className="empty" style={{ padding: 12 }}><p>None open.</p></div> :
              myFUs.map(fu => <FollowUpRow key={fu.follow_up_id} fu={fu} nav={nav} toast={toast} showCustomer={false} onLog={onLog} onEdit={onEdit} />)}
          </div>
          <ActivityForm mode="inline" customerId={customer.customer_id} toast={toast} />
          <div className="card">
            <div className="ch"><h3>Recent activity</h3><button className="btn bs bg" onClick={() => setTab('timeline')}>Full timeline</button></div>
            <TimelineList items={timeline} toast={toast} confirmDelete={confirmDelete} limit={5} />
          </div>
        </>
      )}

      {tab === 'contacts' && <ContactsTab customer={customer} toast={toast} confirmDelete={confirmDelete} />}

      {tab === 'timeline' && (
        <>
          <ActivityForm mode="inline" customerId={customer.customer_id} toast={toast} />
          <div className="card">
            <div className="ch"><h3>Timeline</h3><button className="btn bs" onClick={() => setAddingFU(true)}>{IC(ICONS.plus, 14)} Follow-up</button></div>
            <div className="chips">
              {TL_FILTERS.map(([k, l]) => <button key={k} className={`chip${tlFilter === k ? ' on' : ''}`} onClick={() => setTlFilter(k)}>{l}</button>)}
            </div>
            <TimelineList items={tlFilter === 'all' ? timeline : timeline.filter(t => t.kind === tlFilter)} toast={toast} confirmDelete={confirmDelete} />
          </div>
        </>
      )}

      {tab === 'equipment' && renderEquipment()}
      {tab === 'orders' && renderFilterOrders()}
      {tab === 'services' && renderServices()}

      {addingFU && <FollowUpModal customerId={customer.customer_id} onClose={() => setAddingFU(false)} toast={toast} />}
      {modals}
    </>
  );
}

// Customers with an overdue follow-up (for the customer list icon)
export function useOverdueCustomerIds(): Set<string> {
  const { data = [] } = followUpsApi.useList();
  const today = todayISO();
  return useMemo(() => new Set(data.filter(f => f.status === 'open' && f.due_date < today).map(f => f.customer_id)), [data, today]);
}

export { isoDateOf };
