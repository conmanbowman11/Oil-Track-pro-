'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import {
  useCompanySettings,
  useUpsertCompanySettings,
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useParts,
  useCreatePart,
  useUpdatePart,
  useEngines,
  useCreateEngine,
  useUpdateEngine,
  useFleetUnits,
  useCreateFleetUnit,
  useUpdateFleetUnit,
  useServiceTemplates,
  useCreateServiceTemplate,
  useUpdateServiceTemplate,
  useDeleteServiceTemplate,
  useWorkOrders,
  useCreateWorkOrder,
  useUpdateWorkOrder,
  ServiceTemplate,
} from '@/lib/hooks';
import {
  calculateWorkOrderTotals,
  round2,
  formatMoney,
  formatInvoiceNumber,
} from '@/lib/calculations';
import type {
  Customer,
  Part,
  Engine,
  FleetUnit,
  ServicePartSnapshot,
  CompanySettings,
  ChecklistItem,
} from '@/types/database';

const SUPPLIERS = ['CAT', 'John Deere', 'Case IH', 'AGCO', 'Baldwin', 'Donaldson', 'Fleetguard/Cummins', 'Other'];
const CATEGORIES = ['Fuel System', 'Air Filter', 'Oil Filter', 'Hydraulic', 'Transmission', 'DEF', 'Coolant', 'Lab/Testing', 'Other'];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root{--bg:#f3f0e8;--bg2:#e9e5db;--cd:#fff;--cd2:#fafaf7;--bd:#d4d0c6;--bd2:#e6e2d8;--tx:#2b2924;--tx2:#6d6a62;--tx3:#a09c94;--ac:#c45d2c;--ac2:#a84b22;--ac3:#f6ece5;--gn:#2d7a3a;--gn2:#e5f2e8;--bl:#2a679c;--bl2:#e4eff8;--am:#ad7d0c;--am2:#f8f1dc;--rd:#b83028;--rd2:#fae6e4;--r:6px;--rl:10px}
*{margin:0;padding:0;box-sizing:border-box}
body,#root{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--tx)}
.app{display:flex;height:100vh;overflow:hidden}
.sb{width:210px;min-width:210px;background:var(--cd);border-right:1px solid var(--bd);display:flex;flex-direction:column}
.sb-hd{padding:20px 16px 16px;border-bottom:1px solid var(--bd2)}
.sb-hd h1{font-size:16px;font-weight:800;color:var(--ac);letter-spacing:-.04em}
.sb-hd p{font-size:10.5px;color:var(--tx3);margin-top:2px}
.sb-nav{padding:8px;flex:1;overflow-y:auto}
.si{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:var(--r);cursor:pointer;color:var(--tx2);font-size:13px;font-weight:500;transition:all .1s;border:1px solid transparent;margin-bottom:1px}
.si:hover{background:var(--bg);color:var(--tx)}
.si.on{background:var(--ac3);color:var(--ac);border-color:rgba(196,93,44,.12);font-weight:600}
.si .ct{margin-left:auto;font-size:10px;font-family:'IBM Plex Mono',monospace;background:var(--bg2);padding:1px 6px;border-radius:8px;color:var(--tx3)}
.sb-foot{padding:10px;border-top:1px solid var(--bd2);font-size:10.5px;color:var(--tx3)}
.sb-foot button{background:none;border:none;color:var(--tx2);cursor:pointer;font-size:10.5px;padding:4px 8px;border-radius:4px}
.sb-foot button:hover{color:var(--ac);background:var(--bg)}
.mn{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{padding:12px 22px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;gap:10px;background:var(--cd)}
.topbar h2{font-size:17px;font-weight:700;letter-spacing:-.03em;flex:1}
.area{flex:1;overflow-y:auto;padding:18px 22px}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:var(--r);font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--bd);background:var(--cd);color:var(--tx);transition:all .1s;font-family:'Outfit',sans-serif}
.btn:hover{border-color:var(--tx3);background:var(--cd2)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.bp{background:var(--ac);color:#fff;border-color:var(--ac)}.bp:hover:not(:disabled){background:var(--ac2)}
.bs{padding:5px 9px;font-size:11px}
.bg{border:none;background:none;color:var(--tx2);padding:5px 8px}.bg:hover{color:var(--tx);background:var(--bg)}
.bd2btn{background:var(--rd2);color:var(--rd);border-color:var(--rd2)}.bd2btn:hover:not(:disabled){background:var(--rd);color:#fff;border-color:var(--rd)}
.card{background:var(--cd);border:1px solid var(--bd2);border-radius:var(--rl);padding:16px 18px;margin-bottom:12px}
.ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px}
.ch h3{font-size:14px;font-weight:700;letter-spacing:-.02em}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;padding:7px 10px;font-size:10.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;border-bottom:1px solid var(--bd2)}
tbody td{padding:9px 10px;font-size:12.5px;border-bottom:1px solid var(--bd2)}
tbody tr{cursor:pointer;transition:background .06s}tbody tr:hover{background:var(--bg)}tbody tr:last-child td{border-bottom:none}
.m{font-family:'IBM Plex Mono',monospace;font-size:11.5px}
.tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10.5px;font-weight:600;font-family:'IBM Plex Mono',monospace}
.tg{background:var(--gn2);color:var(--gn)}.tb{background:var(--bl2);color:var(--bl)}.ta{background:var(--am2);color:var(--am)}.tc{background:var(--ac3);color:var(--ac)}
.crumbs{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx3);margin-bottom:14px;flex-wrap:wrap}
.crumbs span{cursor:pointer;transition:color .08s}.crumbs span:hover{color:var(--ac)}.crumbs .sep{color:var(--bd);cursor:default}.crumbs .cur{color:var(--tx);font-weight:600;cursor:default}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.st{background:var(--cd);border:1px solid var(--bd2);border-radius:var(--rl);padding:14px}
.st-l{font-size:10.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:500}
.st-v{font-size:22px;font-weight:700;font-family:'IBM Plex Mono',monospace;letter-spacing:-.04em;margin-top:3px}
.mbg{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px}
.mdl{background:var(--cd);border:1px solid var(--bd);border-radius:12px;width:100%;max-width:680px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column}
.mdl.sm{max-width:540px}
.mh{padding:14px 18px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.mh h3{font-size:15px;font-weight:700}
.mb2{padding:18px;flex:1;overflow-y:auto}
.mf{padding:10px 18px;border-top:1px solid var(--bd2);display:flex;justify-content:flex-end;gap:6px;align-items:center;flex-shrink:0}
.merr{background:var(--rd2);color:var(--rd);padding:8px 12px;border-radius:var(--r);font-size:12px;margin:0 18px;border:1px solid var(--rd)}
.fld{margin-bottom:12px}.fld label{display:block;font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
.fld input,.fld select,.fld textarea{width:100%;padding:7px 11px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font-size:13px;font-family:'Outfit',sans-serif;outline:none;transition:border-color .1s}
.fld input:focus,.fld select:focus,.fld textarea:focus{border-color:var(--ac)}
.fld textarea{resize:vertical;min-height:44px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fr3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.section-hdr{font-size:10.5px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 8px;padding-top:14px;border-top:1px solid var(--bd2)}
.section-hdr:first-of-type{margin-top:0;padding-top:0;border-top:none}
.tplist{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.tpcard{padding:11px 13px;border-radius:var(--r);border:1px solid var(--bd);background:var(--cd2);display:flex;flex-direction:column;gap:3px}
.tpcard h5{font-size:13px;font-weight:700}
.tpcard .meta{font-size:10.5px;color:var(--tx3)}
.tpcard .row{display:flex;gap:4px;margin-top:6px}
.runtpl{padding:14px 16px;border-radius:var(--r);border:1.5px solid var(--ac);background:var(--ac3);color:var(--ac);cursor:pointer;text-align:left;transition:all .1s;font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;display:flex;flex-direction:column;gap:2px}
.runtpl:hover{background:var(--ac);color:#fff}
.runtpl .sub{font-size:10.5px;font-weight:500;opacity:.85;font-family:'IBM Plex Mono',monospace}
.psearchres{max-height:280px;overflow-y:auto;border:1px solid var(--bd);border-radius:var(--r);background:var(--cd2)}
.psearchres .row{padding:7px 10px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px}
.psearchres .row:hover{background:var(--ac3)}.psearchres .row:last-child{border-bottom:none}
.tplist-item{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--bd2);border-radius:var(--r);background:var(--cd2);font-size:12px}
.tplist-item .pn{font-family:'IBM Plex Mono',monospace;font-weight:700;min-width:90px}
.tplist-item .desc{flex:1;color:var(--tx2)}
.tplist-item .qty{display:flex;align-items:center;gap:4px}
.tplist-item input{width:54px;padding:3px 6px;text-align:center}
.tklist-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--bd2);border-radius:var(--r);background:var(--cd2);font-size:12px;margin-bottom:4px}
.tklist-item input{flex:1;padding:3px 6px;border:none;background:transparent}
.tklist-item input:focus{outline:1px solid var(--ac);background:var(--bg)}
.wo{border:2px solid var(--bd);border-radius:12px;background:var(--cd);overflow:hidden}
.wh{padding:16px 20px;border-bottom:1px solid var(--bd2);display:flex;justify-content:space-between;align-items:flex-start}
.ws{padding:14px 20px;border-bottom:1px solid var(--bd2)}.ws:last-child{border-bottom:none}
.ws h4{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.wi{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.wi div label{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;display:block}
.wi div p{font-size:13px;margin-top:1px}
.wk{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bd2);font-size:13px}.wk:last-child{border-bottom:none}
.ck{width:20px;height:20px;border-radius:4px;border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .1s;flex-shrink:0}
.ck.on{background:var(--gn);border-color:var(--gn);color:#fff}
.cr{display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px}
.cr.tot{font-weight:700;font-size:14px;border-top:2px solid var(--tx);padding-top:8px;margin-top:6px}
.aip{display:flex;flex-direction:column;height:100%}
.aim{flex:1;overflow-y:auto;padding:14px}
.am{margin-bottom:10px;max-width:85%}.am.u{margin-left:auto}
.am .bb{padding:9px 13px;border-radius:var(--rl);font-size:13px;line-height:1.5}
.am.u .bb{background:var(--ac);color:#fff;border-bottom-right-radius:2px}
.am.a .bb{background:var(--cd);border:1px solid var(--bd2);border-bottom-left-radius:2px}
.am .sn{font-size:9.5px;color:var(--tx3);margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.ab{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--bd2);background:var(--cd)}
.ab input{flex:1;padding:8px 12px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:'Outfit',sans-serif;background:var(--bg);outline:none}
.ab input:focus{border-color:var(--ac)}
.empty{text-align:center;padding:36px 16px;color:var(--tx3)}.empty p{font-size:13px;margin-top:5px}
.loading{text-align:center;padding:36px 16px;color:var(--tx3);font-size:13px}
.toast{position:fixed;bottom:20px;right:20px;background:var(--gn);color:#fff;padding:10px 16px;border-radius:var(--r);font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:200;animation:slideIn .2s}
.toast.err{background:var(--rd)}
@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
@media print{.sb,.topbar,.ab,.btn{display:none!important}.app{display:block}.area{padding:10px}.wo{border-width:1px}}
`;

// =============================================
// MODAL SHELL
// =============================================
function ModalShell({
  title, children, onClose, onSave, saveLabel = 'Save', saveDisabled = false, size = 'sm',
}: {
  title: string; children: React.ReactNode; onClose: () => void;
  onSave: () => Promise<void> | void; saveLabel?: string; saveDisabled?: boolean; size?: 'sm' | 'lg';
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
          <button className="btn bp" onClick={handleSave} disabled={saving || saveDisabled}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// CUSTOMER FORM (UPDATED — now includes Pricing & Fees section)
// =============================================
function CustomerForm({ initial, onSaveAsync, onClose }: { initial: Partial<Customer> | null; onSaveAsync: (c: Partial<Customer>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Customer>>(
    initial || {
      name: '', contact_name: '', phone: '', email: '', billing_address: '', notes: '',
      default_fees: {
        labor_rate: 0,             // not used (lives on templates) but kept in DB for compatibility
        environmental_fee: 0,
        travel_charge: 0,
        service_supplies: 0,
        oil_sample_fee: 0,         // not used anymore
        oil_retail_per_gallon: 0,
        oil_cost_per_gallon: 0,
      },
    }
  );

  const fees = form.default_fees || {
    labor_rate: 0, environmental_fee: 0, travel_charge: 0, service_supplies: 0,
    oil_sample_fee: 0, oil_retail_per_gallon: 0, oil_cost_per_gallon: 0,
  };

  const setFee = (key: string, value: number) => {
    setForm(prev => ({
      ...prev,
      default_fees: { ...(prev.default_fees as any || {}), [key]: value },
    }));
  };

  return (
    <ModalShell
      title={initial?.customer_id ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose}
      onSave={() => onSaveAsync(form)}
      saveDisabled={!form.name}
      size="lg"
    >
      <div className="section-hdr">Contact Info</div>
      <div className="fld"><label>Business Name</label><input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
      <div className="fr">
        <div className="fld"><label>Contact</label><input value={form.contact_name || ''} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
        <div className="fld"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="fld"><label>Email</label><input value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
      <div className="fld"><label>Billing Address</label><input value={form.billing_address || ''} onChange={e => setForm(p => ({ ...p, billing_address: e.target.value }))} /></div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>

      <div className="section-hdr">Pricing & Fees (defaults for this customer)</div>
      <p style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 10 }}>
        These pre-fill on every new work order for this customer. You can still edit them per work order.
        Labor stays on each service template since it varies by service.
      </p>
      <div className="fr3">
        <div className="fld">
          <label>Travel Charge ($)</label>
          <input type="number" step="0.01" value={fees.travel_charge || 0} onChange={e => setFee('travel_charge', Number(e.target.value) || 0)} />
        </div>
        <div className="fld">
          <label>Environmental Fee ($)</label>
          <input type="number" step="0.01" value={fees.environmental_fee || 0} onChange={e => setFee('environmental_fee', Number(e.target.value) || 0)} />
        </div>
        <div className="fld">
          <label>Service Supplies ($)</label>
          <input type="number" step="0.01" value={fees.service_supplies || 0} onChange={e => setFee('service_supplies', Number(e.target.value) || 0)} />
        </div>
      </div>
      <div className="fr">
        <div className="fld">
          <label>Oil Retail (per gallon)</label>
          <input type="number" step="0.01" value={fees.oil_retail_per_gallon || 0} onChange={e => setFee('oil_retail_per_gallon', Number(e.target.value) || 0)} />
        </div>
        <div className="fld">
          <label>Oil Cost (per gallon)</label>
          <input type="number" step="0.01" value={fees.oil_cost_per_gallon || 0} onChange={e => setFee('oil_cost_per_gallon', Number(e.target.value) || 0)} />
        </div>
      </div>
    </ModalShell>
  );
}

// =============================================
// UNIT FORM
// =============================================
function UnitForm({ initial, customer_id, engines, onSaveAsync, onClose }: { initial: Partial<FleetUnit> | null; customer_id?: string; engines: Engine[]; onSaveAsync: (u: Partial<FleetUnit>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<FleetUnit>>(initial || { customer_id: customer_id || '', unit_number: '', nickname: '', engine_id: engines[0]?.engine_id || null, type: '', make: '', model: '', year: '', serial_number: '', current_hours: 0, notes: '' });
  return (
    <ModalShell title={initial?.unit_id ? 'Edit Unit' : 'Add Fleet Unit'} onClose={onClose} onSave={() => onSaveAsync(form)} saveDisabled={!form.unit_number}>
      <div className="fr">
        <div className="fld"><label>Unit Number</label><input value={form.unit_number || ''} onChange={e => setForm(p => ({ ...p, unit_number: e.target.value }))} placeholder="e.g. I-14" autoFocus /></div>
        <div className="fld"><label>Nickname</label><input value={form.nickname || ''} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Tub Truck" /></div>
      </div>
      <div className="fld">
        <label>Engine</label>
        <select value={form.engine_id || ''} onChange={e => setForm(p => ({ ...p, engine_id: e.target.value || null }))}>
          <option value="">— No engine —</option>
          {engines.map(en => <option key={en.engine_id} value={en.engine_id}>{en.name}</option>)}
        </select>
      </div>
      <div className="fr">
        <div className="fld"><label>Type</label><input value={form.type || ''} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} placeholder="Tractor, Harvester..." /></div>
        <div className="fld"><label>Make</label><input value={form.make || ''} onChange={e => setForm(p => ({ ...p, make: e.target.value }))} /></div>
      </div>
      <div className="fr">
        <div className="fld"><label>Model</label><input value={form.model || ''} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} /></div>
        <div className="fld"><label>Year</label><input value={form.year || ''} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} /></div>
      </div>
      <div className="fld"><label>Serial Number</label><input value={form.serial_number || ''} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
      <div className="fld"><label>Engine Hours</label><input type="number" value={form.current_hours || 0} onChange={e => setForm(p => ({ ...p, current_hours: Number(e.target.value) || 0 }))} /></div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
    </ModalShell>
  );
}

// =============================================
// ENGINE FORM
// =============================================
function EngineForm({ initial, onSaveAsync, onClose }: { initial: Partial<Engine> | null; onSaveAsync: (e: Partial<Engine>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Engine>>(initial || { name: '', manufacturer: '', displacement: '', oil_type: '15W-40', oil_capacity_gallons: 0, notes: '' });
  return (
    <ModalShell title={initial?.engine_id ? 'Edit Engine' : 'Add Engine'} onClose={onClose} onSave={() => onSaveAsync(form)} saveDisabled={!form.name}>
      <div className="fld"><label>Engine Name</label><input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Cat 4.4" autoFocus /></div>
      <div className="fr">
        <div className="fld"><label>Manufacturer</label><input value={form.manufacturer || ''} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} placeholder="Caterpillar" /></div>
        <div className="fld"><label>Displacement</label><input value={form.displacement || ''} onChange={e => setForm(p => ({ ...p, displacement: e.target.value }))} placeholder="4.4L" /></div>
      </div>
      <div className="fr">
        <div className="fld"><label>Oil Type</label><input value={form.oil_type || ''} onChange={e => setForm(p => ({ ...p, oil_type: e.target.value }))} /></div>
        <div className="fld"><label>Oil Capacity (gallons)</label><input type="number" step="0.1" value={form.oil_capacity_gallons || 0} onChange={e => setForm(p => ({ ...p, oil_capacity_gallons: Number(e.target.value) || 0 }))} /></div>
      </div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
    </ModalShell>
  );
}

// =============================================
// PART FORM
// =============================================
function PartForm({ initial, onSaveAsync, onClose }: { initial: Partial<Part> | null; onSaveAsync: (p: Partial<Part>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Part>>(initial || { part_number: '', description: '', manufacturer: 'CAT', category: 'Other', retail_price: 0, cost: 0, supplier: 'CAT', notes: '' });
  const margin = (form.retail_price || 0) - (form.cost || 0);
  const marginPct = form.cost && form.cost > 0 ? (margin / form.cost) * 100 : 0;
  return (
    <ModalShell title={initial?.part_id ? 'Edit Part' : 'Add Part'} onClose={onClose} onSave={() => onSaveAsync(form)} saveDisabled={!form.part_number || !form.description}>
      <div className="fr">
        <div className="fld"><label>Part Number</label><input value={form.part_number || ''} onChange={e => setForm(p => ({ ...p, part_number: e.target.value }))} autoFocus /></div>
        <div className="fld"><label>Manufacturer</label>
          <select value={form.manufacturer || ''} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))}>
            {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="fld"><label>Description</label><input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
      <div className="fr">
        <div className="fld"><label>Category</label>
          <select value={form.category || 'Other'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="fld"><label>Supplier</label>
          <select value={form.supplier || ''} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))}>
            {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="fr">
        <div className="fld"><label>Cost</label><input type="number" step="0.01" value={form.cost || 0} onChange={e => setForm(p => ({ ...p, cost: Number(e.target.value) || 0 }))} /></div>
        <div className="fld"><label>Retail Price</label><input type="number" step="0.01" value={form.retail_price || 0} onChange={e => setForm(p => ({ ...p, retail_price: Number(e.target.value) || 0 }))} /></div>
      </div>
      <div style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--tx2)', marginBottom: 12 }}>
        Margin: <strong>{formatMoney(round2(margin))}</strong> ({marginPct.toFixed(1)}%)
      </div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
    </ModalShell>
  );
}

// =============================================
// SERVICE TEMPLATE FORM
// =============================================
function ServiceTemplateForm({
  initial, unit_id, parts, onSaveAsync, onClose,
}: {
  initial: Partial<ServiceTemplate> | null; unit_id: string; parts: Part[];
  onSaveAsync: (t: Partial<ServiceTemplate>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<ServiceTemplate>>(
    initial || { unit_id, name: '', labor: 325, parts_list: [], tasks: [], notes: '' }
  );
  const [partSearch, setPartSearch] = useState('');

  const partsByNumber = useMemo(() => {
    const m: Record<string, Part> = {};
    for (const p of parts) m[p.part_number] = p;
    return m;
  }, [parts]);

  const filteredParts = useMemo(() => {
    if (!partSearch.trim()) return [];
    const q = partSearch.toLowerCase();
    return parts.filter(p =>
      p.part_number.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.manufacturer.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [parts, partSearch]);

  const addPart = (part_number: string) => {
    setForm(prev => {
      const existing = prev.parts_list?.find(p => p.part_number === part_number);
      if (existing) {
        return { ...prev, parts_list: prev.parts_list!.map(p => p.part_number === part_number ? { ...p, qty: p.qty + 1 } : p) };
      }
      return { ...prev, parts_list: [...(prev.parts_list || []), { part_number, qty: 1 }] };
    });
    setPartSearch('');
  };

  const removePart = (part_number: string) => {
    setForm(prev => ({ ...prev, parts_list: prev.parts_list?.filter(p => p.part_number !== part_number) || [] }));
  };

  const setPartQty = (part_number: string, qty: number) => {
    setForm(prev => ({ ...prev, parts_list: prev.parts_list?.map(p => p.part_number === part_number ? { ...p, qty: Math.max(1, qty) } : p) || [] }));
  };

  const addTask = () => setForm(prev => ({ ...prev, tasks: [...(prev.tasks || []), ''] }));
  const setTask = (i: number, v: string) => setForm(prev => ({ ...prev, tasks: prev.tasks?.map((t, idx) => idx === i ? v : t) || [] }));
  const removeTask = (i: number) => setForm(prev => ({ ...prev, tasks: prev.tasks?.filter((_, idx) => idx !== i) || [] }));

  return (
    <ModalShell
      title={initial?.template_id ? 'Edit Service Template' : 'Add Service Template'}
      onClose={onClose}
      onSave={() => onSaveAsync({ ...form, tasks: form.tasks?.filter(t => t.trim()) || [] })}
      saveDisabled={!form.name?.trim()}
      size="lg"
    >
      <div className="fr">
        <div className="fld">
          <label>Service Name</label>
          <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 500hr Service, Wheel Gear Oil, Annual" autoFocus />
        </div>
        <div className="fld">
          <label>Labor ($)</label>
          <input type="number" step="0.01" value={form.labor || 0} onChange={e => setForm(p => ({ ...p, labor: Number(e.target.value) || 0 }))} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Parts ({form.parts_list?.length || 0})
        </label>
        {form.parts_list && form.parts_list.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {form.parts_list.map(ref => {
              const part = partsByNumber[ref.part_number];
              return (
                <div key={ref.part_number} className="tplist-item">
                  <span className="pn">{ref.part_number}</span>
                  <span className="desc">{part ? `${part.description} — ${part.manufacturer}` : '⚠️ Part not in catalog'}</span>
                  <div className="qty">
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>QTY</span>
                    <input type="number" min="1" value={ref.qty} onChange={e => setPartQty(ref.part_number, Number(e.target.value) || 1)} />
                  </div>
                  <button className="btn bs bg" onClick={() => removePart(ref.part_number)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
        <input
          type="text"
          value={partSearch}
          onChange={e => setPartSearch(e.target.value)}
          placeholder="Search parts catalog (by part #, description, or manufacturer)..."
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", outline: 'none', marginBottom: 6 }}
        />
        {partSearch.trim() && (
          <div className="psearchres">
            {filteredParts.length === 0 ? (
              <div className="row" style={{ color: 'var(--tx3)', cursor: 'default' }}>No parts match. Add new parts from the Parts Catalog.</div>
            ) : (
              filteredParts.map(p => (
                <div key={p.part_id} className="row" onClick={() => addPart(p.part_number)}>
                  <span className="m" style={{ fontWeight: 700, minWidth: 90 }}>{p.part_number}</span>
                  <span style={{ flex: 1 }}>{p.description}</span>
                  <span className="tag tb">{p.manufacturer}</span>
                  <span className="m" style={{ color: 'var(--tx2)' }}>{formatMoney(p.retail_price)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Tasks ({form.tasks?.length || 0})
          </label>
          <button className="btn bs" onClick={addTask}>+ Add Task</button>
        </div>
        {form.tasks && form.tasks.length > 0 ? (
          form.tasks.map((t, i) => (
            <div key={i} className="tklist-item">
              <input value={t} onChange={e => setTask(i, e.target.value)} placeholder="e.g. Drain engine oil" />
              <button className="btn bs bg" onClick={() => removeTask(i)}>✕</button>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>
            No tasks yet. Click "+ Add Task" to add work items that will appear as a checklist on each work order.
          </div>
        )}
      </div>

      <div className="fld">
        <label>Notes</label>
        <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes about this service template" />
      </div>
    </ModalShell>
  );
}

// =============================================
// COPY TEMPLATE FORM
// =============================================
function CopyTemplateForm({
  unit_id, units, customers, templates, onSaveAsync, onClose,
}: {
  unit_id: string; units: FleetUnit[]; customers: Customer[]; templates: ServiceTemplate[];
  onSaveAsync: (template: Partial<ServiceTemplate>) => Promise<void>; onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [newName, setNewName] = useState('');

  const otherTemplates = useMemo(() => templates.filter(t => t.unit_id !== unit_id), [templates, unit_id]);
  const selected = otherTemplates.find(t => t.template_id === selectedId);

  useEffect(() => { if (selected && !newName) setNewName(selected.name); }, [selected]);

  return (
    <ModalShell
      title="Copy Service Template"
      onClose={onClose}
      onSave={async () => {
        if (!selected) return;
        await onSaveAsync({
          unit_id, name: newName || selected.name, labor: selected.labor,
          parts_list: selected.parts_list, tasks: selected.tasks, notes: selected.notes,
        });
      }}
      saveDisabled={!selected || !newName.trim()}
      size="lg"
    >
      {otherTemplates.length === 0 ? (
        <div className="empty"><p>No templates exist on other units yet. Create one on another unit first, then copy from here.</p></div>
      ) : (
        <>
          <div className="fld">
            <label>Choose a template to copy</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} autoFocus>
              <option value="">— Select a template —</option>
              {otherTemplates.map(t => {
                const u = units.find(x => x.unit_id === t.unit_id);
                const c = u ? customers.find(x => x.customer_id === u.customer_id) : null;
                const label = `${t.name} (${u?.unit_number || '?'}${c ? ' — ' + c.name : ''})`;
                return <option key={t.template_id} value={t.template_id}>{label}</option>;
              })}
            </select>
          </div>
          {selected && (
            <>
              <div className="fld">
                <label>Name on this unit</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--tx2)' }}>
                <div><strong>Labor:</strong> {formatMoney(selected.labor)}</div>
                <div><strong>Parts:</strong> {selected.parts_list.length}</div>
                <div><strong>Tasks:</strong> {selected.tasks.length}</div>
              </div>
            </>
          )}
        </>
      )}
    </ModalShell>
  );
}

// =============================================
// SETTINGS FORM
// =============================================
function SettingsForm({ settings, onSaveAsync }: { settings: CompanySettings | null | undefined; onSaveAsync: (s: Partial<CompanySettings>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<CompanySettings>>({
    company_name: '', address: '', phone: '', email: '', tax_id: '',
    payment_terms: 'Net 15', tax_rate_percent: 2.25, invoice_footer_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setToast(null);
    try {
      await onSaveAsync(form);
      setToast({ msg: 'Settings saved!', err: false });
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to save', err: true });
      setTimeout(() => setToast(null), 4000);
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="card">
        <div className="ch"><h3>Company Settings</h3></div>
        <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>Your business info. This will appear on invoices and work orders.</p>
        <div className="fld"><label>Company Name</label><input value={form.company_name || ''} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} /></div>
        <div className="fld"><label>Address</label><textarea value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
        <div className="fr">
          <div className="fld"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
          <div className="fld"><label>Email</label><input value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        </div>
        <div className="fr">
          <div className="fld"><label>Tax ID / EIN</label><input value={form.tax_id || ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} /></div>
          <div className="fld"><label>Payment Terms</label><input value={form.payment_terms || ''} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} /></div>
        </div>
        <div className="fld">
          <label>Tax Rate (%) — applies to parts + oil only</label>
          <input type="number" step="0.01" value={form.tax_rate_percent || 0} onChange={e => setForm(p => ({ ...p, tax_rate_percent: Number(e.target.value) || 0 }))} />
        </div>
        <div className="fld"><label>Invoice Footer Notes</label><textarea value={form.invoice_footer_notes || ''} onChange={e => setForm(p => ({ ...p, invoice_footer_notes: e.target.value }))} /></div>
        <button className="btn bp" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
      {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

// =============================================
// MAIN APP
// =============================================
type ModalType =
  | null
  | { t: 'addCust' | 'editCust'; d?: Customer }
  | { t: 'addUnit' | 'editUnit'; d?: FleetUnit; customer_id?: string }
  | { t: 'addEngine' | 'editEngine'; d?: Engine }
  | { t: 'addPart' | 'editPart'; d?: Part }
  | { t: 'addTemplate' | 'editTemplate'; d?: ServiceTemplate; unit_id?: string }
  | { t: 'copyTemplate'; unit_id: string }
  | { t: 'confirmDelete'; what: string; onConfirm: () => Promise<void> };

export default function OilTrackApp({ user }: { user: User }) {
  const { data: company } = useCompanySettings();
  const upsertCompany = useUpsertCompanySettings();
  const { data: customers = [], isLoading: loadingCustomers } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const { data: parts = [] } = useParts();
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const { data: engines = [] } = useEngines();
  const createEngine = useCreateEngine();
  const updateEngine = useUpdateEngine();
  const { data: units = [] } = useFleetUnits();
  const createUnit = useCreateFleetUnit();
  const updateUnit = useUpdateFleetUnit();
  const { data: templates = [] } = useServiceTemplates();
  const createTemplate = useCreateServiceTemplate();
  const updateTemplate = useUpdateServiceTemplate();
  const deleteTemplate = useDeleteServiceTemplate();
  const { data: workOrders = [] } = useWorkOrders();
  const createWorkOrder = useCreateWorkOrder();
  const updateWorkOrder = useUpdateWorkOrder();

  const [pg, setPg] = useState('dashboard');
  const [trail, setTrail] = useState<{ p: string; id: string; lbl: string }[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [aiMsgs, setAiMsgs] = useState([
    { r: 'a', t: "Hey! I'm your OilTrack assistant. Ask me about specs, parts, service history — or paste invoice data and I'll help you build work orders." },
  ]);
  const [aiIn, setAiIn] = useState('');
  const [aiLoad, setAiLoad] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 4000 : 2500);
  };

  const nav = useCallback((p: string, id: string, lbl: string) => {
    setTrail(pr => [...pr, { p, id, lbl }]);
    setPg(p);
  }, []);
  const back = useCallback(() => {
    setTrail(pr => {
      const n = pr.slice(0, -1);
      setPg(n.length ? n[n.length - 1].p : 'dashboard');
      return n;
    });
  }, []);
  const goTo = useCallback((i: number) => {
    setTrail(pr => {
      const n = pr.slice(0, i + 1);
      setPg(n[n.length - 1].p);
      return n;
    });
  }, []);

  const getEngine = (id: string | null | undefined) => engines.find(e => e.engine_id === id);
  const getCustomer = (id: string) => customers.find(c => c.customer_id === id);
  const getUnit = (id: string) => units.find(u => u.unit_id === id);
  const getPart = (part_number: string) => parts.find(p => p.part_number === part_number);
  const templatesForUnit = (unit_id: string) => templates.filter(t => t.unit_id === unit_id);

  // Build a work order from a service template
  async function buildWorkOrderFromTemplate(template: ServiceTemplate): Promise<string | null> {
    const u = getUnit(template.unit_id);
    if (!u) return null;
    const customer = getCustomer(u.customer_id);
    if (!customer) return null;
    const engine = getEngine(u.engine_id);
    const cf = customer.default_fees || {} as any;

    const checklist: ChecklistItem[] = (template.tasks.length > 0 ? template.tasks : [
      'Drain engine oil', 'Replace filters', 'Greased all lube points', 'Checked for leaks', 'Recorded engine hours',
    ]).map(t => ({ text: t, done: false }));

    const partsUsed: ServicePartSnapshot[] = [];
    for (const ref of template.parts_list) {
      const p = getPart(ref.part_number);
      if (!p) continue;
      const override = customer.part_price_overrides?.[ref.part_number];
      const retail = override?.retail ?? p.retail_price;
      const cost = override?.cost ?? p.cost;
      partsUsed.push({
        part_number: p.part_number, description: p.description, manufacturer: p.manufacturer, supplier: p.supplier,
        qty: ref.qty, retail_price: retail, cost,
        line_total_retail: round2(retail * ref.qty),
        line_total_cost: round2(cost * ref.qty),
      });
    }

    const oil = engine && engine.oil_capacity_gallons > 0 ? {
      type: engine.oil_type, gallons: engine.oil_capacity_gallons,
      retail_per_gallon: cf.oil_retail_per_gallon || 0,
      cost_per_gallon: cf.oil_cost_per_gallon || 0,
      total_retail: round2(engine.oil_capacity_gallons * (cf.oil_retail_per_gallon || 0)),
      total_cost: round2(engine.oil_capacity_gallons * (cf.oil_cost_per_gallon || 0)),
    } : null;

    const fees = {
      labor: template.labor || 0,
      environmental_fee: cf.environmental_fee || 0,
      travel_charge: cf.travel_charge || 0,
      service_supplies: cf.service_supplies || 0,
      oil_sample_fee: 0,                       // deprecated, kept for db compatibility
      other: 0,
    };

    const tax_rate_percent = company?.tax_rate_percent ?? 2.25;
    const totals = calculateWorkOrderTotals({ parts: partsUsed, oil, fees, tax_rate_percent });

    try {
      const wo = await createWorkOrder.mutateAsync({
        customer_id: u.customer_id, unit_id: u.unit_id,
        service_template_id: template.template_id,
        status: 'open', tier: template.name,
        service_date: new Date().toISOString().split('T')[0],
        engine_hours: u.current_hours || 0, technician: '',
        customer_provided_filters: false, notes: '',
        parts_used: partsUsed, oil_used: oil, fees,
        tax_rate_percent, ...totals, checklist,
      });
      return wo.work_order_id;
    } catch (err: any) {
      showToast(`Failed: ${err?.message || 'Unknown error'}`, true);
      return null;
    }
  }

  async function buildBlankWorkOrder(unit_id: string): Promise<string | null> {
    const u = getUnit(unit_id);
    if (!u) return null;
    const customer = getCustomer(u.customer_id);
    if (!customer) return null;
    const cf = customer.default_fees || {} as any;

    const fees = {
      labor: 0,
      environmental_fee: cf.environmental_fee || 0,
      travel_charge: cf.travel_charge || 0,
      service_supplies: cf.service_supplies || 0,
      oil_sample_fee: 0,
      other: 0,
    };

    const tax_rate_percent = company?.tax_rate_percent ?? 2.25;
    const totals = calculateWorkOrderTotals({ parts: [], oil: null, fees, tax_rate_percent });

    try {
      const wo = await createWorkOrder.mutateAsync({
        customer_id: u.customer_id, unit_id: u.unit_id,
        status: 'open', tier: 'Custom Service',
        service_date: new Date().toISOString().split('T')[0],
        engine_hours: u.current_hours || 0, technician: '',
        customer_provided_filters: false, notes: '',
        parts_used: [], oil_used: null, fees,
        tax_rate_percent, ...totals, checklist: [],
      });
      return wo.work_order_id;
    } catch (err: any) {
      showToast(`Failed: ${err?.message || 'Unknown error'}`, true);
      return null;
    }
  }

  const sendAi = useCallback(async () => {
    if (!aiIn.trim()) return;
    const msg = aiIn.trim();
    setAiIn('');
    setAiMsgs(p => [...p, { r: 'u', t: msg }]);
    setAiLoad(true);
    const ctx = JSON.stringify({
      customers: customers.map(c => ({ name: c.name })),
      units: units.map(u => ({ num: u.unit_number, nick: u.nickname, engine: getEngine(u.engine_id)?.name })),
      engines: engines.map(e => ({ name: e.name, oil: e.oil_type, cap: e.oil_capacity_gallons })),
      templates: templates.map(t => ({ unit: getUnit(t.unit_id)?.unit_number, name: t.name, labor: t.labor, parts: t.parts_list.length, tasks: t.tasks.length })),
      wos: workOrders.slice(0, 8).map(w => ({ unit: getUnit(w.unit_id)?.unit_number, date: w.service_date, tier: w.tier, total: w.total_retail, status: w.status })),
    });
    try {
      const r = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctx, messages: [{ role: 'user', content: msg }] }),
      });
      const d = await r.json();
      setAiMsgs(p => [...p, { r: 'a', t: d.content?.map((c: any) => c.text || '').join('\n') || 'Error' }]);
    } catch {
      setAiMsgs(p => [...p, { r: 'a', t: 'Connection error.' }]);
    }
    setAiLoad(false);
  }, [aiIn, customers, units, engines, templates, workOrders]);

  useEffect(() => { aiRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMsgs]);

  const curId = trail.length ? trail[trail.length - 1].id : null;

  const IC = (d: string, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  const iHome = 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10';
  const iUsers = 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2 M9 7a4 4 0 100 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75';
  const iClip = 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M8 2h8v4H8z';
  const iHist = 'M12 2a10 10 0 100 20 10 10 0 000-20z M12 6v6l4 2';
  const iChat = 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z';
  const iPlus = 'M12 5v14 M5 12h14';
  const iBack = 'M19 12H5 M12 19l-7-7 7-7';
  const iChk = 'M20 6L9 17l-5-5';
  const iSend = 'M22 2L11 13 M22 2l-7 20-4-9-9-4z';
  const iPrint = 'M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z';
  const iEdit = 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z';
  const iGear = 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z';
  const iBox = 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z';
  const iEngine = 'M5 8h14l-1 10H6L5 8z M9 8V5h6v3';
  const iOut = 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9';
  const iTrash = 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2';

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  const renderDashboard = () => {
    const open = workOrders.filter(w => w.status === 'open');
    const rev = workOrders.filter(w => w.status === 'complete').reduce((s, w) => s + (w.total_retail || 0), 0);
    return (
      <>
        <div className="stats">
          <div className="st"><div className="st-l">Customers</div><div className="st-v" style={{ color: 'var(--ac)' }}>{customers.length}</div></div>
          <div className="st"><div className="st-l">Fleet Units</div><div className="st-v" style={{ color: 'var(--bl)' }}>{units.length}</div></div>
          <div className="st"><div className="st-l">Open WOs</div><div className="st-v" style={{ color: open.length ? 'var(--am)' : 'var(--gn)' }}>{open.length}</div></div>
          <div className="st"><div className="st-l">Revenue</div><div className="st-v">${Math.round(rev).toLocaleString()}</div></div>
        </div>
        {open.length > 0 && (
          <div className="card">
            <div className="ch"><h3>Open Work Orders</h3></div>
            <table>
              <thead><tr><th>Invoice #</th><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th></tr></thead>
              <tbody>
                {open.map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                    <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{getUnit(w.unit_id)?.unit_number}</td>
                    <td>{getCustomer(w.customer_id)?.name}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td className="m">{w.service_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card">
          <div className="ch"><h3>Recent Completed</h3></div>
          {workOrders.filter(w => w.status === 'complete').length === 0 ? (
            <div className="empty"><p>No completed work orders yet</p></div>
          ) : (
            <table>
              <thead><tr><th>Invoice #</th><th>Date</th><th>Unit</th><th>Customer</th><th>Total</th></tr></thead>
              <tbody>
                {workOrders.filter(w => w.status === 'complete').slice(0, 8).map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                    <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                    <td className="m">{w.service_date}</td>
                    <td style={{ fontWeight: 600 }}>{getUnit(w.unit_id)?.unit_number}</td>
                    <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderCustomers = () => (
    <div className="card">
      <div className="ch">
        <h3>Customers</h3>
        <button className="btn bs bp" onClick={() => setModal({ t: 'addCust' })}>{IC(iPlus, 15)} Add</button>
      </div>
      {loadingCustomers ? <div className="loading">Loading customers…</div> : customers.length === 0 ? (
        <div className="empty"><p>No customers yet. Click "Add" to create your first one.</p></div>
      ) : (
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Units</th><th>WOs</th></tr></thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.customer_id} onClick={() => nav('cust', c.customer_id, c.name)}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: 'var(--tx2)' }}>{c.contact_name || '—'}</td>
                <td className="m">{units.filter(u => u.customer_id === c.customer_id).length}</td>
                <td className="m">{workOrders.filter(w => w.customer_id === c.customer_id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderCustDetail = () => {
    const c = customers.find(x => x.customer_id === curId);
    if (!c) return <div className="empty"><p>Not found</p></div>;
    const cu = units.filter(u => u.customer_id === curId);
    const cf = c.default_fees || {} as any;
    return (
      <>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>{c.billing_address || 'No address'}</div>
            </div>
            <button className="btn bs" onClick={() => setModal({ t: 'editCust', d: c })}>{IC(iEdit, 14)} Edit</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[['Contact', c.contact_name], ['Phone', c.phone], ['Email', c.email]].map(([l, v]) => (
              <div key={l}>
                <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block' }}>{l}</label>
                <p style={{ fontSize: 13 }}>{v || '—'}</p>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--bd2)', paddingTop: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--ac)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Default Pricing</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, fontSize: 12 }}>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Travel</span><div className="m">{formatMoney(cf.travel_charge || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Env Fee</span><div className="m">{formatMoney(cf.environmental_fee || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Supplies</span><div className="m">{formatMoney(cf.service_supplies || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Oil Retail/gal</span><div className="m">{formatMoney(cf.oil_retail_per_gallon || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Oil Cost/gal</span><div className="m">{formatMoney(cf.oil_cost_per_gallon || 0)}</div></div>
            </div>
          </div>
          {c.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx2)', padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>{c.notes}</div>}
        </div>
        <div className="card">
          <div className="ch">
            <h3>Equipment ({cu.length})</h3>
            <button className="btn bs bp" onClick={() => setModal({ t: 'addUnit', customer_id: curId! })}>{IC(iPlus, 15)} Add</button>
          </div>
          {cu.length === 0 ? <div className="empty"><p>No equipment yet</p></div> : (
            <table>
              <thead><tr><th>Unit #</th><th>Description</th><th>Engine</th><th>Hours</th><th>Templates</th><th>WOs</th></tr></thead>
              <tbody>
                {cu.map(u => (
                  <tr key={u.unit_id} onClick={() => nav('unit', u.unit_id, u.unit_number)}>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u.unit_number}</td>
                    <td>{u.nickname || u.type}{u.make ? ` — ${u.make} ${u.model || ''}` : ''}</td>
                    <td><span className="tag tb">{getEngine(u.engine_id)?.name || '—'}</span></td>
                    <td className="m">{u.current_hours > 0 ? u.current_hours.toLocaleString() : '—'}</td>
                    <td className="m">{templatesForUnit(u.unit_id).length}</td>
                    <td className="m">{workOrders.filter(w => w.unit_id === u.unit_id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderUnitDetail = () => {
    const u = units.find(x => x.unit_id === curId);
    if (!u) return <div className="empty"><p>Not found</p></div>;
    const e = getEngine(u.engine_id);
    const c = getCustomer(u.customer_id);
    const uTpls = templatesForUnit(u.unit_id);
    const uWOs = workOrders.filter(w => w.unit_id === curId);

    return (
      <>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>{u.unit_number} — {u.nickname || u.type}</div>
              <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>{c?.name} · {e?.name || 'No engine'}</div>
            </div>
            <button className="btn bs" onClick={() => setModal({ t: 'editUnit', d: u })}>{IC(iEdit, 14)} Edit</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              ['Make/Model', `${u.make || '—'} ${u.model || ''}`],
              ['Engine', e?.name || '—'],
              ['Hours', u.current_hours > 0 ? u.current_hours.toLocaleString() : '—'],
              ['Oil', e ? `${e.oil_capacity_gallons || '—'} gal ${e.oil_type || ''}` : '—'],
              ['Year', u.year || '—'],
              ['Serial', u.serial_number || '—'],
            ].map(([l, v]) => (
              <div key={l}>
                <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block' }}>{l}</label>
                <p style={{ fontSize: 13, fontWeight: l === 'Engine' ? 600 : 400, color: l === 'Engine' ? 'var(--bl)' : 'inherit' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h3>Service Templates ({uTpls.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bs" onClick={() => setModal({ t: 'copyTemplate', unit_id: u.unit_id })}>Copy from another unit</button>
              <button className="btn bs bp" onClick={() => setModal({ t: 'addTemplate', unit_id: u.unit_id })}>{IC(iPlus, 15)} Add Service Template</button>
            </div>
          </div>
          {uTpls.length === 0 ? (
            <div className="empty"><p>No service templates yet for this unit. Click "Add Service Template" to create one.</p></div>
          ) : (
            <div className="tplist">
              {uTpls.map(t => (
                <div key={t.template_id} className="tpcard">
                  <h5>{t.name}</h5>
                  <div className="meta">Labor: {formatMoney(t.labor)}</div>
                  <div className="meta">{t.parts_list.length} parts · {t.tasks.length} tasks</div>
                  <div className="row">
                    <button className="btn bs" onClick={() => setModal({ t: 'editTemplate', d: t })}>Edit</button>
                    <button className="btn bs bd2btn" onClick={() => setModal({ t: 'confirmDelete', what: `the template "${t.name}"`, onConfirm: async () => { await deleteTemplate.mutateAsync(t.template_id); showToast('Template deleted'); } })}>{IC(iTrash, 13)}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ch"><h3>Create Work Order</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {uTpls.map(t => (
              <button key={t.template_id} className="runtpl" onClick={async () => {
                const wid = await buildWorkOrderFromTemplate(t);
                if (wid) nav('wo', wid, t.name);
              }}>
                <span>{t.name}</span>
                <span className="sub">{formatMoney(t.labor)} · {t.parts_list.length}p</span>
              </button>
            ))}
            <button className="btn" style={{ padding: '14px 16px', fontSize: 13, justifyContent: 'flex-start', borderStyle: 'dashed' }} onClick={async () => {
              const wid = await buildBlankWorkOrder(u.unit_id);
              if (wid) nav('wo', wid, 'Custom Service');
            }}>
              {IC(iPlus, 14)} One-off Service (blank)
            </button>
          </div>
        </div>

        <div className="card">
          <div className="ch"><h3>History ({uWOs.length})</h3></div>
          {uWOs.length === 0 ? <div className="empty"><p>No work orders</p></div> : (
            <table>
              <thead><tr><th>Invoice #</th><th>Date</th><th>Service</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {uWOs.map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                    <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                    <td className="m">{w.service_date}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td><span className={`tag ${w.status === 'complete' ? 'tg' : 'ta'}`}>{w.status}</span></td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderWO = () => {
    const wo = workOrders.find(w => w.work_order_id === curId);
    if (!wo) return <div className="empty"><p>Not found</p></div>;
    const u = getUnit(wo.unit_id);
    const c = getCustomer(wo.customer_id);
    const e = u ? getEngine(u.engine_id) : null;
    const isOpen = wo.status === 'open';

    const togChecklist = (i: number) => {
      const newList = wo.checklist.map((it, j) => j === i ? { ...it, done: !it.done } : it);
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { checklist: newList } });
    };
    const updField = (k: string, v: any) => updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { [k]: v } });
    const updFee = (k: string, v: string) => {
      const newFees = { ...wo.fees, [k]: Number(v) || 0 };
      const totals = calculateWorkOrderTotals({ parts: wo.parts_used, oil: wo.oil_used, fees: newFees, tax_rate_percent: wo.tax_rate_percent });
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { fees: newFees, ...totals } });
    };
    const addChecklistItem = () => {
      if (!newItem.trim()) return;
      const newList = [...wo.checklist, { text: newItem.trim(), done: false }];
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { checklist: newList } });
      setNewItem('');
    };
    const complete = () => {
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { status: 'complete', completed_at: new Date().toISOString() } });
      if (wo.engine_hours > 0 && u) {
        updateUnit.mutate({ unit_id: u.unit_id, updates: { current_hours: wo.engine_hours } });
      }
    };

    const bySupplier: Record<string, ServicePartSnapshot[]> = {};
    if (!wo.customer_provided_filters) {
      for (const p of wo.parts_used) {
        if (!bySupplier[p.supplier]) bySupplier[p.supplier] = [];
        bySupplier[p.supplier].push(p);
      }
    }
    const allDone = wo.checklist.length > 0 && wo.checklist.every(i => i.done);
    const inp = { padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 12, background: 'var(--bg)', fontFamily: "'Outfit',sans-serif" };

    return (
      <div className="wo">
        <div className="wh">
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>Work Order {formatInvoiceNumber(wo.invoice_number)}</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>{c?.name} · {u?.unit_number} ({u?.nickname}) · {e?.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", background: isOpen ? 'var(--am2)' : 'var(--gn2)', color: isOpen ? 'var(--am)' : 'var(--gn)' }}>{wo.status.toUpperCase()}</span>
            <button className="btn bs" onClick={() => window.print()}>{IC(iPrint, 15)}</button>
          </div>
        </div>
        <div className="ws">
          <h4>Details</h4>
          <div className="wi">
            <div><label>Unit</label><p style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number}</p></div>
            <div><label>Equipment</label><p>{u?.nickname}{u?.make ? ` — ${u.make} ${u.model || ''}` : ''}</p></div>
            <div><label>Engine</label><p style={{ color: 'var(--bl)', fontWeight: 600 }}>{e?.name}</p></div>
            <div><label>Service</label><p><span className="tag tc">{wo.tier}</span></p></div>
            <div><label>Date</label>{isOpen ? <input type="date" value={wo.service_date} onChange={ev => updField('service_date', ev.target.value)} style={inp} /> : <p className="m">{wo.service_date}</p>}</div>
            <div><label>Engine Hours</label>{isOpen ? <input type="number" value={wo.engine_hours || 0} onChange={ev => updField('engine_hours', Number(ev.target.value) || 0)} style={{ ...inp, fontFamily: "'IBM Plex Mono',monospace", width: 120 }} /> : <p className="m">{wo.engine_hours || '—'}</p>}</div>
            <div><label>Technician</label>{isOpen ? <input value={wo.technician} onChange={ev => updField('technician', ev.target.value)} placeholder="Name" style={{ ...inp, width: 140 }} /> : <p>{wo.technician || '—'}</p>}</div>
            <div><label>Invoice #</label><p className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(wo.invoice_number)}</p></div>
            {isOpen && (
              <div><label>Cust. Filters</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={wo.customer_provided_filters} onChange={ev => updField('customer_provided_filters', ev.target.checked)} style={{ accentColor: 'var(--ac)' }} />
                  Customer providing
                </label>
              </div>
            )}
          </div>
        </div>

        {!wo.customer_provided_filters && wo.parts_used.length > 0 && (
          <div className="ws">
            <h4>Parts / Filter Order</h4>
            <table>
              <thead><tr><th>Part #</th><th>Description</th><th>Supplier</th><th>Qty</th><th>Retail</th><th>Total</th></tr></thead>
              <tbody>
                {wo.parts_used.map((p, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td className="m" style={{ fontWeight: 600 }}>{p.part_number}</td>
                    <td style={{ fontSize: 12 }}>{p.description}</td>
                    <td><span className="tag tb">{p.supplier}</span></td>
                    <td className="m">{p.qty}</td>
                    <td className="m">{formatMoney(p.retail_price)}</td>
                    <td className="m">{formatMoney(p.line_total_retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(bySupplier).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>By supplier</p>
                {Object.entries(bySupplier).map(([s, ps]) => (
                  <div key={s} style={{ marginBottom: 6, padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--tx2)', marginBottom: 3 }}>{s}</div>
                    {ps.map((p, i) => (
                      <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                        <span className="m">{p.part_number} — {p.description}</span>
                        <span className="m">x{p.qty}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {wo.oil_used && (
          <div className="ws">
            <h4>Oil</h4>
            <div style={{ padding: '6px 10px', background: 'var(--gn2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--gn)' }}>
              <strong>{wo.oil_used.gallons} gal {wo.oil_used.type}</strong> · {formatMoney(wo.oil_used.total_retail)}
            </div>
          </div>
        )}

        <div className="ws">
          <h4>Work Performed</h4>
          {wo.checklist.map((it, i) => (
            <div key={i} className="wk">
              {isOpen ? (
                <div className={`ck${it.done ? ' on' : ''}`} onClick={() => togChecklist(i)}>{it.done && IC(iChk, 14)}</div>
              ) : (
                <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: it.done ? 'var(--gn)' : 'var(--tx3)', fontSize: 14 }}>{it.done ? '\u2713' : '\u25CB'}</div>
              )}
              <span style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--tx3)' : 'inherit' }}>{it.text}</span>
            </div>
          ))}
          {isOpen && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newItem} onChange={ev => setNewItem(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && addChecklistItem()} placeholder="Add checklist item..." style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 12, fontFamily: "'Outfit',sans-serif", background: 'var(--bg)', outline: 'none' }} />
              <button className="btn bs" onClick={addChecklistItem}>{IC(iPlus, 15)}</button>
            </div>
          )}
        </div>

        <div className="ws">
          <h4>Cost Breakdown</h4>
          {isOpen ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[['Labor', 'labor'], ['Travel', 'travel_charge'], ['Supplies', 'service_supplies'], ['Environmental', 'environmental_fee'], ['Other', 'other']].map(([l, k]) => (
                <div key={k} className="fld" style={{ marginBottom: 6 }}>
                  <label>{l}</label>
                  <input type="number" step="0.01" value={(wo.fees as any)[k] || 0} onChange={ev => updFee(k, ev.target.value)} style={{ padding: '5px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace" }} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {Object.entries(wo.fees).filter(([k, v]) => v > 0 && k !== 'oil_sample_fee').map(([k, v]) => (
                <div key={k} className="cr">
                  <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span className="m">{formatMoney(Number(v))}</span>
                </div>
              ))}
            </>
          )}
          <div className="cr"><span>Parts + Oil (taxable)</span><span className="m">{formatMoney(wo.subtotal_parts_oil)}</span></div>
          <div className="cr"><span>Labor & Fees</span><span className="m">{formatMoney(wo.subtotal_fees)}</span></div>
          <div className="cr"><span>Tax ({wo.tax_rate_percent}%)</span><span className="m">{formatMoney(wo.tax_amount)}</span></div>
          <div className="cr tot"><span>TOTAL</span><span className="m">{formatMoney(wo.total_retail)}</span></div>
          <div className="cr" style={{ color: 'var(--gn)', fontSize: 11, marginTop: 4 }}>
            <span>Profit ({wo.profit_margin_percent?.toFixed(1) || '0'}% margin)</span>
            <span className="m">{formatMoney(wo.profit)}</span>
          </div>
        </div>

        <div className="ws">
          <h4>Notes</h4>
          {isOpen ? (
            <textarea value={wo.notes} onChange={ev => updField('notes', ev.target.value)} placeholder="Observations, issues..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", background: 'var(--bg)', minHeight: 50, resize: 'vertical', outline: 'none' }} />
          ) : (
            <p style={{ fontSize: 13, color: wo.notes ? 'var(--tx)' : 'var(--tx3)' }}>{wo.notes || 'No notes'}</p>
          )}
        </div>

        {isOpen && (
          <div className="ws" style={{ background: allDone ? 'var(--gn2)' : 'var(--bg)', textAlign: 'center', padding: 20 }}>
            <button className="btn bp" style={{ fontSize: 14, padding: '10px 28px' }} onClick={complete}>{IC(iChk, 14)} Complete Work Order</button>
            {!allDone && wo.checklist.length > 0 && <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>{wo.checklist.filter(x => !x.done).length} unchecked</p>}
          </div>
        )}
      </div>
    );
  };

  const renderWOs = () => {
    const open = workOrders.filter(w => w.status === 'open');
    const done = workOrders.filter(w => w.status === 'complete');
    return (
      <>
        <div className="card">
          <div className="ch"><h3>Open ({open.length})</h3></div>
          {open.length === 0 ? <div className="empty"><p>No open work orders</p></div> : (
            <table>
              <thead><tr><th>Invoice #</th><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th></tr></thead>
              <tbody>
                {open.map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                    <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{getUnit(w.unit_id)?.unit_number}</td>
                    <td>{getCustomer(w.customer_id)?.name}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td className="m">{w.service_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="ch"><h3>Completed ({done.length})</h3></div>
          {done.length === 0 ? <div className="empty"><p>None yet</p></div> : (
            <table>
              <thead><tr><th>Invoice #</th><th>Date</th><th>Unit</th><th>Customer</th><th>Service</th><th>Total</th></tr></thead>
              <tbody>
                {done.slice(0, 20).map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                    <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                    <td className="m">{w.service_date}</td>
                    <td style={{ fontWeight: 600 }}>{getUnit(w.unit_id)?.unit_number}</td>
                    <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderHistory = () => {
    const all = workOrders.filter(w => w.status === 'complete');
    return (
      <div className="card">
        <div className="ch"><h3>Service History ({all.length})</h3></div>
        {all.length === 0 ? <div className="empty"><p>No history yet</p></div> : (
          <table>
            <thead><tr><th>Invoice #</th><th>Date</th><th>Unit</th><th>Customer</th><th>Service</th><th>Hours</th><th>Total</th></tr></thead>
            <tbody>
              {all.map(w => (
                <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, formatInvoiceNumber(w.invoice_number))}>
                  <td className="m" style={{ fontWeight: 700 }}>{formatInvoiceNumber(w.invoice_number)}</td>
                  <td className="m">{w.service_date}</td>
                  <td style={{ fontWeight: 600 }}>{getUnit(w.unit_id)?.unit_number}</td>
                  <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                  <td><span className="tag tc">{w.tier}</span></td>
                  <td className="m">{w.engine_hours || '—'}</td>
                  <td className="m">{formatMoney(w.total_retail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderParts = () => (
    <div className="card">
      <div className="ch">
        <h3>Parts Catalog ({parts.length})</h3>
        <button className="btn bs bp" onClick={() => setModal({ t: 'addPart' })}>{IC(iPlus, 15)} Add Part</button>
      </div>
      {parts.length === 0 ? <div className="empty"><p>No parts yet. Add parts to use them in service templates.</p></div> : (
        <table>
          <thead><tr><th>Part #</th><th>Description</th><th>Mfr</th><th>Category</th><th>Cost</th><th>Retail</th><th></th></tr></thead>
          <tbody>
            {parts.map(p => (
              <tr key={p.part_id} onClick={() => setModal({ t: 'editPart', d: p })}>
                <td className="m" style={{ fontWeight: 700 }}>{p.part_number}</td>
                <td>{p.description}</td>
                <td><span className="tag tb">{p.manufacturer}</span></td>
                <td style={{ fontSize: 11, color: 'var(--tx2)' }}>{p.category}</td>
                <td className="m">{formatMoney(p.cost)}</td>
                <td className="m" style={{ fontWeight: 600 }}>{formatMoney(p.retail_price)}</td>
                <td><button className="btn bs">{IC(iEdit, 13)}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderEngines = () => (
    <div className="card">
      <div className="ch">
        <h3>Engines ({engines.length})</h3>
        <button className="btn bs bp" onClick={() => setModal({ t: 'addEngine' })}>{IC(iPlus, 15)} Add Engine</button>
      </div>
      {engines.length === 0 ? <div className="empty"><p>No engines yet.</p></div> : (
        <table>
          <thead><tr><th>Name</th><th>Manufacturer</th><th>Displacement</th><th>Oil</th><th>Units</th><th></th></tr></thead>
          <tbody>
            {engines.map(e => (
              <tr key={e.engine_id} onClick={() => setModal({ t: 'editEngine', d: e })}>
                <td style={{ fontWeight: 700, color: 'var(--bl)' }}>{e.name}</td>
                <td>{e.manufacturer || '—'}</td>
                <td className="m">{e.displacement || '—'}</td>
                <td className="m">{e.oil_capacity_gallons || '—'} gal {e.oil_type}</td>
                <td className="m">{units.filter(u => u.engine_id === e.engine_id).length}</td>
                <td><button className="btn bs">{IC(iEdit, 13)}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderSettings = () => (
    <SettingsForm settings={company} onSaveAsync={async (s) => { await upsertCompany.mutateAsync(s); }} />
  );

  const renderAi = () => (
    <div className="aip" style={{ height: 'calc(100vh - 110px)' }}>
      <div className="aim">
        {aiMsgs.map((msg, i) => (
          <div key={i} className={`am ${msg.r === 'a' ? 'a' : 'u'}`}>
            <div className="sn">{msg.r === 'a' ? 'OilTrack AI' : 'You'}</div>
            <div className="bb" style={{ whiteSpace: 'pre-wrap' }}>{msg.t}</div>
          </div>
        ))}
        {aiLoad && (
          <div className="am a">
            <div className="sn">OilTrack AI</div>
            <div className="bb" style={{ color: 'var(--tx3)' }}>Thinking...</div>
          </div>
        )}
        <div ref={aiRef} />
      </div>
      <div className="ab">
        <input placeholder="Ask about specs, parts, history..." value={aiIn} onChange={ev => setAiIn(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && sendAi()} />
        <button className="btn bp" onClick={sendAi} disabled={aiLoad}>{IC(iSend, 15)}</button>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!modal) return null;

    if (modal.t === 'confirmDelete') {
      return (
        <ModalShell title="Confirm Delete" onClose={() => setModal(null)} onSave={async () => { await modal.onConfirm(); setModal(null); }} saveLabel="Delete">
          <p style={{ fontSize: 13 }}>Are you sure you want to delete {modal.what}? This cannot be undone.</p>
        </ModalShell>
      );
    }

    if (modal.t === 'addCust' || modal.t === 'editCust') {
      return (
        <CustomerForm
          initial={modal.d || null}
          onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            if (modal.t === 'addCust') { await createCustomer.mutateAsync(form); showToast('Customer added'); }
            else { await updateCustomer.mutateAsync({ customer_id: (modal.d as Customer).customer_id, updates: form }); showToast('Customer updated'); }
            setModal(null);
          }}
        />
      );
    }
    if (modal.t === 'addUnit' || modal.t === 'editUnit') {
      return (
        <UnitForm
          initial={modal.d || null} customer_id={modal.customer_id} engines={engines}
          onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            if (modal.t === 'addUnit') { await createUnit.mutateAsync(form); showToast('Unit added'); }
            else { await updateUnit.mutateAsync({ unit_id: (modal.d as FleetUnit).unit_id, updates: form }); showToast('Unit updated'); }
            setModal(null);
          }}
        />
      );
    }
    if (modal.t === 'addEngine' || modal.t === 'editEngine') {
      return (
        <EngineForm
          initial={modal.d || null} onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            if (modal.t === 'addEngine') { await createEngine.mutateAsync(form); showToast('Engine added'); }
            else { await updateEngine.mutateAsync({ engine_id: (modal.d as Engine).engine_id, updates: form }); showToast('Engine updated'); }
            setModal(null);
          }}
        />
      );
    }
    if (modal.t === 'addPart' || modal.t === 'editPart') {
      return (
        <PartForm
          initial={modal.d || null} onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            if (modal.t === 'addPart') { await createPart.mutateAsync(form); showToast('Part added'); }
            else { await updatePart.mutateAsync({ part_id: (modal.d as Part).part_id, updates: form }); showToast('Part updated'); }
            setModal(null);
          }}
        />
      );
    }
    if (modal.t === 'addTemplate' || modal.t === 'editTemplate') {
      const target_unit_id = modal.t === 'addTemplate' ? modal.unit_id! : (modal.d as ServiceTemplate).unit_id;
      return (
        <ServiceTemplateForm
          initial={modal.d || null} unit_id={target_unit_id} parts={parts} onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            if (modal.t === 'addTemplate') { await createTemplate.mutateAsync(form); showToast('Template added'); }
            else { await updateTemplate.mutateAsync({ template_id: (modal.d as ServiceTemplate).template_id, updates: form }); showToast('Template updated'); }
            setModal(null);
          }}
        />
      );
    }
    if (modal.t === 'copyTemplate') {
      return (
        <CopyTemplateForm
          unit_id={modal.unit_id} units={units} customers={customers} templates={templates} onClose={() => setModal(null)}
          onSaveAsync={async (form) => {
            await createTemplate.mutateAsync(form);
            showToast('Template copied');
            setModal(null);
          }}
        />
      );
    }
    return null;
  };

  const menu = [
    { id: 'dashboard', l: 'Dashboard', ic: iHome },
    { id: 'customers', l: 'Customers', ic: iUsers, ct: customers.length },
    { id: 'parts', l: 'Parts Catalog', ic: iBox, ct: parts.length },
    { id: 'engines', l: 'Engines', ic: iEngine, ct: engines.length },
    { id: 'workorders', l: 'Work Orders', ic: iClip, ct: workOrders.filter(w => w.status === 'open').length || undefined },
    { id: 'history', l: 'Service History', ic: iHist },
    { id: 'ai', l: 'AI Assistant', ic: iChat },
    { id: 'settings', l: 'Settings', ic: iGear },
  ];

  const active = ['cust', 'unit'].includes(pg) ? 'customers' : pg === 'wo' ? 'workorders' : pg;
  const title =
    pg === 'cust' ? trail[trail.length - 1]?.lbl || 'Customer' :
    pg === 'unit' ? trail[trail.length - 1]?.lbl || 'Unit' :
    pg === 'wo' ? trail[trail.length - 1]?.lbl || 'Work Order' :
    menu.find(m => m.id === pg)?.l || 'Dashboard';

  const crumbs = trail.length > 0 && (
    <div className="crumbs">
      <span onClick={() => { setTrail([]); setPg(active); }}>{active === 'workorders' ? 'Work Orders' : 'Customers'}</span>
      {trail.map((n, i) => (
        <span key={i} style={{ display: 'contents' }}>
          <span className="sep">/</span>
          {i === trail.length - 1 ? <span className="cur">{n.lbl}</span> : <span onClick={() => goTo(i)}>{n.lbl}</span>}
        </span>
      ))}
    </div>
  );

  const pages: Record<string, () => React.ReactNode> = {
    dashboard: renderDashboard, customers: renderCustomers, cust: renderCustDetail,
    unit: renderUnitDetail, wo: renderWO, workorders: renderWOs, history: renderHistory,
    parts: renderParts, engines: renderEngines, settings: renderSettings, ai: renderAi,
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="sb">
          <div className="sb-hd"><h1>OilTrack Pro</h1><p>Complete Fleet Solutions</p></div>
          <nav className="sb-nav">
            {menu.map(m => (
              <div key={m.id} className={`si${active === m.id ? ' on' : ''}`} onClick={() => { setPg(m.id); setTrail([]); }}>
                {IC(m.ic)}{m.l}{m.ct != null && <span className="ct">{m.ct}</span>}
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            <div style={{ marginBottom: 4 }}>{user.email}</div>
            <button onClick={handleSignOut}>{IC(iOut, 12)} Sign out</button>
          </div>
        </div>
        <div className="mn">
          <div className="topbar">
            {trail.length > 0 && <button className="btn bs bg" onClick={back}>{IC(iBack, 16)}</button>}
            <h2>{title}</h2>
          </div>
          <div className="area">{crumbs}{(pages[pg] || renderDashboard)()}</div>
        </div>
        {renderModal()}
        {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
      </div>
    </>
  );
}
