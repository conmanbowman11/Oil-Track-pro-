'use client';

// Filter Sales: filter orders, supplier order list, filters on each machine,
// filter invoice PDF, and billing for filter orders.

import React, { useEffect, useMemo, useState } from 'react';
import type {
  Customer, CompanySettings, FilterOrder, FilterOrderItem, FilterOrderStatus, FleetUnit, Part, CustomerContact,
} from '@/types/database';
import {
  useCustomers, useCreateCustomer, useParts, useCreatePart, useFleetUnits, useCompanySettings,
  useUpsertCompanySettings, useServiceTemplates, useWorkOrders,
} from '@/lib/hooks';
import { contactsApi, filterOrdersApi, filterOrderItemsApi, equipmentFiltersApi, followUpsApi } from '@/lib/crmHooks';
import {
  calculateFilterOrderTotals, discountedPrice, partDiscountPct, effectiveDiscountPct, formatPct, formatMoney, round2,
} from '@/lib/calculations';
import {
  ModalShell, LocalNumberInput, LocalTextInput, IC, ICONS, fmtDate, todayISO, addDaysISO, telHref, loadSaveAs,
} from '@/components/ui';
import { FollowUpModal, orderLabel, type NavFn, type ToastFn } from '@/components/crm';

export type ConfirmFn = (what: string, fn: () => Promise<void>, opts?: { title: string; message: string; label: string }) => void;

// ─────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────
export const STEPS: Exclude<FilterOrderStatus, 'cancelled'>[] = ['requested', 'ordered', 'received', 'delivered', 'paid'];
export const STATUS_LABEL: Record<FilterOrderStatus, string> = {
  requested: 'Requested', ordered: 'Ordered', received: 'Received', delivered: 'Delivered', paid: 'Paid', cancelled: 'Cancelled',
};
const STATUS_CLS: Record<FilterOrderStatus, string> = {
  requested: 'ta', ordered: 'tb', received: 'tb', delivered: 'tg', paid: 'tg', cancelled: 'tgray',
};
const NEXT_LABEL: Record<string, string> = { requested: 'Mark Ordered', ordered: 'Mark Received', received: 'Mark Delivered', delivered: 'Mark Paid' };
const AT_COL: Record<FilterOrderStatus, keyof FilterOrder> = {
  requested: 'requested_at', ordered: 'ordered_at', received: 'received_at', delivered: 'delivered_at', paid: 'paid_at', cancelled: 'cancelled_at',
};

export function StatusBadge({ s }: { s: FilterOrderStatus }) {
  return <span className={`tag ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>;
}
export function nextStatus(s: FilterOrderStatus): FilterOrderStatus | null {
  const i = STEPS.indexOf(s as any);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}
// Moving back one step: clear the current step's timestamp
function undoUpdates(o: FilterOrder): Partial<FilterOrder> | null {
  if (o.status === 'cancelled') {
    let back: FilterOrderStatus = 'requested';
    for (const s of STEPS) if (o[AT_COL[s]]) back = s;
    return { status: back, cancelled_at: null };
  }
  const i = STEPS.indexOf(o.status as any);
  if (i <= 0) return null;
  return { status: STEPS[i - 1], [AT_COL[o.status]]: null } as Partial<FilterOrder>;
}
export function lastUpdated(o: FilterOrder): string {
  return [o.updated_at, o.requested_at, o.ordered_at, o.received_at, o.delivered_at, o.paid_at, o.cancelled_at, o.billed_at]
    .filter(Boolean).sort().reverse()[0] as string || o.created_at;
}
export function unitLabel(u?: FleetUnit | null): string {
  if (!u) return '';
  return `${u.unit_number}${u.nickname ? ` — ${u.nickname}` : u.type ? ` — ${u.type}` : ''}`;
}

// Items for each order, plus totals
export function useOrderTotals() {
  const { data: items = [] } = filterOrderItemsApi.useList();
  return useMemo(() => {
    const byOrder: Record<string, FilterOrderItem[]> = {};
    items.forEach(i => { (byOrder[i.filter_order_id] ||= []).push(i); });
    return {
      items, byOrder,
      totals: (o: FilterOrder) => calculateFilterOrderTotals(byOrder[o.filter_order_id] || [], o.tax_rate_percent),
    };
  }, [items]);
}

// Shared hook: change status (with timestamps), stamp updated_at
function useStatusChanger(toast: ToastFn) {
  const update = filterOrdersApi.useUpdate();
  const updateMany = filterOrdersApi.useUpdateMany();
  const now = () => new Date().toISOString();
  return {
    advance: async (o: FilterOrder, to: FilterOrderStatus, extra: Partial<FilterOrder> = {}) => {
      await update.mutateAsync({ id: o.filter_order_id, updates: { status: to, [AT_COL[to]]: now(), updated_at: now(), ...extra } as any });
      toast(`${orderLabel(o)} marked ${STATUS_LABEL[to].toLowerCase()}`);
    },
    advanceMany: async (ids: string[], to: FilterOrderStatus, extra: Partial<FilterOrder> = {}) => {
      await updateMany.mutateAsync({ ids, updates: { status: to, [AT_COL[to]]: now(), updated_at: now(), ...extra } as any });
      toast(`${ids.length} order${ids.length === 1 ? '' : 's'} marked ${STATUS_LABEL[to].toLowerCase()}`);
    },
    undo: async (o: FilterOrder) => {
      const u = undoUpdates(o);
      if (!u) return;
      await update.mutateAsync({ id: o.filter_order_id, updates: { ...u, updated_at: now() } });
      toast(`${orderLabel(o)} moved back to ${STATUS_LABEL[u.status as FilterOrderStatus].toLowerCase()}`);
    },
  };
}

// ─────────────────────────────────────────────
// Billing (shares the INV- counter with work orders)
// ─────────────────────────────────────────────
export function useFilterBilling(toast: ToastFn) {
  const { data: company } = useCompanySettings();
  const upsertCompany = useUpsertCompanySettings();
  const update = filterOrdersApi.useUpdate();
  return async (o: FilterOrder, nowBilled: boolean) => {
    try {
      const updates: Partial<FilterOrder> = { billed: nowBilled, billed_at: nowBilled ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
      if (nowBilled && !o.invoice_number && company) {
        const next = Number(company.next_invoice_number || 1150);
        updates.invoice_number = next;
        await upsertCompany.mutateAsync({ ...company, next_invoice_number: next + 1 });
      }
      await update.mutateAsync({ id: o.filter_order_id, updates });
      toast(nowBilled ? `Marked billed${!o.invoice_number && updates.invoice_number ? ` as INV-${updates.invoice_number}` : ''}` : 'Marked unbilled');
    } catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
  };
}

// ─────────────────────────────────────────────
// Filter invoice PDF (same look as the work order invoice PDF)
// ─────────────────────────────────────────────
export async function buildFilterInvoicePdfBlob(args: {
  order: FilterOrder; items: FilterOrderItem[]; customer?: Customer; contact?: CustomerContact;
  units: FleetUnit[]; company?: CompanySettings | null;
}): Promise<Blob> {
  const { order, items, customer: c, contact, units, company } = args;
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod: any = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;
  const t = calculateFilterOrderTotals(items, order.tax_rate_percent);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 40, mr = 40, mt = 40;

  // Header
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0);
  doc.text(company?.company_name || 'Your Company', ml, mt);
  if (company?.address) {
    doc.setFontSize(8).setTextColor(68);
    company.address.split('\n').forEach((line, i) => doc.text(line, ml, mt + 12 + i * 10));
  }
  doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(0);
  doc.text('INVOICE', pw - mr, mt + 5, { align: 'right' });
  doc.setFontSize(11).setFont('helvetica', 'normal');
  doc.text(order.invoice_number ? `#${order.invoice_number}` : 'Unbilled', pw - mr, mt + 22, { align: 'right' });
  doc.setFontSize(8).setTextColor(68);
  const invDate = order.billed_at || order.delivered_at || new Date().toISOString();
  doc.text(`Filter Order: ${orderLabel(order)}`, pw - mr, mt + 36, { align: 'right' });
  doc.text(`Date: ${fmtDate(invDate)}`, pw - mr, mt + 48, { align: 'right' });
  doc.text(`Terms: ${company?.payment_terms || 'Net 15'}`, pw - mr, mt + 60, { align: 'right' });

  // Bill To (window envelope position)
  const btY = 170;
  doc.setFontSize(8).setTextColor(140);
  doc.text('BILL TO', ml, btY);
  doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(0);
  doc.text(c?.name || '', ml, btY + 14);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  let y = btY + 28;
  const attn = contact?.name || c?.contact_name;
  if (attn) { doc.text(attn, ml, y); y += 12; }
  if (c?.billing_address) c.billing_address.split('\n').forEach(line => { doc.text(line, ml, y); y += 12; });
  const phone = contact?.phone || c?.phone;
  if (phone) { doc.text(`Phone: ${phone}`, ml, y); y += 12; }

  // Line items. Orders priced with a discount show Retail / Discount / Price;
  // older orders (no retail saved on the lines) print exactly as before.
  const discLayout = items.some(i => Number(i.retail_price) > 0);
  const machineOf = (i: FilterOrderItem) => { const u = units.find(x => x.unit_id === i.unit_id); return u ? u.unit_number : ''; };
  const head = { fillColor: [255, 255, 255] as [number, number, number], textColor: 0, fontStyle: 'bold' as const, lineWidth: 0.5, lineColor: [0, 0, 0] as [number, number, number] };
  let endY = 310;
  if (discLayout) {
    autoTable(doc, {
      startY: 300,
      head: [['Part #', 'Description', 'Machine', 'Qty', 'Retail', 'Discount', 'Price', 'Total']],
      body: items.map(i => [
        i.part_number, i.description, machineOf(i), String(i.quantity),
        Number(i.retail_price) > 0 ? formatMoney(i.retail_price) : '', Number(i.retail_price) > 0 ? itemDiscountText(i) : '',
        formatMoney(i.unit_price), formatMoney(round2(i.quantity * i.unit_price)),
      ]),
      styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
      headStyles: head,
      columnStyles: {
        0: { cellWidth: 64, fontStyle: 'bold' }, 2: { cellWidth: 50 },
        3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 54 }, 5: { halign: 'right', cellWidth: 50 },
        6: { halign: 'right', cellWidth: 54 }, 7: { halign: 'right', cellWidth: 60 },
      },
      margin: { left: ml, right: mr },
    });
    endY = (doc as any).lastAutoTable.finalY || endY;
    if (t.savings > 0) {
      doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(0);
      doc.text(`Parts discount savings: ${formatMoney(t.savings)}`, pw - mr, endY + 14, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      endY += 14;
    }
  } else {
    autoTable(doc, {
      startY: 300,
      head: [['Part #', 'Description', 'Machine', 'Qty', 'Unit Price', 'Total']],
      body: items.map(i => [i.part_number, i.description, machineOf(i), String(i.quantity), formatMoney(i.unit_price), formatMoney(round2(i.quantity * i.unit_price))]),
      styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
      headStyles: head,
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' }, 2: { cellWidth: 60 },
        3: { halign: 'right', cellWidth: 40 }, 4: { halign: 'right', cellWidth: 65 }, 5: { halign: 'right', cellWidth: 70 },
      },
      margin: { left: ml, right: mr },
    });
    endY = (doc as any).lastAutoTable.finalY || endY;
  }

  // Totals (right-aligned)
  let cy = Math.max(endY + 24, ph - 200);
  const labelX = pw - mr - 180, valX = pw - mr;
  doc.setFontSize(10).setTextColor(0).setFont('helvetica', 'normal');
  doc.text('Subtotal', labelX, cy); doc.text(formatMoney(t.subtotal), valX, cy, { align: 'right' }); cy += 13;
  doc.text(`Tax (${order.tax_rate_percent}%)`, labelX, cy); doc.text(formatMoney(t.tax_amount), valX, cy, { align: 'right' }); cy += 18;
  doc.setLineWidth(1).setDrawColor(0);
  doc.line(labelX, cy - 4, valX, cy - 4);
  doc.setFont('helvetica', 'bold').setFontSize(12);
  doc.text('TOTAL', labelX, cy + 8);
  doc.text(formatMoney(t.total), valX, cy + 8, { align: 'right' });
  doc.setLineWidth(0.75);
  doc.line(labelX, cy + 14, valX, cy + 14);
  doc.line(labelX, cy + 17, valX, cy + 17);

  if (order.notes) {
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(90);
    doc.text('Notes:', ml, ph - 90);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    doc.text(doc.splitTextToSize(order.notes, pw - ml - mr), ml, ph - 80);
  }

  // Footer
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100);
  doc.setLineWidth(0.5).setDrawColor(150);
  doc.line(ml, ph - 50, pw - mr, ph - 50);
  const footerBits = [company?.company_name, company?.address?.replace(/\n/g, ', '), company?.phone, company?.email].filter(Boolean);
  if (footerBits.length) doc.text(doc.splitTextToSize(footerBits.join(' · '), pw - ml - mr), pw / 2, ph - 38, { align: 'center' });
  if (company?.invoice_footer_notes) {
    doc.setFontSize(7).setTextColor(120);
    doc.text(doc.splitTextToSize(company.invoice_footer_notes, pw - ml - mr), pw / 2, ph - 22, { align: 'center' });
  }
  return doc.output('blob');
}

export function filterInvoiceFileName(o: FilterOrder, c?: Customer): string {
  const who = (c?.name || 'customer').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 30);
  return `${o.invoice_number ? `INV-${o.invoice_number}` : orderLabel(o)}_${who}.pdf`;
}

// Discount shown on a filter invoice line: "—" when sold at full retail
// (no-discount parts / 0% customers) unless the price was changed by hand
function itemDiscountText(i: FilterOrderItem): string {
  if (!i.price_overridden && (Number(i.discount_pct) || 0) === 0) return '—';
  return formatPct(effectiveDiscountPct(Number(i.retail_price), Number(i.unit_price)));
}

// Retail / discount / below-cost info shown under a line on order screens (never on invoices)
function LinePriceInfo({ retail, price, cost, noDiscount }: { retail: number; price: number; cost: number; noDiscount?: boolean }) {
  const below = price < (Number(cost) || 0);
  return (
    <span style={{ fontSize: 11, color: 'var(--tx3)', display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {retail > 0 && <span className="m">Retail {formatMoney(retail)} · {formatPct(effectiveDiscountPct(retail, price))} off</span>}
      {noDiscount && <span className="tag nodisc">No discount</span>}
      {below && <span className="below-cost-tag" style={{ marginLeft: 0 }}>Below cost ({formatMoney(cost)})</span>}
    </span>
  );
}

// ─────────────────────────────────────────────
// Catalog picker (search + "add a new filter to the catalog")
// ─────────────────────────────────────────────
function CatalogPicker({ onPick, toast }: { onPick: (p: Part) => void; toast: ToastFn }) {
  const { data: parts = [] } = useParts();
  const { data: company } = useCompanySettings();
  const createPart = useCreatePart();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ part_number: '', description: '', manufacturer: '', category: 'Oil Filter', cost: 0, retail: 0 });
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return parts.filter(p => p.active !== false && (
      p.part_number.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) || (p.manufacturer || '').toLowerCase().includes(s)
    )).slice(0, 20);
  }, [parts, q]);

  const saveNew = async () => {
    if (!np.part_number.trim()) return;
    try {
      const created = await createPart.mutateAsync({
        part_number: np.part_number.trim(), description: np.description.trim(), manufacturer: np.manufacturer.trim() || 'Other',
        category: np.category, cost: np.cost, retail_price: np.retail, supplier: company?.supplier_name || 'Other', notes: '',
        active: true, retail_verified: false,
      });
      toast(`${np.part_number} added to the catalog`);
      onPick(created as Part);
      setNp({ part_number: '', description: '', manufacturer: '', category: 'Oil Filter', cost: 0, retail: 0 });
      setAdding(false); setQ('');
    } catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search catalog by part #, description, or brand…" className="srch" />
      {q.trim() && (
        <div className="psearchres" style={{ marginTop: 6 }}>
          {list.length === 0 && <div className="row" style={{ cursor: 'default', color: 'var(--tx3)' }}>No match in the catalog.</div>}
          {list.map(p => (
            <div key={p.part_id} className="row" onClick={() => { onPick(p); setQ(''); }}>
              <span className="m" style={{ fontWeight: 700, minWidth: 90 }}>{p.part_number}</span>
              <span style={{ flex: 1 }}>{p.description}</span>
              <span className="tag tb">{p.manufacturer}</span>
              {p.no_discount && <span className="tag nodisc">No discount</span>}
              <span className="m" style={{ color: 'var(--tx2)' }} title="Retail (list) price">{formatMoney(p.retail_price)}</span>
            </div>
          ))}
          <div className="row" style={{ color: 'var(--ac)', fontWeight: 600 }} onClick={() => { setAdding(true); setNp(n => ({ ...n, part_number: q.trim().toUpperCase() })); }}>
            {IC(ICONS.plus, 13)} Add &ldquo;{q.trim()}&rdquo; as a new filter
          </div>
        </div>
      )}
      {!q.trim() && !adding && <button className="btn bs bg" style={{ marginTop: 4 }} onClick={() => setAdding(true)}>{IC(ICONS.plus, 13)} New filter not in catalog</button>}
      {adding && (
        <div className="subcard">
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>New filter (saved to the catalog)</div>
          <div className="fr">
            <div className="fld"><label>Part #</label><input value={np.part_number} onChange={e => setNp(n => ({ ...n, part_number: e.target.value }))} /></div>
            <div className="fld"><label>Brand</label><input value={np.manufacturer} onChange={e => setNp(n => ({ ...n, manufacturer: e.target.value }))} placeholder="Baldwin, Donaldson, CAT…" /></div>
          </div>
          <div className="fld"><label>Description</label><input value={np.description} onChange={e => setNp(n => ({ ...n, description: e.target.value }))} /></div>
          <div className="fr3">
            <div className="fld"><label>Type</label>
              <select value={np.category} onChange={e => setNp(n => ({ ...n, category: e.target.value }))}>
                {['Oil Filter', 'Fuel System', 'Fuel/Water Separator', 'Air Filter', 'Air Filter - Secondary', 'Hydraulic', 'Transmission', 'Cabin Filter', 'Coolant', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld"><label>Retail (list)</label><input type="number" step="0.01" inputMode="decimal" value={np.retail || ''} onChange={e => setNp(n => ({ ...n, retail: Number(e.target.value) || 0 }))} /></div>
            <div className="fld"><label>Cost</label><input type="number" step="0.01" inputMode="decimal" value={np.cost || ''} onChange={e => setNp(n => ({ ...n, cost: Number(e.target.value) || 0 }))} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>Saved to the catalog as <em>not yet retail-verified</em>.</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn bs" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn bs bp" disabled={!np.part_number.trim() || createPart.isPending} onClick={saveNew}>Save &amp; add</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// New filter order
// ─────────────────────────────────────────────
interface DraftLine {
  key: string; part_id: string | null; part_number: string; description: string; brand: string;
  unit_id: string | null; quantity: number; unit_cost: number; unit_price: number; price_overridden: boolean;
  retail_price: number; discount_pct: number; no_discount: boolean;
}

export function NewFilterOrderModal({ presetCustomerId, presetUnitIds = [], onClose, onCreated, toast }: {
  presetCustomerId?: string; presetUnitIds?: string[]; onClose: () => void; onCreated: (o: FilterOrder) => void; toast: ToastFn;
}) {
  const { data: customers = [] } = useCustomers();
  const { data: units = [] } = useFleetUnits();
  const { data: parts = [] } = useParts();
  const { data: company } = useCompanySettings();
  const { data: eqFilters = [] } = equipmentFiltersApi.useList();
  const { data: allContacts = [] } = contactsApi.useList();
  const createCustomer = useCreateCustomer();
  const createContact = contactsApi.useCreate();
  const createOrder = filterOrdersApi.useCreate();
  const createItems = filterOrderItemsApi.useCreateMany();
  const defDisc = Number(company?.default_customer_discount_pct ?? 6);

  const [customerId, setCustomerId] = useState(presetCustomerId || '');
  const [custSearch, setCustSearch] = useState('');
  const [quick, setQuick] = useState<{ name: string; phone: string; contact: string } | null>(null);
  const [contactId, setContactId] = useState('');
  const [taxRate, setTaxRate] = useState<number>(Number(company?.filter_tax_rate_percent ?? 2.5));
  const [notes, setNotes] = useState('');
  const [pickedUnits, setPickedUnits] = useState<string[]>([]);

  // Discount for this order: the picked customer's, or the default for a quick-added customer
  const pickedCust = customers.find(c => c.customer_id === customerId);
  const discPct = pickedCust ? Number(pickedCust.discount_pct ?? defDisc) : defDisc;
  const lineFor = (p: Part, unit_id: string | null, qty: number): DraftLine => ({
    key: `${p.part_id}-${unit_id || ''}-${Math.random()}`, part_id: p.part_id, part_number: p.part_number, description: p.description,
    brand: p.manufacturer, unit_id, quantity: qty, unit_cost: Number(p.cost) || 0,
    retail_price: Number(p.retail_price) || 0, discount_pct: partDiscountPct(p, discPct), no_discount: !!p.no_discount,
    unit_price: discountedPrice(p.retail_price, partDiscountPct(p, discPct)), price_overridden: false,
  });
  const machineLines = (unit_id: string) => eqFilters.filter(ef => ef.unit_id === unit_id)
    .map(ef => { const p = parts.find(x => x.part_id === ef.part_id); return p ? lineFor(p, unit_id, ef.quantity_per_change || 1) : null; })
    .filter(Boolean) as DraftLine[];

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [seeded, setSeeded] = useState(false);
  // Pre-fill lines for preset machines once their data has loaded
  if (!seeded && presetUnitIds.length && eqFilters.length && parts.length) {
    setSeeded(true);
    setPickedUnits(presetUnitIds);
    setLines(presetUnitIds.flatMap(machineLines));
  }

  // When the customer (and so the discount) changes, re-price lines that weren't hand-priced
  useEffect(() => {
    // No-discount lines stay at 0% (full retail) whatever the customer's discount
    setLines(ls => ls.map(l => {
      const d = partDiscountPct(l, discPct);
      return l.price_overridden ? { ...l, discount_pct: d } : { ...l, discount_pct: d, unit_price: discountedPrice(l.retail_price, d) };
    }));
  }, [discPct]);

  const toggleUnit = (id: string) => {
    if (pickedUnits.includes(id)) {
      setPickedUnits(u => u.filter(x => x !== id));
      setLines(ls => ls.filter(l => l.unit_id !== id));
    } else {
      setPickedUnits(u => [...u, id]);
      const add = machineLines(id);
      if (!add.length) toast('No filters saved for that machine yet — add them below or on the machine page', true);
      setLines(ls => [...ls, ...add]);
    }
  };
  const setLine = (key: string, patch: Partial<DraftLine>) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));

  const custUnits = units.filter(u => u.customer_id === customerId);
  const custContacts = allContacts.filter(c => c.customer_id === customerId);
  const cust = customers.find(c => c.customer_id === customerId);
  const custMatches = custSearch.trim() ? customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).slice(0, 12) : [];
  const t = calculateFilterOrderTotals(lines, taxRate);
  const canSave = (!!customerId || !!quick?.name.trim()) && lines.length > 0;

  const save = async () => {
    let cid = customerId;
    let ctid = contactId || null;
    if (!cid && quick) {
      const c = await createCustomer.mutateAsync({ name: quick.name.trim(), phone: quick.phone.trim(), contact_name: quick.contact.trim(), customer_type: 'filter_only', status: 'active', discount_pct: defDisc } as any);
      cid = c.customer_id;
      if (quick.contact.trim()) {
        const ct = await createContact.mutateAsync({ customer_id: cid, name: quick.contact.trim(), phone: quick.phone.trim(), is_primary: true });
        ctid = ct.contact_id;
      }
    }
    const now = new Date().toISOString();
    const order = await createOrder.mutateAsync({
      customer_id: cid, contact_id: ctid, status: 'requested', requested_at: now, tax_rate_percent: taxRate, notes,
      billed: false, invoice_number: null, updated_at: now,
    });
    await createItems.mutateAsync(lines.map((l, i) => ({
      filter_order_id: order.filter_order_id, part_id: l.part_id, part_number: l.part_number, description: l.description, brand: l.brand,
      unit_id: l.unit_id, quantity: l.quantity, unit_cost: l.unit_cost, unit_price: l.unit_price, price_overridden: l.price_overridden, sort_order: i,
      retail_price: l.retail_price, discount_pct: l.discount_pct,
    })));
    toast(`Filter order ${orderLabel(order)} created`);
    onCreated(order);
  };

  return (
    <ModalShell title="New Filter Order" size="lg" onClose={onClose} onSave={save} saveDisabled={!canSave} saveLabel="Save as Requested">
      {/* 1. Customer */}
      <div className="section-hdr">1 · Customer</div>
      {cust ? (
        <div className="subcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div><strong>{cust.name}</strong><div style={{ fontSize: 12, color: 'var(--tx2)' }}>{cust.contact_name || ''} {cust.phone || ''}</div></div>
          {!presetCustomerId && <button className="btn bs" onClick={() => { setCustomerId(''); setPickedUnits([]); setLines(ls => ls.map(l => ({ ...l, unit_id: null }))); setContactId(''); }}>Change</button>}
        </div>
      ) : quick ? (
        <div className="subcard">
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>New filter-only customer</div>
          <div className="fld"><label>Business name</label><input value={quick.name} onChange={e => setQuick(q => q && ({ ...q, name: e.target.value }))} autoFocus /></div>
          <div className="fr">
            <div className="fld"><label>Contact</label><input value={quick.contact} onChange={e => setQuick(q => q && ({ ...q, contact: e.target.value }))} /></div>
            <div className="fld"><label>Phone</label><input type="tel" value={quick.phone} onChange={e => setQuick(q => q && ({ ...q, phone: e.target.value }))} /></div>
          </div>
          <button className="btn bs" onClick={() => setQuick(null)}>Pick an existing customer instead</button>
        </div>
      ) : (
        <>
          <input type="search" className="srch" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customers…" autoFocus />
          {custMatches.length > 0 && (
            <div className="psearchres" style={{ marginTop: 6 }}>
              {custMatches.map(c => (
                <div key={c.customer_id} className="row" onClick={() => { setCustomerId(c.customer_id); setCustSearch(''); setContactId(allContacts.find(x => x.customer_id === c.customer_id && x.is_primary)?.contact_id || ''); }}>
                  <strong style={{ flex: 1 }}>{c.name}</strong><span style={{ color: 'var(--tx3)', fontSize: 11 }}>{c.contact_name}</span>
                </div>
              ))}
            </div>
          )}
          <button className="btn bs bg" style={{ marginTop: 6 }} onClick={() => setQuick({ name: custSearch, phone: '', contact: '' })}>{IC(ICONS.plus, 13)} Quick-add a filter-only customer</button>
        </>
      )}
      {cust && custContacts.length > 0 && (
        <div className="fld" style={{ marginTop: 8 }}><label>Contact for this order</label>
          <select value={contactId} onChange={e => setContactId(e.target.value)}>
            <option value="">— None —</option>
            {custContacts.map(c => <option key={c.contact_id} value={c.contact_id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
          </select>
        </div>
      )}

      {/* 2. Machines */}
      {cust && (
        <>
          <div className="section-hdr">2 · Machines (optional — adds their saved filters)</div>
          {custUnits.length === 0 ? <p style={{ fontSize: 12, color: 'var(--tx3)' }}>No equipment on file for this customer.</p> : (
            <div className="chips">
              {custUnits.map(u => {
                const n = eqFilters.filter(ef => ef.unit_id === u.unit_id).length;
                return <button key={u.unit_id} type="button" className={`chip${pickedUnits.includes(u.unit_id) ? ' on' : ''}`} onClick={() => toggleUnit(u.unit_id)}>{unitLabel(u)} <span style={{ opacity: .7 }}>({n})</span></button>;
              })}
            </div>
          )}
        </>
      )}

      {/* 3-4. Filters */}
      <div className="section-hdr">{cust ? '3' : '2'} · Filters</div>
      <CatalogPicker toast={toast} onPick={p => setLines(ls => {
        const existing = ls.find(l => l.part_id === p.part_id && !l.unit_id);
        return existing ? ls.map(l => l === existing ? { ...l, quantity: l.quantity + 1 } : l) : [...ls, lineFor(p, null, 1)];
      })} />
      {lines.length === 0 ? <div className="empty" style={{ padding: 12 }}><p>No filters added yet.</p></div> : (
        <div className="lines">
          {lines.map(l => (
            <div key={l.key} className={`line${l.unit_price < l.unit_cost ? ' below-cost' : ''}`}>
              <div className="line-main">
                <span className="m" style={{ fontWeight: 700 }}>{l.part_number}</span>
                <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{l.description}{l.brand ? ` · ${l.brand}` : ''}</span>
                <LinePriceInfo retail={l.retail_price} price={l.unit_price} cost={l.unit_cost} noDiscount={l.no_discount} />
                {custUnits.length > 0 && (
                  <select className="sort-sel" value={l.unit_id || ''} onChange={e => setLine(l.key, { unit_id: e.target.value || null })} aria-label="Machine">
                    <option value="">No machine</option>
                    {custUnits.map(u => <option key={u.unit_id} value={u.unit_id}>{unitLabel(u)}</option>)}
                  </select>
                )}
              </div>
              <div className="line-nums">
                <label>Qty<LocalNumberInput value={l.quantity} min="1" onCommit={v => setLine(l.key, { quantity: Math.max(1, v) })} className="num-in" ariaLabel="Quantity" /></label>
                <label>Price<LocalNumberInput value={l.unit_price} step="0.01" onCommit={v => setLine(l.key, { unit_price: round2(v), price_overridden: round2(v) !== discountedPrice(l.retail_price, l.discount_pct) })} className="num-in" ariaLabel="Unit price" /></label>
                <span className="m line-tot">{formatMoney(round2(l.quantity * l.unit_price))}</span>
                <button className="btn bs bg" aria-label="Remove line" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>✕</button>
              </div>
              {l.price_overridden && <span className="tag ta" style={{ alignSelf: 'flex-start' }}>custom price <button className="linkbtn" onClick={() => setLine(l.key, { unit_price: discountedPrice(l.retail_price, l.discount_pct), price_overridden: false })}>reset</button></span>}
            </div>
          ))}
        </div>
      )}

      {/* 5. Notes + totals */}
      <div className="section-hdr">{cust ? '4' : '3'} · Notes &amp; totals</div>
      <div className="fr">
        <div className="fld"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Needed by Friday, leave at shop…" /></div>
        <div>
          <div className="fld"><label>Tax rate %</label><LocalNumberInput value={taxRate} step="0.01" onCommit={setTaxRate} ariaLabel="Tax rate" /></div>
          {t.savings > 0 && <div className="cr savings-row"><span>Parts discount savings</span><span className="m">{formatMoney(t.savings)}</span></div>}
          <div className="cr"><span>Subtotal</span><span className="m">{formatMoney(t.subtotal)}</span></div>
          <div className="cr"><span>Tax ({taxRate}%)</span><span className="m">{formatMoney(t.tax_amount)}</span></div>
          <div className="cr tot"><span>Total</span><span className="m">{formatMoney(t.total)}</span></div>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────
// Ask for a supplier order # (Mark Ordered)
// ─────────────────────────────────────────────
function SupplierRefModal({ count, onSave, onClose }: { count: number; onSave: (ref: string) => Promise<void>; onClose: () => void }) {
  const [ref, setRef] = useState('');
  return (
    <ModalShell title={`Mark ${count === 1 ? 'order' : `${count} orders`} as Ordered`} onClose={onClose} onSave={() => onSave(ref.trim())} saveLabel="Mark Ordered">
      <div className="fld"><label>Supplier order # (optional)</label><input value={ref} onChange={e => setRef(e.target.value)} autoFocus placeholder="e.g. PO-55812" /></div>
    </ModalShell>
  );
}

// After Delivered: offer a check-in follow-up 7 days later
function DeliveredFollowUpOffer({ orders, onClose, toast }: { orders: FilterOrder[]; onClose: () => void; toast: ToastFn }) {
  const { data: customers = [] } = useCustomers();
  const createFU = followUpsApi.useCreate();
  const custIds = Array.from(new Set(orders.map(o => o.customer_id)));
  const names = custIds.map(id => customers.find(c => c.customer_id === id)?.name || 'customer');
  return (
    <ModalShell title="Set a check-in?" onClose={onClose} saveLabel="Add follow-up" onSave={async () => {
      const due = addDaysISO(todayISO(), 7);
      for (const id of custIds) {
        const o = orders.find(x => x.customer_id === id)!;
        const name = customers.find(c => c.customer_id === id)?.name || 'customer';
        await createFU.mutateAsync({ customer_id: id, contact_id: o.contact_id, title: `Check in with ${name} about filters`, due_date: due, status: 'open', related_filter_order_id: o.filter_order_id });
      }
      toast(`Follow-up${custIds.length === 1 ? '' : 's'} set for ${fmtDate(due)}`);
      onClose();
    }}>
      <p style={{ fontSize: 13 }}>Delivered! Add a follow-up in 7 days to check in with <strong>{names.join(', ')}</strong> about filters?</p>
    </ModalShell>
  );
}

// Moves one or more orders to their next step, with the right prompts
function useStepFlow(toast: ToastFn) {
  const changer = useStatusChanger(toast);
  const [refFor, setRefFor] = useState<FilterOrder[] | null>(null);
  const [offerFor, setOfferFor] = useState<FilterOrder[] | null>(null);

  const go = async (orders: FilterOrder[]) => {
    if (!orders.length) return;
    const to = nextStatus(orders[0].status);
    if (!to) return;
    if (to === 'ordered') { setRefFor(orders); return; }
    try {
      if (orders.length === 1) await changer.advance(orders[0], to);
      else await changer.advanceMany(orders.map(o => o.filter_order_id), to);
      if (to === 'delivered') setOfferFor(orders);
    } catch (err: any) { toast(`Failed: ${err?.message || 'Unknown error'}`, true); }
  };
  const modals = (
    <>
      {refFor && <SupplierRefModal count={refFor.length} onClose={() => setRefFor(null)} onSave={async ref => {
        const extra = ref ? { supplier_ref: ref } : {};
        if (refFor.length === 1) await changer.advance(refFor[0], 'ordered', extra);
        else await changer.advanceMany(refFor.map(o => o.filter_order_id), 'ordered', extra);
        setRefFor(null);
      }} />}
      {offerFor && <DeliveredFollowUpOffer orders={offerFor} onClose={() => setOfferFor(null)} toast={toast} />}
    </>
  );
  return { go, undo: changer.undo, modals };
}

// ─────────────────────────────────────────────
// Orders table (used on the Filter Orders page and the customer tab)
// ─────────────────────────────────────────────
function OrdersTable({ orders, nav, selectable, selected, setSelected, showCustomer = true }: {
  orders: FilterOrder[]; nav: NavFn; selectable?: boolean; selected?: string[]; setSelected?: (f: (s: string[]) => string[]) => void; showCustomer?: boolean;
}) {
  const { data: customers = [] } = useCustomers();
  const { totals } = useOrderTotals();
  if (!orders.length) return <div className="empty"><p>No filter orders here.</p></div>;
  const allSel = selectable && orders.every(o => selected!.includes(o.filter_order_id));
  return (
    <div className="tw">
      <table>
        <thead><tr>
          {selectable && <th style={{ width: 28 }}><input type="checkbox" className="batch-cb" aria-label="Select all" checked={!!allSel} onChange={() => setSelected!(s => allSel ? s.filter(id => !orders.some(o => o.filter_order_id === id)) : Array.from(new Set([...s, ...orders.map(o => o.filter_order_id)]))) } /></th>}
          <th>Order</th>{showCustomer && <th>Customer</th>}<th>Items</th><th>Total</th><th>Status</th><th>Updated</th><th>Billing</th>
        </tr></thead>
        <tbody>
          {orders.map(o => {
            const t = totals(o);
            const sel = selectable && selected!.includes(o.filter_order_id);
            return (
              <tr key={o.filter_order_id} onClick={() => nav('forder', o.filter_order_id, orderLabel(o))} style={{ background: sel ? 'var(--ac3)' : undefined }}>
                {selectable && <td onClick={e => { e.stopPropagation(); setSelected!(s => s.includes(o.filter_order_id) ? s.filter(x => x !== o.filter_order_id) : [...s, o.filter_order_id]); }}>
                  <input type="checkbox" className="batch-cb" checked={!!sel} readOnly aria-label={`Select ${orderLabel(o)}`} style={{ pointerEvents: 'none' }} />
                </td>}
                <td className="m" style={{ fontWeight: 700, color: 'var(--ac)' }}>{orderLabel(o)}</td>
                {showCustomer && <td>{customers.find(c => c.customer_id === o.customer_id)?.name || '—'}</td>}
                <td className="m">{t.item_count}</td>
                <td className="m" style={{ fontWeight: 600 }}>{formatMoney(t.total)}</td>
                <td><StatusBadge s={o.status} /></td>
                <td className="m">{fmtDate(lastUpdated(o))}</td>
                <td>{['delivered', 'paid'].includes(o.status) || o.billed ? <span className={`tag ${o.billed ? 'tb' : 'ta'}`}>{o.billed ? (o.invoice_number ? `INV-${o.invoice_number}` : 'Billed') : 'Unbilled'}</span> : <span style={{ color: 'var(--tx3)', fontSize: 11 }}>—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerFilterOrders({ customerId, nav, toast }: { customerId: string; nav: NavFn; toast: ToastFn }) {
  const { data: orders = [] } = filterOrdersApi.useList();
  const [creating, setCreating] = useState(false);
  const mine = orders.filter(o => o.customer_id === customerId);
  return (
    <div className="card">
      <div className="ch"><h3>Filter Orders ({mine.length})</h3><button className="btn bs bp" onClick={() => setCreating(true)}>{IC(ICONS.plus, 14)} New Filter Order</button></div>
      <OrdersTable orders={mine} nav={nav} showCustomer={false} />
      {creating && <NewFilterOrderModal presetCustomerId={customerId} onClose={() => setCreating(false)} toast={toast} onCreated={o => { setCreating(false); nav('forder', o.filter_order_id, orderLabel(o)); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Filter Orders page
// ─────────────────────────────────────────────
type OrderTab = FilterOrderStatus | 'all';
export function FilterOrdersPage({ nav, toast }: { nav: NavFn; toast: ToastFn }) {
  const { data: orders = [], isLoading } = filterOrdersApi.useList();
  const { data: customers = [] } = useCustomers();
  const [tab, setTab] = useState<OrderTab>('requested');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const flow = useStepFlow(toast);

  const count = (s: OrderTab) => s === 'all' ? orders.filter(o => o.status !== 'cancelled').length : orders.filter(o => o.status === s).length;
  const s = q.trim().toLowerCase();
  const shown = orders.filter(o =>
    (tab === 'all' ? o.status !== 'cancelled' : o.status === tab) &&
    (!s || orderLabel(o).toLowerCase().includes(s) || String(o.order_number).includes(s) ||
      (customers.find(c => c.customer_id === o.customer_id)?.name || '').toLowerCase().includes(s))
  );
  const selOrders = orders.filter(o => selected.includes(o.filter_order_id));
  const sameStatus = selOrders.length > 0 && selOrders.every(o => o.status === selOrders[0].status);
  const next = sameStatus ? nextStatus(selOrders[0].status) : null;

  return (
    <>
      <div className="card">
        <div className="ch">
          <h3>Filter Orders</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn bs" onClick={() => nav('supplierlist', '', 'Supplier Order List')}>{IC(ICONS.list, 14)} Supplier Order List</button>
            <button className="btn bs bp" onClick={() => setCreating(true)}>{IC(ICONS.plus, 14)} New Filter Order</button>
          </div>
        </div>
        <div className="tabs">
          {(['requested', 'ordered', 'received', 'delivered', 'paid', 'all', 'cancelled'] as OrderTab[]).map(t => (
            <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => { setTab(t); setSelected([]); }}>
              {t === 'all' ? 'All' : STATUS_LABEL[t]}<span className="ct">{count(t)}</span>
            </button>
          ))}
        </div>
        <input type="search" className="srch" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by customer or order #…" style={{ marginBottom: 10 }} />
        {selected.length > 0 && (
          <div className="filterbar" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{selected.length} selected</span>
            <button className="btn bs bg" onClick={() => setSelected([])}>Clear</button>
            <div style={{ flex: 1 }} />
            {next ? <button className="btn bs bp" onClick={async () => { await flow.go(selOrders); setSelected([]); }}>{IC(ICONS.check, 13)} {NEXT_LABEL[selOrders[0].status]} ({selected.length})</button>
              : <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{sameStatus ? 'Nothing after this step' : 'Pick orders in the same step to move them together'}</span>}
          </div>
        )}
        {isLoading ? <div className="loading">Loading…</div> : <OrdersTable orders={shown} nav={nav} selectable selected={selected} setSelected={setSelected} />}
      </div>
      {creating && <NewFilterOrderModal onClose={() => setCreating(false)} toast={toast} onCreated={o => { setCreating(false); nav('forder', o.filter_order_id, orderLabel(o)); }} />}
      {flow.modals}
    </>
  );
}

// ─────────────────────────────────────────────
// Filter order detail
// ─────────────────────────────────────────────
function InvoiceNumberModal({ order, onClose, toast }: { order: FilterOrder; onClose: () => void; toast: ToastFn }) {
  const { data: orders = [] } = filterOrdersApi.useList();
  const { data: wos = [] } = useWorkOrders();
  const update = filterOrdersApi.useUpdate();
  const [num, setNum] = useState(order.invoice_number || 0);
  const [confirmed, setConfirmed] = useState(false);
  const dup = wos.some(w => w.invoice_number === num) || orders.some(o => o.invoice_number === num && o.filter_order_id !== order.filter_order_id);
  return (
    <ModalShell title="Edit Invoice Number" onClose={onClose} saveDisabled={num < 1} saveLabel={dup && !confirmed ? 'Confirm Duplicate' : 'Save'}
      onSave={async () => {
        if (dup && !confirmed) { setConfirmed(true); throw new Error('Click Save again to confirm using a duplicate number.'); }
        await update.mutateAsync({ id: order.filter_order_id, updates: { invoice_number: num } });
        toast(`Invoice number changed to INV-${num}`); onClose();
      }}>
      <div className="fld"><label>Invoice number</label><input type="number" min="1" value={num || ''} onChange={e => { setNum(Number(e.target.value) || 0); setConfirmed(false); }} autoFocus /></div>
      {dup && <div className="mwarn" style={{ margin: 0 }}><strong>⚠ Warning:</strong> INV-{num} is already used.</div>}
    </ModalShell>
  );
}

export function FilterOrderDetail({ orderId, nav, back, toast, confirm }: { orderId: string; nav: NavFn; back: () => void; toast: ToastFn; confirm: ConfirmFn }) {
  const { data: orders = [] } = filterOrdersApi.useList();
  const { byOrder } = useOrderTotals();
  const { data: customers = [] } = useCustomers();
  const { data: contacts = [] } = contactsApi.useList();
  const { data: units = [] } = useFleetUnits();
  const { data: parts = [] } = useParts();
  const { data: company } = useCompanySettings();
  const updateOrder = filterOrdersApi.useUpdate();
  const deleteOrder = filterOrdersApi.useDelete();
  const createItem = filterOrderItemsApi.useCreate();
  const updateItem = filterOrderItemsApi.useUpdate();
  const deleteItem = filterOrderItemsApi.useDelete();
  const bill = useFilterBilling(toast);
  const flow = useStepFlow(toast);
  const [fuOpen, setFuOpen] = useState(false);
  const [invEdit, setInvEdit] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const o = orders.find(x => x.filter_order_id === orderId);
  if (!o) return <div className="empty"><p>Order not found</p></div>;
  const items = (byOrder[o.filter_order_id] || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const t = calculateFilterOrderTotals(items, o.tax_rate_percent);
  const c = customers.find(x => x.customer_id === o.customer_id);
  const contact = contacts.find(x => x.contact_id === o.contact_id) || contacts.find(x => x.customer_id === o.customer_id && x.is_primary);
  const custUnits = units.filter(u => u.customer_id === o.customer_id);
  const editable = !o.billed && !['paid', 'cancelled'].includes(o.status);
  const custDisc = Number(c?.discount_pct ?? company?.default_customer_discount_pct ?? 6);
  const touch = { updated_at: new Date().toISOString() };
  const setOrder = (u: Partial<FilterOrder>) => updateOrder.mutateAsync({ id: o.filter_order_id, updates: { ...u, ...touch } }).catch((e: any) => toast(`Failed: ${e?.message}`, true));
  const setItem = (i: FilterOrderItem, u: Partial<FilterOrderItem>) => updateItem.mutateAsync({ id: i.item_id, updates: u }).catch((e: any) => toast(`Failed: ${e?.message}`, true));
  // The line's list price (retail − discount saved on the line); null on lines saved before discount pricing
  const listPrice = (i: FilterOrderItem) => Number(i.retail_price) > 0 ? discountedPrice(i.retail_price, i.discount_pct) : null;

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const blob = await buildFilterInvoicePdfBlob({ order: o, items, customer: c, contact, units, company });
      const saveAs = await loadSaveAs();
      saveAs(blob, filterInvoiceFileName(o, c));
    } catch (err: any) { toast(`PDF failed: ${err?.message || 'Unknown error'}`, true); }
    finally { setPdfBusy(false); }
  };

  const nextS = nextStatus(o.status);
  const canUndo = o.status !== 'requested';

  return (
    <>
      <div className="card">
        <div className="wh" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>Filter Order {orderLabel(o)}</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>
              {c ? <span className="linkish" onClick={() => nav('cust', c.customer_id, c.name)}>{c.name}</span> : 'Unknown customer'}
              {o.invoice_number ? <span className="m"> · INV-{o.invoice_number}</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <StatusBadge s={o.status} />
              {(['delivered', 'paid'].includes(o.status) || o.billed) && <span className={`tag ${o.billed ? 'tb' : 'ta'}`}>{o.billed ? 'BILLED' : 'UNBILLED'}</span>}
            </div>
          </div>
          <div className="act-row">
            {nextS && <button className="btn bp" onClick={() => flow.go([o])}>{IC(ICONS.check, 14)} {NEXT_LABEL[o.status]}</button>}
            {canUndo && <button className="btn bs bwarn" onClick={() => flow.undo(o).catch((e: any) => toast(`Failed: ${e?.message}`, true))}>{IC(ICONS.undo, 13)} Undo step</button>}
            {['delivered', 'paid'].includes(o.status) && (
              <button className={`btn bs ${o.billed ? 'bg' : 'bp'}`} onClick={() => bill(o, !o.billed)}>{IC(ICONS.bill, 13)} {o.billed ? 'Mark Unbilled' : 'Mark Billed'}</button>
            )}
            <button className="btn bs" onClick={downloadPdf} disabled={pdfBusy}>{IC(ICONS.print, 13)} {pdfBusy ? 'Building…' : 'Invoice PDF'}</button>
            {o.billed && <button className="btn bs" onClick={() => setInvEdit(true)}>{IC(ICONS.edit, 13)} INV #</button>}
            <button className="btn bs" onClick={() => setFuOpen(true)}>{IC(ICONS.bell, 13)} Follow up</button>
            {!['paid', 'cancelled'].includes(o.status) && (
              <button className="btn bs bd2btn" onClick={() => confirm(orderLabel(o), async () => { await setOrder({ status: 'cancelled', cancelled_at: new Date().toISOString() }); toast(`${orderLabel(o)} cancelled`); },
                { title: 'Cancel Order', label: 'Cancel order', message: `Cancel filter order ${orderLabel(o)}? You can bring it back with "Undo step".` })}>Cancel order</button>
            )}
            {(o.status === 'cancelled' || (o.status === 'requested' && !o.billed)) && (
              <button className="btn bs bd2btn" aria-label="Delete order" onClick={() => confirm(`filter order ${orderLabel(o)} (permanently)`, async () => { await deleteOrder.mutateAsync(o.filter_order_id); toast('Order deleted'); back(); })}>{IC(ICONS.trash, 13)}</button>
            )}
          </div>
        </div>

        {/* Status timeline */}
        <div className="stepper">
          {STEPS.map(s => {
            const at = o[AT_COL[s]] as string | null;
            const reached = !!at && o.status !== 'cancelled' ? true : !!at;
            return (
              <div key={s} className={`step${reached ? ' done' : ''}${o.status === s ? ' cur' : ''}`}>
                <div className="dot">{reached ? IC(ICONS.check, 11) : null}</div>
                <div className="lbl">{STATUS_LABEL[s]}</div>
                <div className="when">{at ? fmtDate(at) : ''}</div>
              </div>
            );
          })}
          {o.status === 'cancelled' && (
            <div className="step cur cancelled"><div className="dot">✕</div><div className="lbl">Cancelled</div><div className="when">{fmtDate(o.cancelled_at)}</div></div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="ch"><h3>Filters ({t.item_count})</h3>{!editable && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Locked ({o.billed ? 'billed' : o.status})</span>}</div>
        {editable && <CatalogPicker toast={toast} onPick={async p => {
          const retail = Number(p.retail_price) || 0;
          const d = partDiscountPct(p, custDisc);
          try {
            await createItem.mutateAsync({ filter_order_id: o.filter_order_id, part_id: p.part_id, part_number: p.part_number, description: p.description, brand: p.manufacturer, quantity: 1, unit_cost: Number(p.cost) || 0, retail_price: retail, discount_pct: d, unit_price: discountedPrice(retail, d), price_overridden: false, sort_order: items.length });
            setOrder({});
          } catch (e: any) { toast(`Failed: ${e?.message}`, true); }
        }} />}
        {items.length === 0 ? <div className="empty"><p>No filters on this order.</p></div> : (
          <div className="lines">
            {items.map(i => {
              const u = units.find(x => x.unit_id === i.unit_id);
              const cp = listPrice(i);
              return (
                <div key={i.item_id} className={`line${Number(i.unit_price) < Number(i.unit_cost) ? ' below-cost' : ''}`}>
                  <div className="line-main">
                    <span className="m" style={{ fontWeight: 700 }}>{i.part_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{i.description}{i.brand ? ` · ${i.brand}` : ''}</span>
                    <LinePriceInfo retail={Number(i.retail_price) || 0} price={Number(i.unit_price)} cost={Number(i.unit_cost)}
                      noDiscount={Number(i.retail_price) > 0 && Number(i.discount_pct) === 0 && !!parts.find(x => x.part_id === i.part_id)?.no_discount} />
                    {editable && custUnits.length > 0 ? (
                      <select className="sort-sel" value={i.unit_id || ''} aria-label="Machine" onChange={e => setItem(i, { unit_id: e.target.value || null })}>
                        <option value="">No machine</option>
                        {custUnits.map(cu => <option key={cu.unit_id} value={cu.unit_id}>{unitLabel(cu)}</option>)}
                      </select>
                    ) : u ? <span className="tag tb">{unitLabel(u)}</span> : null}
                  </div>
                  <div className="line-nums">
                    {editable ? (
                      <>
                        <label>Qty<LocalNumberInput value={Number(i.quantity)} min="1" className="num-in" ariaLabel="Quantity" onCommit={v => setItem(i, { quantity: Math.max(1, v) })} /></label>
                        <label>Price<LocalNumberInput value={Number(i.unit_price)} step="0.01" className="num-in" ariaLabel="Unit price" onCommit={v => setItem(i, { unit_price: round2(v), price_overridden: cp == null ? true : round2(v) !== cp })} /></label>
                      </>
                    ) : <span className="m" style={{ fontSize: 12 }}>{i.quantity} × {formatMoney(i.unit_price)}</span>}
                    <span className="m line-tot">{formatMoney(round2(i.quantity * i.unit_price))}</span>
                    {editable && <button className="btn bs bg" aria-label="Remove line" onClick={() => confirm(`${i.part_number} from this order`, async () => { await deleteItem.mutateAsync(i.item_id); })}>✕</button>}
                  </div>
                  {i.price_overridden && <span className="tag ta" style={{ alignSelf: 'flex-start' }}>custom price{editable && cp != null && <button className="linkbtn" onClick={() => setItem(i, { unit_price: cp, price_overridden: false })}>reset to {formatMoney(cp)}</button>}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 12 }}>
          {t.savings > 0 && <div className="cr savings-row"><span>Parts discount savings</span><span className="m">{formatMoney(t.savings)}</span></div>}
          <div className="cr"><span>Subtotal</span><span className="m">{formatMoney(t.subtotal)}</span></div>
          <div className="cr" style={{ alignItems: 'center' }}>
            <span>Tax {editable ? (
              <LocalNumberInput value={Number(o.tax_rate_percent)} step="0.01" className="num-in" ariaLabel="Tax rate" style={{ width: 64 }} onCommit={v => setOrder({ tax_rate_percent: v })} />
            ) : `(${o.tax_rate_percent}%)`}{editable && '%'}</span>
            <span className="m">{formatMoney(t.tax_amount)}</span>
          </div>
          <div className="cr tot"><span>Total</span><span className="m">{formatMoney(t.total)}</span></div>
          <div className="cr" style={{ color: 'var(--gn)', fontSize: 11 }}><span>Profit (before tax)</span><span className="m">{formatMoney(t.profit)}</span></div>
        </div>
      </div>

      <div className="card">
        <div className="ch"><h3>Details</h3></div>
        <div className="fr">
          <div className="fld"><label>Supplier order #</label><LocalTextInput value={o.supplier_ref} onCommit={v => setOrder({ supplier_ref: v })} placeholder="From the supplier" /></div>
          <div className="fld"><label>Contact for this order</label>
            <select value={o.contact_id || ''} onChange={e => setOrder({ contact_id: e.target.value || null })}>
              <option value="">— Primary / none —</option>
              {contacts.filter(x => x.customer_id === o.customer_id).map(x => <option key={x.contact_id} value={x.contact_id}>{x.name}{x.role ? ` (${x.role})` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="fld"><label>Notes</label><LocalTextInput multiline value={o.notes} onCommit={v => setOrder({ notes: v })} placeholder="Notes for this order (shown on the invoice)" /></div>
        {(contact || c) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <strong>{contact?.name || c?.contact_name || c?.name}</strong>
            {(contact?.phone || c?.phone) && <a className="btn bs" href={telHref(contact?.phone || c!.phone)}>{IC(ICONS.phone, 13)} {contact?.phone || c?.phone}</a>}
            {(contact?.email || c?.email) && <a className="btn bs" href={`mailto:${contact?.email || c?.email}`}>{IC(ICONS.mail, 13)} Email</a>}
          </div>
        )}
      </div>

      {fuOpen && <FollowUpModal customerId={o.customer_id} relatedOrderId={o.filter_order_id} defaultTitle={`Follow up on filter order ${orderLabel(o)}`} onClose={() => setFuOpen(false)} toast={toast} />}
      {invEdit && <InvoiceNumberModal order={o} onClose={() => setInvEdit(false)} toast={toast} />}
      {flow.modals}
    </>
  );
}

// ─────────────────────────────────────────────
// Supplier Order List: every line on Requested orders, grouped by part #
// ─────────────────────────────────────────────
export function SupplierListPage({ nav, toast }: { nav: NavFn; toast: ToastFn }) {
  const { data: orders = [] } = filterOrdersApi.useList();
  const { byOrder } = useOrderTotals();
  const { data: customers = [] } = useCustomers();
  const { data: company } = useCompanySettings();
  const changer = useStatusChanger(toast);
  const [asking, setAsking] = useState(false);

  const requested = orders.filter(o => o.status === 'requested');
  const groups = useMemo(() => {
    const m: Record<string, { part_number: string; description: string; brand: string; qty: number; unit_cost: number; who: { order: FilterOrder; qty: number }[] }> = {};
    requested.forEach(o => (byOrder[o.filter_order_id] || []).forEach(i => {
      const k = i.part_number.trim().toUpperCase();
      const g = (m[k] ||= { part_number: i.part_number, description: i.description, brand: i.brand, qty: 0, unit_cost: Number(i.unit_cost) || 0, who: [] });
      g.qty += Number(i.quantity) || 0;
      const w = g.who.find(x => x.order.filter_order_id === o.filter_order_id);
      if (w) w.qty += Number(i.quantity) || 0; else g.who.push({ order: o, qty: Number(i.quantity) || 0 });
    }));
    return Object.values(m).sort((a, b) => a.part_number.localeCompare(b.part_number));
  }, [requested, byOrder]);
  const custName = (id: string) => customers.find(c => c.customer_id === id)?.name || '—';
  const estCost = groups.reduce((s, g) => s + g.qty * g.unit_cost, 0);

  const asText = () => [
    `Filter order${company?.company_name ? ` — ${company.company_name}` : ''}${company?.supplier_account_number ? ` (Acct ${company.supplier_account_number})` : ''}`,
    `Date: ${fmtDate(todayISO())}`, '',
    ...groups.map(g => `${g.qty} x ${g.part_number}${g.brand ? ` (${g.brand})` : ''}${g.description ? ` — ${g.description}` : ''}`),
    '', `Total pieces: ${groups.reduce((s, g) => s + g.qty, 0)}`,
  ].join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(asText()); toast('Copied — paste it into a text or email'); }
    catch { toast('Could not copy on this device. Use Print instead.', true); }
  };

  return (
    <>
      <div className="card supplier-list">
        <div className="ch no-print">
          <h3>Supplier Order List</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn bs" onClick={copy} disabled={!groups.length}>{IC(ICONS.copy, 13)} Copy</button>
            <button className="btn bs" onClick={() => window.print()} disabled={!groups.length}>{IC(ICONS.print, 13)} Print</button>
            <button className="btn bs bp" onClick={() => setAsking(true)} disabled={!requested.length}>{IC(ICONS.check, 13)} Mark all as Ordered</button>
          </div>
        </div>
        <div className="print-only" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16 }}>Filter Order — {company?.company_name}</h2>
          <p style={{ fontSize: 11 }}>{fmtDate(todayISO())}{company?.supplier_name ? ` · To: ${company.supplier_name}` : ''}{company?.supplier_account_number ? ` · Acct ${company.supplier_account_number}` : ''}</p>
        </div>
        <p className="no-print" style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
          Everything on <strong>Requested</strong> orders ({requested.length} order{requested.length === 1 ? '' : 's'}), totaled by part number.
          {company?.supplier_name && <> Supplier: <strong>{company.supplier_name}</strong>{company.supplier_phone && <> · <a href={telHref(company.supplier_phone)}>{company.supplier_phone}</a></>}{company.supplier_email && <> · <a href={`mailto:${company.supplier_email}?subject=${encodeURIComponent('Filter order')}&body=${encodeURIComponent(asText())}`}>Email list</a></>}</>}
        </p>
        {!groups.length ? <div className="empty"><p>Nothing to order. New filter orders show up here while they&apos;re Requested.</p></div> : (
          <div className="tw">
            <table>
              <thead><tr><th>Qty</th><th>Part #</th><th>Brand</th><th>Description</th><th>For</th></tr></thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.part_number} style={{ cursor: 'default' }}>
                    <td className="m" style={{ fontWeight: 800, fontSize: 14 }}>{g.qty}</td>
                    <td className="m" style={{ fontWeight: 700 }}>{g.part_number}</td>
                    <td>{g.brand}</td>
                    <td style={{ fontSize: 12 }}>{g.description}</td>
                    <td style={{ fontSize: 11.5 }}>{g.who.map(w => (
                      <div key={w.order.filter_order_id}><span className="linkish no-print-link" onClick={() => nav('forder', w.order.filter_order_id, orderLabel(w.order))}>{orderLabel(w.order)}</span> {custName(w.order.customer_id)} ×{w.qty}</div>
                    ))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="no-print" style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 10, textAlign: 'right' }}>
              {groups.reduce((s, g) => s + g.qty, 0)} pieces · estimated supplier cost <strong className="m">{formatMoney(round2(estCost))}</strong>
            </p>
          </div>
        )}
      </div>
      {asking && <SupplierRefModal count={requested.length} onClose={() => setAsking(false)} onSave={async ref => {
        await changer.advanceMany(requested.map(o => o.filter_order_id), 'ordered', ref ? { supplier_ref: ref } : {});
        setAsking(false);
      }} />}
    </>
  );
}

// ─────────────────────────────────────────────
// Filters on a machine (equipment detail page)
// ─────────────────────────────────────────────
export function MachineFilters({ unit, nav, toast, confirm }: { unit: FleetUnit; nav: NavFn; toast: ToastFn; confirm: ConfirmFn }) {
  const { data: eqFilters = [] } = equipmentFiltersApi.useList();
  const { data: parts = [] } = useParts();
  const { data: templates = [] } = useServiceTemplates();
  const { data: company } = useCompanySettings();
  const { data: customers = [] } = useCustomers();
  const create = equipmentFiltersApi.useCreate();
  const createMany = equipmentFiltersApi.useCreateMany();
  const update = equipmentFiltersApi.useUpdate();
  const del = equipmentFiltersApi.useDelete();
  const [ordering, setOrdering] = useState(false);
  const [picking, setPicking] = useState(false);
  const owner = customers.find(c => c.customer_id === unit.customer_id);
  const disc = Number(owner?.discount_pct ?? company?.default_customer_discount_pct ?? 6);

  const mine = eqFilters.filter(e => e.unit_id === unit.unit_id);
  const tpls = templates.filter(t => t.unit_id === unit.unit_id && t.parts_list.length);
  const fail = (e: any) => toast(`Failed: ${e?.message || 'Unknown error'}`, true);

  const copyFromTemplate = async (templateId: string) => {
    const t = tpls.find(x => x.template_id === templateId);
    if (!t) return;
    const have = new Set(mine.map(m => m.part_id));
    const rows = t.parts_list
      .map(ref => ({ ref, p: parts.find(p => p.part_number === ref.part_number) }))
      .filter(x => x.p && !have.has(x.p.part_id))
      .map(x => ({ unit_id: unit.unit_id, part_id: x.p!.part_id, quantity_per_change: x.ref.qty || 1, notes: '' }));
    if (!rows.length) { toast('Those parts are already on this machine'); return; }
    try { await createMany.mutateAsync(rows); toast(`Added ${rows.length} part${rows.length === 1 ? '' : 's'} from "${t.name}"`); } catch (e) { fail(e); }
  };

  return (
    <div className="card">
      <div className="ch">
        <h3>{IC(ICONS.filter, 15)} Filters ({mine.length})</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tpls.length > 0 && (
            <select className="sort-sel" value="" onChange={e => e.target.value && copyFromTemplate(e.target.value)} aria-label="Copy from service template">
              <option value="">Copy from service template…</option>
              {tpls.map(t => <option key={t.template_id} value={t.template_id}>{t.name} ({t.parts_list.length})</option>)}
            </select>
          )}
          <button className="btn bs" onClick={() => setPicking(p => !p)}>{IC(ICONS.plus, 14)} Add filter</button>
          <button className="btn bs bp" disabled={!mine.length} onClick={() => setOrdering(true)}>{IC(ICONS.truck, 14)} Order filters for this machine</button>
        </div>
      </div>
      {picking && <CatalogPicker toast={toast} onPick={async p => {
        if (mine.some(m => m.part_id === p.part_id)) { toast(`${p.part_number} is already on this machine`); return; }
        try { await create.mutateAsync({ unit_id: unit.unit_id, part_id: p.part_id, quantity_per_change: 1, notes: '' }); } catch (e) { fail(e); }
      }} />}
      {mine.length === 0 ? <div className="empty" style={{ padding: 14 }}><p>No filters saved for this machine yet. Add them once and reorder in one click.</p></div> : (
        <div className="lines">
          {mine.map(ef => {
            const p = parts.find(x => x.part_id === ef.part_id);
            return (
              <div key={ef.equipment_filter_id} className="line">
                <div className="line-main">
                  <span className="m" style={{ fontWeight: 700 }}>{p?.part_number || '?'}</span>
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{p?.description}{p?.manufacturer ? ` · ${p.manufacturer}` : ''}{p?.category ? ` · ${p.category}` : ''}</span>
                  <LocalTextInput value={ef.notes} placeholder="Note (primary, left side…)" className="note-in" onCommit={v => update.mutateAsync({ id: ef.equipment_filter_id, updates: { notes: v } }).catch(fail)} />
                </div>
                <div className="line-nums">
                  <label>Qty / change<LocalNumberInput value={ef.quantity_per_change} min="1" className="num-in" ariaLabel="Quantity per change" onCommit={v => update.mutateAsync({ id: ef.equipment_filter_id, updates: { quantity_per_change: Math.max(1, Math.round(v)) } }).catch(fail)} /></label>
                  {p && <span className="m line-tot" style={{ color: 'var(--gn)' }} title={p.no_discount ? 'No discount — sells at retail' : `Retail ${formatMoney(p.retail_price)} less ${disc}%`}>{formatMoney(discountedPrice(p.retail_price, partDiscountPct(p, disc)))}</span>}
                  <button className="btn bs bg" aria-label="Remove filter" onClick={() => confirm(`${p?.part_number || 'this filter'} from this machine`, async () => { await del.mutateAsync(ef.equipment_filter_id); })}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {ordering && <NewFilterOrderModal presetCustomerId={unit.customer_id} presetUnitIds={[unit.unit_id]} onClose={() => setOrdering(false)} toast={toast}
        onCreated={o => { setOrdering(false); nav('forder', o.filter_order_id, orderLabel(o)); }} />}
    </div>
  );
}
