'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import { ModalShell, LocalNumberInput, NullableNumberInput, IC as uiIC, ICONS } from '@/components/ui';
import {
  CustomerTabs, CustomerTypeBadge, CUSTOMER_TYPE_LABEL, FollowUpsWidget, FollowUpsPage,
  useFollowUpBadgeCount, useOverdueCustomerIds,
} from '@/components/crm';
import {
  CustomerFilterOrders, FilterOrdersPage, FilterOrderDetail, SupplierListPage, MachineFilters,
  useOrderTotals, useFilterBilling, buildFilterInvoicePdfBlob, filterInvoiceFileName,
} from '@/components/filters';
import { filterOrdersApi, contactsApi } from '@/lib/crmHooks';
import { orderLabel } from '@/components/crm';
import { isoDateOf, loadSaveAs } from '@/components/ui';
import type { FilterOrder } from '@/types/database';
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
  useDeleteFleetUnit,
  useServiceTemplates,
  useCreateServiceTemplate,
  useUpdateServiceTemplate,
  useDeleteServiceTemplate,
  useWorkOrders,
  useCreateWorkOrder,
  useUpdateWorkOrder,
  useDeleteWorkOrder,
  useInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useAdjustInventoryByPartIds,
  ServiceTemplate,
} from '@/lib/hooks';
import {
  calculateWorkOrderTotals,
  round2,
  formatMoney,
  formatInvoiceNumber,
  discountedPrice,
  effectiveDiscountPct,
  formatPct,
  partChargePrice,
  partDiscountPct,
  recalculatePartLine,
  workOrderPartsSavings,
  workOrderHasDiscountLines,
} from '@/lib/calculations';
import type {
  Customer,
  Part,
  Engine,
  FleetUnit,
  ServicePartSnapshot,
  CompanySettings,
  ChecklistItem,
  WorkOrder,
  InventoryItem,
} from '@/types/database';

const SUPPLIERS = ['CAT', 'John Deere', 'Case IH', 'AGCO', 'Baldwin', 'Donaldson', 'Fleetguard/Cummins', 'Other'];
const CATEGORIES = ['Fuel System', 'Fuel/Water Separator', 'Air Filter', 'Air Filter - Secondary', 'Oil Filter', 'Hydraulic', 'Transmission', 'Cabin Filter', 'DEF', 'Coolant', 'Lab/Testing', 'Other'];

type BillingRange = '30' | '60' | '90' | 'year' | 'all';
type BillingSort = 'date-new' | 'date-old' | 'price-high' | 'price-low' | 'inv-high' | 'inv-low' | 'cust';

// Display the "primary identifier" of a work order (unit number, falling back to invoice # if no unit)
function woPrimaryId(wo: WorkOrder, unit?: FleetUnit): string {
  if (unit?.unit_number) return unit.unit_number;
  if (wo.invoice_number) return `INV-${wo.invoice_number}`;
  return `WO-${wo.work_order_id.slice(0, 6)}`;
}

// Display the invoice number — handles null (unbilled WOs)
function invNumDisplay(wo: WorkOrder): string {
  return wo.invoice_number ? `INV-${wo.invoice_number}` : 'Unbilled';
}

// MMDDYYYY, no separators — for PDF filenames
function fmtMMDDYYYY(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${mm}${dd}${yyyy}`;
}

// Year parser that doesn't shift due to UTC
function yearOfServiceDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const y = Number((d.split('-')[0]) || 0);
  return isNaN(y) || y === 0 ? null : y;
}

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
.bwarn{background:var(--am2);color:var(--am);border-color:var(--am2)}.bwarn:hover:not(:disabled){background:var(--am);color:#fff;border-color:var(--am)}
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
.mwarn{background:var(--am2);color:var(--am);padding:8px 12px;border-radius:var(--r);font-size:12px;margin:0 18px;border:1px solid var(--am)}
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
.wh{padding:16px 20px;border-bottom:1px solid var(--bd2);display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}
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

/* ===== Billing filter + sort bar ===== */
.filterbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--cd);border:1px solid var(--bd2);border-radius:var(--rl);margin-bottom:12px}
.filterbar .lbl{font-size:11px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-right:4px}
.filterbar .sort-sel{padding:5px 9px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);font-size:12px;font-family:'Outfit',sans-serif;color:var(--tx);cursor:pointer;outline:none}
.filterbar .sort-sel:hover{border-color:var(--ac)}
.filterbar .sort-sel:focus{border-color:var(--ac)}
.filterbar .sep{width:1px;height:16px;background:var(--bd2);margin:0 4px}

/* ===== Revenue year dropdown ===== */
.st-yr-sel{font-size:10px;padding:1px 4px;border:1px solid var(--bd);border-radius:3px;background:var(--bg);font-family:'IBM Plex Mono',monospace;cursor:pointer;color:var(--tx2);text-transform:none;letter-spacing:0;font-weight:500;outline:none}
.st-yr-sel:hover{border-color:var(--ac)}

/* ===== Inline invoice-number edit ===== */
.inv-cell{display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:2px 6px;border-radius:3px;transition:background .08s}
.inv-cell:hover{background:var(--bg)}
.inv-cell .pencil{opacity:.4;font-size:10px}
.inv-cell:hover .pencil{opacity:1}
.inv-missing{color:var(--tx3);font-style:italic;font-size:11px}

/* ===== Batch select checkbox ===== */
.batch-cb{accent-color:var(--ac);width:14px;height:14px;cursor:pointer}

/* ===== Inventory page ===== */
.inv-stock{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10.5px;font-weight:600;font-family:'IBM Plex Mono',monospace}
.inv-stock-ok{background:var(--gn2);color:var(--gn)}
.inv-stock-low{background:var(--am2);color:var(--am)}
.inv-stock-out{background:var(--rd2);color:var(--rd)}
.inv-qty-input{width:70px;padding:3px 6px;text-align:center;background:var(--bg);border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--tx);outline:none}
.inv-qty-input:focus{border-color:var(--ac)}

/* ===== Inventory add-part modal: scrollable catalog list ===== */
.inv-add-list{max-height:420px;overflow-y:auto;border:1px solid var(--bd);border-radius:var(--r);background:var(--cd2)}
.inv-add-list .row{padding:8px 12px;border-bottom:1px solid var(--bd2);display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.inv-add-list .row:hover{background:var(--ac3)}
.inv-add-list .row:last-child{border-bottom:none}
.inv-add-list .pn{font-family:'IBM Plex Mono',monospace;font-weight:700;min-width:90px}
.inv-add-list .desc{flex:1;color:var(--tx2)}
.inv-add-list .already{color:var(--gn);font-weight:600;font-size:11px;margin-left:8px}

/* ===== PRINT-ONLY: company header (hidden on screen) ===== */
.print-only{display:none}
.fees-print-only{display:none}

/* ===== PRINT STYLES (QuickBooks-style invoice — window envelope ready, single page) ===== */
@page{size:letter;margin:0.4in 0.5in 0.4in 0.5in}
@media print{
  @page{margin:0.5in 0.5in 0.95in 0.5in}
  /* ---- HIDE: app chrome ---- */
  .sb,.topbar,.crumbs,.ab,.tklist-item,.psearchres,.tplist-item .qty input,.runtpl,.tpcard{display:none!important}
  .btn,button{display:none!important}
  .wh{display:none!important}
  .wi{display:none!important}
  .ck{display:none!important}
  .no-print,.cr.no-print{display:none!important}
  .wo input,.wo textarea,.wo select{display:none!important}
  /* hide screen-only oil block (it's now a row in the parts table for print) */
  .screen-only-oil{display:none!important}

  /* ---- LAYOUT RESET ---- */
  body,html{background:#fff!important;color:#000!important;font-size:10pt;font-family:'Outfit',sans-serif}
  .app{display:block!important;height:auto!important;overflow:visible!important}
  .mn{overflow:visible!important;height:auto!important}
  .area{padding:0!important;overflow:visible!important;height:auto!important}
  .wo{border:none!important;border-radius:0!important;padding:0!important;background:#fff!important;position:relative;min-height:10in}

  /* ---- PRINT HEADER (small return address top-left + INVOICE top-right) ---- */
  .print-only{display:block!important}
  .print-header{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:0;border:none!important;margin:0!important}
  .print-header .co h1{font-size:9.5pt;font-weight:600;color:#000;letter-spacing:0;margin:0 0 1pt 0}
  .print-header .co p{font-size:8pt;color:#444;margin:0;line-height:1.25;white-space:pre-wrap}
  .print-header .co p:nth-of-type(n+2){display:none}  /* only show address line, not phone/email/tax (those go to footer) */
  .print-header .inv{text-align:right}
  .print-header .inv .lbl{font-size:14pt;font-weight:500;color:#000;letter-spacing:0.1em;margin-bottom:1pt;text-transform:uppercase}
  .print-header .inv .num{font-size:11pt;font-weight:600;font-family:'IBM Plex Mono',monospace;color:#000;margin-bottom:1pt}
  .print-header .inv .date{font-size:8.5pt;color:#444;line-height:1.3}

  /* ---- BILL TO (positioned for #10 window envelope) ---- */
  /* Window envelope window: ~4.125" wide x 1.125" tall, positioned ~0.5" from left, ~2.25" from top of folded page */
  /* Page folds in thirds. The window position when folded means: ~1.85" from top of unfolded page, 0.875" from left */
  .print-billto{position:absolute;top:1.7in;left:0.375in;width:4in;display:block;margin:0;padding:0}
  .print-billto > div:nth-child(2){display:none}  /* hide the equipment block here — rendered separately below */
  .print-billto .lbl{font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:0.08em;font-weight:500;margin-bottom:3pt;border:none;padding:0}
  .print-billto p{font-size:10pt;line-height:1.3;margin:0}

  /* ---- MAIN CONTENT (starts below envelope window) ---- */
  /* Class-based ordering (nth-child broke when sections shifted): Details → Work → Parts → Cost → Notes */
  .wo{display:flex;flex-direction:column}
  .wo-details{order:1;margin-top:3.3in}  /* reserves space for absolute header + Bill To window */
  .wo-work{order:2}
  .wo-parts{order:3}
  .ws.wo-parts{page-break-inside:auto}
  .screen-only-oil{order:4}
  .cost-section{order:5}
  .wo-notes{order:6}
  .wo-notes-empty{display:none!important}
  .print-footnotes{order:7}
  .wo-complete{display:none!important}
  .ws{padding:0!important;border-bottom:none!important;page-break-inside:avoid;margin-bottom:10pt}
  .print-equipment p{font-size:9.5pt;margin:0;line-height:1.4;color:#000!important}
  .ws h4{font-size:7.5pt!important;font-weight:500!important;text-transform:uppercase;letter-spacing:0.08em;color:#888!important;margin:0 0 4pt 0!important;padding:0 0 3pt 0!important;border-bottom:0.5pt solid #999;page-break-after:avoid}

  /* ---- EQUIPMENT (compact one-liner) ---- */
  /* The first .ws is the equipment block. Render its content as one line via the .wi spec below — but .wi is hidden, so we use the screen content */
  /* Actually the screen has equipment in a separate area; use Bill To's right column instead */

  /* ---- PARTS TABLE (roomy QB style with oil row) ---- */
  table{width:100%;border-collapse:collapse;font-size:9.5pt;page-break-inside:auto}
  thead{display:table-header-group}
  th{text-align:left;font-size:7pt;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:#000!important;border-bottom:0.75pt solid #000;padding:5pt 6pt!important;background:#fff!important}
  th:nth-child(4),th:nth-child(5),th:nth-child(6){text-align:right}
  td{padding:5pt 6pt!important;border-bottom:0.25pt solid #ddd;font-size:9.5pt;color:#000!important;background:#fff!important;vertical-align:top}
  tr{page-break-inside:avoid;page-break-after:auto}
  td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right;font-family:'IBM Plex Mono',monospace}
  /* Supplier badges — flatten in print, show as plain text */
  .tag,.tag.tb{background:transparent!important;color:#000!important;border:none!important;padding:0!important;font-size:9.5pt!important;font-weight:400}

  /* ---- Discount-priced parts table: 7 columns, numbers right-aligned ---- */
  .parts-disc th:nth-child(n+3),.parts-disc td:nth-child(n+3){text-align:right}
  .parts-disc td:nth-child(n+3){font-family:'IBM Plex Mono',monospace;white-space:nowrap}
  .parts-disc th:nth-child(2),.parts-disc td:nth-child(2){width:38%}
  .parts-disc td:nth-child(n+3) .print-only{display:inline!important}
  .savings-row{color:#000!important;font-weight:400!important;font-style:italic}

  /* ---- WORK PERFORMED (compact paragraph style) ---- */
  .wk{display:inline!important;padding:0!important;border:none!important;background:transparent!important;font-size:9pt;line-height:1.4;color:#000!important}
  .wk:not(:last-child)::after{content:" · ";color:#666}
  .wk span{display:inline!important;text-decoration:none!important;color:#000!important}
  .wk span[style*="line-through"]{text-decoration:none!important}
  .wk div{display:none!important}

  /* ---- COST BREAKDOWN (every fee broken out, right-aligned) ---- */
  .ws.cost-section{margin-top:14pt;page-break-before:auto}
  /* hide the editable input grid (only screen view shows it) */
  .ws.cost-section > div[style*="grid-template-columns"],.cost-edit-grid{display:none!important}
  /* show fees-print-only block in print (hidden on screen by .fees-print-only base rule) */
  .fees-print-only{display:block!important}
  .cr{display:flex;justify-content:space-between;font-size:9.5pt;padding:2pt 0;width:50%;margin-left:auto;color:#000!important}
  .cr span:first-child{text-transform:capitalize}
  .cr .m,.cr span:last-child{font-family:'IBM Plex Mono',monospace}
  .cr.tot{font-size:12pt;font-weight:500;border-top:1.5pt solid #000;border-bottom:2.5pt double #000;padding:5pt 0;margin-top:4pt;color:#000!important}

  /* ---- NOTES ---- */
  .ws p{font-size:9pt;line-height:1.4;color:#000!important;margin:0}

  /* ---- COMPANY CONTACT FOOTER (per partner request: move to bottom) ---- */
  .print-company-footer{position:fixed;bottom:0.2in;left:0.5in;right:0.5in;padding-top:5pt;border-top:0.5pt solid #999;text-align:center;font-size:8pt;color:#666;line-height:1.35}
}

/* ===== OIL ANALYSIS SLIPS ===== */
.oil-slips-print{position:fixed;inset:0;background:#f0eee8;z-index:9999;overflow:auto;padding:24px}
.oil-slips-actions{display:flex;gap:10px;justify-content:center;margin-bottom:18px}
.oil-slip{width:7.5in;max-width:100%;margin:0 auto 14px;border:2px solid #000;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column}
.oil-slip-hd{display:flex;justify-content:space-between;align-items:baseline;padding:4px 8px;border-bottom:1.5px solid #000}
.oil-slip-hd b{font-size:11.5px;letter-spacing:.5px}
.oil-slip-hd span{font-size:8.5px}
.osrow{display:grid;border-bottom:1px solid #000}
.oil-slip .osrow:last-child{border-bottom:none}
.oscell{border-right:1px solid #000;padding:2px 5px;min-height:29px}
.oscell:last-child{border-right:none}
.osl{display:block;font-size:6.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#333}
.osv{display:block;font-size:10.5px;font-weight:600;min-height:13px}
.osinput{display:block;border:none;outline:none;width:100%;background:#fff8e8;font-family:inherit;font-size:10.5px;font-weight:600;color:#000;padding:0;min-height:13px}
.osinput:focus{background:#ffefc4}
body.printing-oil-slips .app{display:none}
@media print{
  body.printing-oil-slips .app{display:none!important}
  .oil-slips-print{position:static!important;padding:0!important;overflow:visible!important;background:#fff!important}
  .oil-slips-actions{display:none!important}
  .oil-slip{margin:0 0 0.15in 0;width:100%}
  .osinput{background:#fff!important}
}

/* ===== Filter Sales + Customer Tracking ===== */
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.srch{width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:'Outfit',sans-serif;outline:none;color:var(--tx)}
.srch:focus{border-color:var(--ac)}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--bd2);margin-bottom:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;font-size:12.5px;font-weight:600;color:var(--tx2);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;white-space:nowrap;font-family:'Outfit',sans-serif;margin-bottom:-1px}
.tab:hover{color:var(--tx)}
.tab.on{color:var(--ac);border-bottom-color:var(--ac)}
.tab .ct{font-size:10px;font-family:'IBM Plex Mono',monospace;background:var(--bg2);padding:1px 6px;border-radius:8px;color:var(--tx3)}
.tab.on .ct{background:var(--ac3);color:var(--ac)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center}
.chip{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:14px;border:1px solid var(--bd);background:var(--cd);font-size:11.5px;cursor:pointer;font-weight:600;color:var(--tx2);font-family:'Outfit',sans-serif;transition:all .1s}
.chip:hover{border-color:var(--ac);color:var(--tx)}
.chip.on{background:var(--ac);border-color:var(--ac);color:#fff}
.tred{background:var(--rd2);color:var(--rd)}
.tgray{background:var(--bg2);color:var(--tx3)}
.si .ct.alert{background:var(--rd);color:#fff}
.cbx{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--tx)}
.cbx input{accent-color:var(--ac);width:16px;height:16px}
.linkish{color:var(--ac);cursor:pointer;font-weight:600}.linkish:hover{text-decoration:underline}
.linkbtn{border:none;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;margin-left:6px;padding:0}
.subcard{padding:12px;border:1px solid var(--bd);border-radius:var(--r);background:var(--cd2);margin-top:6px}
.cust-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.act-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
/* contacts */
.ctc-list{display:flex;flex-direction:column;gap:8px}
.ctc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--bd2);border-radius:var(--r);background:var(--cd2)}
/* follow-ups */
.fu-sec{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 4px}
.fu-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 10px;border:1px solid var(--bd2);border-left:3px solid var(--bl);border-radius:var(--r);background:var(--cd2);margin-bottom:6px}
.fu-row.overdue{border-left-color:var(--rd);background:var(--rd2)}
.fu-row.done{opacity:.65;border-left-color:var(--gn)}
.fu-actions{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
/* timeline */
.tl{display:flex;flex-direction:column}
.tl-item{display:flex;gap:10px;padding:10px 4px;border-bottom:1px solid var(--bd2)}
.tl-item:last-child{border-bottom:none}
.tl-item:hover{background:var(--cd2)}
.tl-ic{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--bg2);color:var(--tx2)}
.tl-activity .tl-ic{background:var(--ac3);color:var(--ac)}
.tl-followup .tl-ic{background:var(--bl2);color:var(--bl)}
.tl-order .tl-ic{background:var(--gn2);color:var(--gn)}
.tl-invoice .tl-ic{background:var(--am2);color:var(--am)}
/* order lines */
.lines{display:flex;flex-direction:column;gap:6px}
.line{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:8px 10px;border:1px solid var(--bd2);border-radius:var(--r);background:var(--cd2)}
.line-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:200px}
.line-nums{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.line-nums label{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--tx3);text-transform:uppercase;font-weight:600;letter-spacing:.04em}
.num-in{width:72px;padding:4px 6px;text-align:right;background:var(--bg);border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--tx);outline:none}
.num-in:focus{border-color:var(--ac)}
.note-in{padding:3px 8px;background:var(--bg);border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:'Outfit',sans-serif;color:var(--tx);outline:none;min-width:140px}
.line-tot{min-width:74px;text-align:right;font-weight:700}
/* order status stepper */
.stepper{display:flex;gap:0;overflow-x:auto;padding-top:4px}
.step{flex:1;min-width:76px;display:flex;flex-direction:column;align-items:center;position:relative;text-align:center}
.step:not(:last-child)::after{content:'';position:absolute;top:11px;left:calc(50% + 13px);right:calc(-50% + 13px);height:2px;background:var(--bd2)}
.step.done:not(:last-child)::after{background:var(--gn)}
.step .dot{width:24px;height:24px;border-radius:50%;border:2px solid var(--bd);background:var(--cd);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff}
.step.done .dot{background:var(--gn);border-color:var(--gn)}
.step.cur .dot{box-shadow:0 0 0 3px var(--ac3);border-color:var(--ac)}
.step.cancelled .dot{background:var(--rd);border-color:var(--rd)}
.step .lbl{font-size:11px;font-weight:600;margin-top:4px}
.step .when{font-size:10px;color:var(--tx3);font-family:'IBM Plex Mono',monospace;min-height:13px}
.sort-sel{padding:5px 9px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);font-size:12px;font-family:'Outfit',sans-serif;color:var(--tx);cursor:pointer;outline:none;max-width:100%}
.sort-sel:hover,.sort-sel:focus{border-color:var(--ac)}
.ch h3 > svg{display:inline-block;vertical-align:-2px;margin-right:5px}
.vchk{width:24px;height:24px;border-radius:5px;border:1.5px solid var(--bd);background:var(--cd);color:#fff;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;padding:0}
.vchk:hover{border-color:var(--gn)}
.vchk.on{background:var(--gn);border-color:var(--gn)}
.vchk.nd.on{background:var(--tx2);border-color:var(--tx2)}
@media screen{.below-cost td{background:var(--rd2)!important}}
.savings-row{color:var(--gn);font-weight:600}
.tag.nodisc{background:var(--bg2);color:var(--tx2);border:1px solid var(--bd)}
.below-cost-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:var(--rd);color:#fff;font-size:10px;font-weight:700;font-family:'IBM Plex Mono',monospace}
.line.below-cost{background:var(--rd2);border-color:var(--rd)}
.savings-line{display:flex;justify-content:flex-end;gap:16px;font-size:12px;color:var(--gn);font-weight:600;margin-top:6px}
.rev-split{font-size:10.5px;color:var(--tx3);margin-top:2px;font-family:'IBM Plex Mono',monospace}


/* ===== PHONE / SMALL TABLET (screen only — print layout is untouched) ===== */
.menu-btn{display:none}
.sb-bg{display:none}
@media screen and (max-width:820px){
  .app{height:100dvh}
  .sb{position:fixed;top:0;left:0;bottom:0;z-index:150;width:250px;min-width:250px;transform:translateX(-100%);transition:transform .2s ease;box-shadow:none}
  .sb.open{transform:none;box-shadow:4px 0 24px rgba(0,0,0,.18)}
  .sb-bg{display:block;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:140}
  .si{padding:12px 12px;font-size:14px}
  .menu-btn{display:inline-flex}
  .topbar{padding:10px 12px;gap:8px;position:sticky;top:0;z-index:20}
  .topbar h2{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .area{padding:12px 10px 80px}
  .card{padding:12px;overflow-x:auto}
  .stats{grid-template-columns:repeat(2,1fr);gap:8px}
  .st{padding:10px}
  .st-v{font-size:18px}
  .fr,.fr3{grid-template-columns:1fr}
  .wi,.g3{grid-template-columns:repeat(2,1fr)}
  .g5{grid-template-columns:repeat(3,1fr)}
  .cost-edit-grid{grid-template-columns:1fr 1fr!important}
  .wh{padding:12px}.ws{padding:12px}
  .btn{padding:8px 12px;font-size:12.5px}
  .bs{padding:7px 10px;font-size:12px}
  .fld input,.fld select,.fld textarea,.srch,.ab input,.sort-sel,.num-in,.note-in{font-size:16px}
  .num-in{width:80px}
  .mbg{padding:0;align-items:stretch}
  .mdl,.mdl.sm{max-width:none;max-height:none;height:100dvh;border-radius:0;border:none}
  .toast{left:12px;right:12px;bottom:12px;text-align:center}
  tbody td{padding:9px 8px}
  thead th{padding:7px 8px}
  .filterbar{padding:8px}
  .filterbar .sep{display:none}
  .line-main{min-width:0;flex-basis:100%}
  .line-nums{width:100%;justify-content:flex-end}
  .fu-row{align-items:flex-start}
  .fu-actions{width:100%}
  .hide-sm{display:none}
  .area td.m,.area td .tag{white-space:nowrap}
  .step{min-width:60px}
  .step .lbl{font-size:10px}
  .cust-hd{flex-wrap:wrap}
  .crumbs{font-size:11.5px}
  .oil-slips-print{padding:10px}
  .oil-slips-actions{flex-wrap:wrap}
}
@media screen and (max-width:420px){
  .g5{grid-template-columns:repeat(2,1fr)}
}

`;

// Discount shown on an invoice line: "—" for lines sold at full retail
// (no-discount parts / 0% customers) unless the price was changed by hand.
function invoiceDiscountText(p: ServicePartSnapshot): string {
  const price = partChargePrice(p);
  if (!p.price_overridden && (Number(p.discount_pct) || 0) === 0) return '—';
  return formatPct(effectiveDiscountPct(p.retail_price, price));
}

// =============================================
// CUSTOMER FORM
// =============================================
function CustomerForm({ initial, defaultDiscount = 6, onSaveAsync, onClose }: { initial: Partial<Customer> | null; defaultDiscount?: number; onSaveAsync: (c: Partial<Customer>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Customer>>(
    initial || {
      name: '', contact_name: '', phone: '', email: '', billing_address: '', notes: '',
      customer_type: 'service', status: 'active', discount_pct: defaultDiscount,
      default_fees: {
        labor_rate: 0, environmental_fee: 0, travel_charge: 0, service_supplies: 0,
        oil_sample_fee: 0, oil_retail_per_gallon: 0, oil_cost_per_gallon: 0,
      },
    }
  );

  const fees = form.default_fees || {
    labor_rate: 0, environmental_fee: 0, travel_charge: 0, service_supplies: 0,
    oil_sample_fee: 0, oil_retail_per_gallon: 0, oil_cost_per_gallon: 0,
  };

  const setFee = (key: string, value: number) => {
    setForm(prev => ({ ...prev, default_fees: { ...(prev.default_fees as any || {}), [key]: value } }));
  };

  return (
    <ModalShell
      title={initial?.customer_id ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose} onSave={() => onSaveAsync(form)} saveDisabled={!form.name} size="lg"
    >
      <div className="section-hdr">Customer Type</div>
      <div className="chips" role="radiogroup" aria-label="Customer type">
        {(['service', 'filter_only', 'both'] as const).map(t => (
          <button key={t} type="button" className={`chip${(form.customer_type || 'service') === t ? ' on' : ''}`} onClick={() => setForm(p => ({ ...p, customer_type: t }))}>
            {t === 'service' ? 'Service (oil changes)' : t === 'filter_only' ? 'Filter customer only' : 'Both'}
          </button>
        ))}
      </div>
      {initial?.customer_id && (
        <label className="cbx" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={form.status === 'inactive'} onChange={e => setForm(p => ({ ...p, status: e.target.checked ? 'inactive' : 'active' }))} />
          Inactive customer (hidden from the default customer list)
        </label>
      )}
      <div className="section-hdr">Contact Info</div>
      <div className="fld"><label>Business Name</label><input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
      <div className="fr">
        <div className="fld"><label>Contact</label><input value={form.contact_name || ''} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
        <div className="fld"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      </div>
      <div className="fld"><label>Email</label><input value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
      <div className="fld"><label>Billing Address</label><textarea value={form.billing_address || ''} onChange={e => setForm(p => ({ ...p, billing_address: e.target.value }))} placeholder="Street address&#10;City, State ZIP" style={{ minHeight: 60, fontFamily: "'Outfit',sans-serif" }} /></div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>

      <div className="section-hdr">Parts Discount</div>
      <div className="fr">
        <div className="fld"><label>Discount % off retail</label>
          <LocalNumberInput value={Number(form.discount_pct ?? defaultDiscount)} step="0.1" placeholder="0" ariaLabel="Discount percent" onCommit={v => setForm(p => ({ ...p, discount_pct: Math.max(0, Math.min(100, v)) }))} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--tx2)', alignSelf: 'center' }}>Applies to every part on new work orders and filter orders. Oil, labor and fees are not discounted. Orders already saved keep their prices.</p>
      </div>

      {form.customer_type !== 'filter_only' && (<>
      <div className="section-hdr">Pricing & Fees (defaults for this customer)</div>
      <p style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 10 }}>
        These pre-fill on every new work order for this customer. You can still edit them per work order.
        Labor stays on each service template since it varies by service.
      </p>
      <div className="fr3">
        <div className="fld"><label>Travel Charge ($)</label><input type="number" step="0.01" value={fees.travel_charge || 0} onChange={e => setFee('travel_charge', Number(e.target.value) || 0)} /></div>
        <div className="fld"><label>Environmental Fee ($)</label><input type="number" step="0.01" value={fees.environmental_fee || 0} onChange={e => setFee('environmental_fee', Number(e.target.value) || 0)} /></div>
        <div className="fld"><label>Service Supplies ($)</label><input type="number" step="0.01" value={fees.service_supplies || 0} onChange={e => setFee('service_supplies', Number(e.target.value) || 0)} /></div>
      </div>
      <div className="fr">
        <div className="fld"><label>Oil Retail (per gallon)</label><input type="number" step="0.01" value={fees.oil_retail_per_gallon || 0} onChange={e => setFee('oil_retail_per_gallon', Number(e.target.value) || 0)} /></div>
        <div className="fld"><label>Oil Cost (per gallon)</label><input type="number" step="0.01" value={fees.oil_cost_per_gallon || 0} onChange={e => setFee('oil_cost_per_gallon', Number(e.target.value) || 0)} /></div>
      </div>
      <div className="fld">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!(form as any).provides_own_oil} onChange={e => setForm(p => ({ ...p, provides_own_oil: e.target.checked } as any))} style={{ accentColor: 'var(--ac)' }} />
          Customer supplies their own oil
        </label>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>New work orders for this customer will record oil (type & gallons for oil slips) but charge $0.00 for it.</p>
      </div>
      </>)}
    </ModalShell>
  );
}

// =============================================
// UNIT FORM
// =============================================
function UnitForm({ initial, customer_id, engines, hoursLastUpdated, defaultUse = 'service', onSaveAsync, onClose }: { initial: Partial<FleetUnit> | null; customer_id?: string; engines: Engine[]; hoursLastUpdated?: string | null; defaultUse?: 'service' | 'filters'; onSaveAsync: (u: Partial<FleetUnit>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<FleetUnit>>(initial || { customer_id: customer_id || '', unit_number: '', nickname: '', engine_id: defaultUse === 'filters' ? null : engines[0]?.engine_id || null, type: '', make: '', model: '', year: '', serial_number: '', current_hours: 0, notes: '', equipment_use: defaultUse });
  const use = form.equipment_use || 'service';
  const setUse = (u: 'service' | 'filters') => setForm(p => ({
    ...p, equipment_use: u,
    // A new filters-only machine has no engine; switching a new one to servicing picks the first engine like before
    ...(!initial?.unit_id ? { engine_id: u === 'filters' ? null : (p.engine_id || engines[0]?.engine_id || null) } : {}),
  }));
  const isNew = !initial?.unit_id;
  return (
    <ModalShell title={isNew ? 'Add Equipment' : 'Edit Equipment'} onClose={onClose} onSave={() => onSaveAsync(form)} saveDisabled={!form.unit_number?.trim()}>
      <div className="section-hdr">What is this equipment for?</div>
      <div className="chips" role="radiogroup" aria-label="Equipment use">
        <button type="button" className={`chip${use === 'service' ? ' on' : ''}`} onClick={() => setUse('service')}>For servicing (oil changes)</button>
        <button type="button" className={`chip${use === 'filters' ? ' on' : ''}`} onClick={() => setUse('filters')}>Filters only</button>
      </div>
      {use === 'filters' ? (
        <>
          <div className="fld"><label>Equipment Name</label><input value={form.unit_number || ''} onChange={e => setForm(p => ({ ...p, unit_number: e.target.value }))} placeholder="e.g. Kubota M7 tractor" autoFocus /></div>
          <div className="fld"><label>Serial Number (optional)</label><input value={form.serial_number || ''} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
          <p style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Filters-only equipment just needs a name. After saving, add the filters it takes on its page so you can reorder in one click.</p>
        </>
      ) : (
        <>
          <div className="fr">
            <div className="fld"><label>Unit Number</label><input value={form.unit_number || ''} onChange={e => setForm(p => ({ ...p, unit_number: e.target.value }))} placeholder="e.g. I-14" autoFocus /></div>
            <div className="fld"><label>Nickname</label><input value={form.nickname || ''} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Tub Truck" /></div>
          </div>
          <div className="fld"><label>Engine</label>
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
          <div className="fr">
            <div className="fld"><label>Engine Hours</label><input type="number" value={form.current_hours || 0} onChange={e => setForm(p => ({ ...p, current_hours: Number(e.target.value) || 0 }))} />
              {hoursLastUpdated && <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Last updated: {hoursLastUpdated}</p>}
            </div>
            <div className="fld"><label>Hours at Last Service</label><input type="number" value={(form as any).previous_hours || 0} onChange={e => setForm(p => ({ ...p, previous_hours: Number(e.target.value) || 0 } as any))} />
              <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Used to calculate fluid hours on oil slips. Auto-updates after each completed work order.</p>
            </div>
          </div>
          <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        </>
      )}
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
function PartForm({ initial, standardDiscount = 6, onSaveAsync, onClose }: { initial: Partial<Part> | null; standardDiscount?: number; onSaveAsync: (p: Partial<Part>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Part>>(initial || { part_number: '', description: '', manufacturer: 'CAT', category: 'Other', retail_price: 0, cost: 0, supplier: 'CAT', notes: '', active: true, retail_verified: false, no_discount: false });
  const sellAtStd = discountedPrice(form.retail_price || 0, partDiscountPct(form, standardDiscount));
  const margin = round2(sellAtStd - (form.cost || 0));
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
        <div className="fld"><label>Retail Price (list price)</label><input type="number" step="0.01" inputMode="decimal" value={form.retail_price || 0} onChange={e => setForm(p => ({ ...p, retail_price: Number(e.target.value) || 0 }))} /></div>
        <div className="fld"><label>Cost (what you pay)</label><input type="number" step="0.01" inputMode="decimal" value={form.cost || 0} onChange={e => setForm(p => ({ ...p, cost: Number(e.target.value) || 0 }))} /></div>
      </div>
      <div style={{ padding: '8px 12px', background: margin < 0 ? 'var(--rd2)' : 'var(--bg)', borderRadius: 'var(--r)', fontSize: 12, color: margin < 0 ? 'var(--rd)' : 'var(--tx2)', marginBottom: 12 }}>
        {form.no_discount ? 'No discount — always sells for' : `At the standard ${standardDiscount}% discount this sells for`} <strong className="m">{formatMoney(sellAtStd)}</strong> — margin <strong className="m">{formatMoney(margin)}</strong>{margin < 0 && ' (below cost)'}
      </div>
      <label className="cbx" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!form.retail_verified} onChange={e => setForm(p => ({ ...p, retail_verified: e.target.checked }))} />
        Retail verified (I&apos;ve confirmed this is the real list price)
      </label>
      <label className="cbx" style={{ marginBottom: 2 }}>
        <input type="checkbox" checked={!!form.no_discount} onChange={e => setForm(p => ({ ...p, no_discount: e.target.checked }))} />
        No discount (always sell at retail)
      </label>
      <p style={{ fontSize: 11, color: 'var(--tx3)', margin: '0 0 8px 24px' }}>Use for parts you can&apos;t discount, like John Deere.</p>
      <label className="cbx" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={form.active !== false} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
        Active (uncheck to hide from new filter orders)
      </label>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
    </ModalShell>
  );
}

// =============================================
// SERVICE TEMPLATE FORM
// =============================================
function ServiceTemplateForm({
  initial, unit_id, parts, onSaveAsync, onClose,
}: { initial: Partial<ServiceTemplate> | null; unit_id: string; parts: Part[]; onSaveAsync: (t: Partial<ServiceTemplate>) => Promise<void>; onClose: () => void; }) {
  const [form, setForm] = useState<Partial<ServiceTemplate>>(initial || { unit_id, name: '', labor: 325, parts_list: [], tasks: [], notes: '' });
  const [partSearch, setPartSearch] = useState('');

  const partsByNumber = useMemo(() => { const m: Record<string, Part> = {}; for (const p of parts) m[p.part_number] = p; return m; }, [parts]);
  const filteredParts = useMemo(() => {
    if (!partSearch.trim()) return [];
    const q = partSearch.toLowerCase();
    return parts.filter(p => p.part_number.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q)).slice(0, 20);
  }, [parts, partSearch]);

  const addPart = (part_number: string) => {
    setForm(prev => {
      const existing = prev.parts_list?.find(p => p.part_number === part_number);
      if (existing) return { ...prev, parts_list: prev.parts_list!.map(p => p.part_number === part_number ? { ...p, qty: p.qty + 1 } : p) };
      return { ...prev, parts_list: [...(prev.parts_list || []), { part_number, qty: 1 }] };
    });
    setPartSearch('');
  };
  const removePart = (part_number: string) => setForm(prev => ({ ...prev, parts_list: prev.parts_list?.filter(p => p.part_number !== part_number) || [] }));
  const setPartQty = (part_number: string, qty: number) => setForm(prev => ({ ...prev, parts_list: prev.parts_list?.map(p => p.part_number === part_number ? { ...p, qty: Math.max(1, qty) } : p) || [] }));
  const addTask = () => setForm(prev => ({ ...prev, tasks: [...(prev.tasks || []), ''] }));
  const setTask = (i: number, v: string) => setForm(prev => ({ ...prev, tasks: prev.tasks?.map((t, idx) => idx === i ? v : t) || [] }));
  const removeTask = (i: number) => setForm(prev => ({ ...prev, tasks: prev.tasks?.filter((_, idx) => idx !== i) || [] }));

  return (
    <ModalShell
      title={initial?.template_id ? 'Edit Service Template' : 'Add Service Template'}
      onClose={onClose}
      onSave={() => onSaveAsync({ ...form, tasks: form.tasks?.filter(t => t.trim()) || [] })}
      saveDisabled={!form.name?.trim()} size="lg"
    >
      <div className="fr">
        <div className="fld"><label>Service Name</label><input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 500hr Service, Wheel Gear Oil, Annual" autoFocus /></div>
        <div className="fld"><label>Labor ($)</label><input type="number" step="0.01" value={form.labor || 0} onChange={e => setForm(p => ({ ...p, labor: Number(e.target.value) || 0 }))} /></div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Parts ({form.parts_list?.length || 0})</label>
        {form.parts_list && form.parts_list.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {form.parts_list.map(ref => {
              const part = partsByNumber[ref.part_number];
              return (
                <div key={ref.part_number} className="tplist-item">
                  <span className="pn">{ref.part_number}</span>
                  <span className="desc">{part ? `${part.description} — ${part.manufacturer}` : '⚠️ Part not in catalog'}</span>
                  <div className="qty"><span style={{ fontSize: 10, color: 'var(--tx3)' }}>QTY</span>
                    <input type="number" min="1" value={ref.qty} onChange={e => setPartQty(ref.part_number, Number(e.target.value) || 1)} />
                  </div>
                  <button className="btn bs bg" onClick={() => removePart(ref.part_number)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
        <input type="text" value={partSearch} onChange={e => setPartSearch(e.target.value)} placeholder="Search parts catalog (by part #, description, or manufacturer)..." style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", outline: 'none', marginBottom: 6 }} />
        {partSearch.trim() && (
          <div className="psearchres">
            {filteredParts.length === 0 ? <div className="row" style={{ color: 'var(--tx3)', cursor: 'default' }}>No parts match. Add new parts from the Parts Catalog.</div> : (
              filteredParts.map(p => (
                <div key={p.part_id} className="row" onClick={() => addPart(p.part_number)}>
                  <span className="m" style={{ fontWeight: 700, minWidth: 90 }}>{p.part_number}</span>
                  <span style={{ flex: 1 }}>{p.description}</span>
                  <span className="tag tb">{p.manufacturer}</span>
                  {p.no_discount && <span className="tag nodisc">No discount</span>}
                  <span className="m" style={{ color: 'var(--tx2)' }}>{formatMoney(p.retail_price)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Tasks ({form.tasks?.length || 0})</label>
          <button className="btn bs" onClick={addTask}>+ Add Task</button>
        </div>
        {form.tasks && form.tasks.length > 0 ? (
          form.tasks.map((t, i) => (
            <div key={i} className="tklist-item">
              <input value={t} onChange={e => setTask(i, e.target.value)} placeholder="e.g. Drain engine oil" />
              <button className="btn bs bg" onClick={() => removeTask(i)}>✕</button>
            </div>
          ))
        ) : (<div style={{ fontSize: 12, color: 'var(--tx3)', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>No tasks yet. Click "+ Add Task" to add work items that will appear as a checklist on each work order.</div>)}
      </div>
      <div className="fld"><label>Notes</label><textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes about this service template" /></div>
    </ModalShell>
  );
}

// =============================================
// COPY TEMPLATE FORM
// =============================================
function CopyTemplateForm({ unit_id, units, customers, templates, onSaveAsync, onClose }: { unit_id: string; units: FleetUnit[]; customers: Customer[]; templates: ServiceTemplate[]; onSaveAsync: (template: Partial<ServiceTemplate>) => Promise<void>; onClose: () => void; }) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const otherTemplates = useMemo(() => templates.filter(t => t.unit_id !== unit_id), [templates, unit_id]);
  const selected = otherTemplates.find(t => t.template_id === selectedId);
  useEffect(() => { if (selected && !newName) setNewName(selected.name); }, [selected]);

  return (
    <ModalShell title="Copy Service Template" onClose={onClose}
      onSave={async () => {
        if (!selected) return;
        await onSaveAsync({ unit_id, name: newName || selected.name, labor: selected.labor, parts_list: selected.parts_list, tasks: selected.tasks, notes: selected.notes });
      }}
      saveDisabled={!selected || !newName.trim()} size="lg"
    >
      {otherTemplates.length === 0 ? (<div className="empty"><p>No templates exist on other units yet. Create one on another unit first, then copy from here.</p></div>) : (
        <>
          <div className="fld"><label>Choose a template to copy</label>
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
              <div className="fld"><label>Name on this unit</label><input value={newName} onChange={e => setNewName(e.target.value)} /></div>
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
// EDIT INVOICE NUMBER FORM (NEW)
// =============================================
function EditInvoiceNumberForm({
  currentNumber, allWorkOrders, currentWorkOrderId, onSaveAsync, onClose, otherUsedNumbers = [],
}: {
  currentNumber: number | null; allWorkOrders: WorkOrder[]; currentWorkOrderId: string; otherUsedNumbers?: number[];
  onSaveAsync: (newNumber: number) => Promise<void>; onClose: () => void;
}) {
  const [num, setNum] = useState(currentNumber || 0);
  const [confirmed, setConfirmed] = useState(false);

  const isDuplicate = allWorkOrders.some(w => w.invoice_number === num && w.work_order_id !== currentWorkOrderId) || otherUsedNumbers.includes(num);
  const requiresConfirmation = isDuplicate && !confirmed;

  return (
    <ModalShell
      title="Edit Invoice Number"
      onClose={onClose}
      onSave={async () => {
        if (requiresConfirmation) {
          setConfirmed(true);
          throw new Error('Click Save again to confirm using a duplicate number.');
        }
        await onSaveAsync(num);
      }}
      saveLabel={requiresConfirmation ? 'Confirm Duplicate' : 'Save'}
      saveDisabled={num < 1 || isNaN(num)}
    >
      <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 12 }}>
        Current invoice number: <strong className="m">{currentNumber ? `INV-${currentNumber}` : '— (unbilled, no number yet)'}</strong>
      </p>
      <div className="fld">
        <label>New Invoice Number</label>
        <input type="number" min="1" value={num} onChange={e => { setNum(Number(e.target.value) || 0); setConfirmed(false); }} autoFocus />
      </div>
      {isDuplicate && (
        <div className="mwarn" style={{ margin: 0 }}>
          <strong>⚠ Warning:</strong> Invoice INV-{num} is already used on another work order.
          {confirmed ? ' Click Save to proceed anyway.' : ' Click Save to confirm you want a duplicate.'}
        </div>
      )}
    </ModalShell>
  );
}

// Shrink an uploaded logo (max 1000px wide) and turn it into a data URL that can be
// saved with the company settings and drawn on PDFs.
async function logoFileToDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src;
  });
  const scale = Math.min(1, 1000 / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

// =============================================
// SETTINGS FORM
// =============================================
function SettingsForm({ settings, onSaveAsync }: { settings: CompanySettings | null | undefined; onSaveAsync: (s: Partial<CompanySettings>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<CompanySettings>>({ company_name: '', address: '', phone: '', email: '', tax_id: '', payment_terms: 'Net 15', tax_rate_percent: 2.25, invoice_footer_notes: '', next_invoice_number: 1150 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setToast(null);
    try { await onSaveAsync(form); setToast({ msg: 'Settings saved!', err: false }); setTimeout(() => setToast(null), 2500); }
    catch (err: any) { setToast({ msg: err?.message || 'Failed to save', err: true }); setTimeout(() => setToast(null), 4000); }
    finally { setSaving(false); }
  };
  return (
    <>
      <div className="card">
        <div className="ch"><h3>Company Settings</h3></div>
        <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>Your business info. This will appear on invoices and work orders.</p>
        <div className="fld">
          <label>Logo (shown on quotes)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {form.logo_url
              ? <img src={form.logo_url} alt="Company logo" style={{ maxHeight: 64, maxWidth: 220, objectFit: 'contain', background: '#fff', border: '1px solid var(--bd2)', borderRadius: 6, padding: 4 }} />
              : <span style={{ fontSize: 12, color: 'var(--tx3)' }}>No logo yet</span>}
            <label className="btn bs" style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0, color: 'var(--tx)', fontSize: 12, margin: 0 }}>
              {form.logo_url ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try { const url = await logoFileToDataUrl(file); setForm(p => ({ ...p, logo_url: url })); }
                catch { setToast({ msg: 'Could not read that image. Try a PNG or JPG.', err: true }); setTimeout(() => setToast(null), 4000); }
              }} />
            </label>
            {form.logo_url && <button type="button" className="btn bs bg" onClick={() => setForm(p => ({ ...p, logo_url: '' }))}>Remove</button>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Click Save Settings after uploading.</p>
        </div>
        <div className="fld"><label>Company Name</label><input value={form.company_name || ''} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} /></div>
        <div className="fld"><label>Address</label><textarea value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Street or PO Box&#10;City, State ZIP" style={{ minHeight: 60, fontFamily: "'Outfit',sans-serif" }} /></div>
        <div className="fr">
          <div className="fld"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
          <div className="fld"><label>Email</label><input value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
        </div>
        <div className="fr">
          <div className="fld"><label>Tax ID / EIN</label><input value={form.tax_id || ''} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} /></div>
          <div className="fld"><label>Payment Terms</label><input value={form.payment_terms || ''} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} /></div>
        </div>
        <div className="fld"><label>Tax Rate (%) — applies to parts + oil only</label><input type="number" step="0.01" value={form.tax_rate_percent || 0} onChange={e => setForm(p => ({ ...p, tax_rate_percent: Number(e.target.value) || 0 }))} /></div>
        <div className="fld">
          <label>Next Invoice Number</label>
          <input type="number" min="1" step="1" value={form.next_invoice_number || 1150} onChange={e => setForm(p => ({ ...p, next_invoice_number: Number(e.target.value) || 1 }))} />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>The next invoice assigned when you mark a work order billed. Match this to QuickBooks whenever they drift apart.</p>
        </div>
        <div className="fld"><label>Invoice Footer Notes</label><textarea value={form.invoice_footer_notes || ''} onChange={e => setForm(p => ({ ...p, invoice_footer_notes: e.target.value }))} /></div>
        <button className="btn bp" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
      <div className="card">
        <div className="ch"><h3>Parts Pricing &amp; Filter Sales</h3></div>
        <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 14 }}>Parts discount for new customers, the filter order tax rate, and your filter supplier&apos;s info.</p>
        <div className="fr">
          <div className="fld"><label>Default Customer Discount (%)</label><input type="number" step="0.1" inputMode="decimal" value={form.default_customer_discount_pct ?? 6} onChange={e => setForm(p => ({ ...p, default_customer_discount_pct: Number(e.target.value) || 0 }))} />
            <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>New customers start with this discount off retail on every part. Change it per customer on their page.</p>
          </div>
          <div className="fld"><label>Filter Order Tax Rate (%)</label><input type="number" step="0.01" inputMode="decimal" value={form.filter_tax_rate_percent ?? 2.5} onChange={e => setForm(p => ({ ...p, filter_tax_rate_percent: Number(e.target.value) || 0 }))} />
            <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>Starting rate for new filter orders. You can change it on each order.</p>
          </div>
        </div>
        <div className="section-hdr">Supplier</div>
        <div className="fr">
          <div className="fld"><label>Supplier Name</label><input value={form.supplier_name || ''} onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))} /></div>
          <div className="fld"><label>Contact Name</label><input value={form.supplier_contact_name || ''} onChange={e => setForm(p => ({ ...p, supplier_contact_name: e.target.value }))} /></div>
        </div>
        <div className="fr">
          <div className="fld"><label>Phone</label><input type="tel" value={form.supplier_phone || ''} onChange={e => setForm(p => ({ ...p, supplier_phone: e.target.value }))} /></div>
          <div className="fld"><label>Email</label><input type="email" value={form.supplier_email || ''} onChange={e => setForm(p => ({ ...p, supplier_email: e.target.value }))} /></div>
        </div>
        <div className="fld"><label>Account Number</label><input value={form.supplier_account_number || ''} onChange={e => setForm(p => ({ ...p, supplier_account_number: e.target.value }))} /></div>
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
  | { t: 'editInvoiceNumber'; wo: WorkOrder }
  | { t: 'addInventory' }
  | { t: 'confirmDelete'; what: string; danger?: boolean; onConfirm: () => Promise<void> }
  | { t: 'confirmAction'; title: string; message: string; label: string; onConfirm: () => Promise<void> };

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
  const deleteUnit = useDeleteFleetUnit();
  const { data: workOrders = [] } = useWorkOrders();
  const createWorkOrder = useCreateWorkOrder();
  const updateWorkOrder = useUpdateWorkOrder();
  const deleteWorkOrder = useDeleteWorkOrder();
  const { data: inventory = [] } = useInventory();
  const createInventoryItem = useCreateInventoryItem();
  const updateInventoryItem = useUpdateInventoryItem();
  const deleteInventoryItem = useDeleteInventoryItem();
  const adjustInventory = useAdjustInventoryByPartIds();

  const [pg, setPg] = useState('dashboard');
  const [trail, setTrail] = useState<{ p: string; id: string; lbl: string }[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [aiMsgs, setAiMsgs] = useState([{ r: 'a', t: "Hey! I'm your OilTrack assistant. Ask me about specs, parts, service history — or paste invoice data and I'll help you build work orders." }]);
  const [aiIn, setAiIn] = useState('');
  const [aiLoad, setAiLoad] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [selectedOilSlips, setSelectedOilSlips] = useState<string[]>([]);
  const [showOilSlips, setShowOilSlips] = useState(false);
  // Dashboard revenue year selector
  const [dashYear, setDashYear] = useState<number>(new Date().getFullYear());
  // Billing time-window filter + sort + batch export selection
  const [billRange, setBillRange] = useState<BillingRange>('30');
  const [billSort, setBillSort] = useState<BillingSort>('date-new');
  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // Parts catalog search
  const [partsSearch, setPartsSearch] = useState('');
  const [partsCat, setPartsCat] = useState('all');
  // Customer list filters
  const [custType, setCustType] = useState<'all' | 'service' | 'filter_only' | 'both'>('all');
  const [custStatus, setCustStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [custSearch, setCustSearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const followUpBadge = useFollowUpBadgeCount();
  const { data: filterOrders = [] } = filterOrdersApi.useList();
  const { data: allContacts = [] } = contactsApi.useList();
  const { byOrder: foItemsByOrder, totals: foTotals } = useOrderTotals();
  const applyFilterBilling = useFilterBilling((m, e) => showToast(m, e));
  const overdueCustIds = useOverdueCustomerIds();
  const [partsActive, setPartsActive] = useState<'active' | 'inactive' | 'all'>('active');
  const [partsNeedCheck, setPartsNeedCheck] = useState(false);
  const [partsNoDisc, setPartsNoDisc] = useState(false);
  // Inventory page search
  const [invSearch, setInvSearch] = useState('');
  // Inventory add-item picker search
  const [invPickerSearch, setInvPickerSearch] = useState('');
  const aiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle('printing-oil-slips', showOilSlips);
    return () => document.body.classList.remove('printing-oil-slips');
  }, [showOilSlips]);

  const showToast = (msg: string, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), err ? 4000 : 2500); };
  // Generic "Are you sure?" used by the new Filter/CRM screens
  const confirmAction = (what: string, onConfirm: () => Promise<void>, opts?: { title: string; message: string; label: string }) =>
    setModal(opts ? { t: 'confirmAction', ...opts, onConfirm } : { t: 'confirmDelete', what, onConfirm });

  // Pages without an id (e.g. 'followups') are top-level: jump there instead of stacking breadcrumbs
  const nav = useCallback((p: string, id: string, lbl: string) => {
    if (!id) { setTrail([]); setPg(p); return; }
    setTrail(pr => [...pr, { p, id, lbl }]); setPg(p);
  }, []);
  const back = useCallback(() => {
    setTrail(pr => { const n = pr.slice(0, -1); setPg(n.length ? n[n.length - 1].p : 'dashboard'); return n; });
  }, []);
  const goTo = useCallback((i: number) => {
    setTrail(pr => { const n = pr.slice(0, i + 1); setPg(n[n.length - 1].p); return n; });
  }, []);

  const getEngine = (id: string | null | undefined) => engines.find(e => e.engine_id === id);
  const getCustomer = (id: string) => customers.find(c => c.customer_id === id);
  const getUnit = (id: string) => units.find(u => u.unit_id === id);
  const getPart = (part_number: string) => parts.find(p => p.part_number === part_number);
  const templatesForUnit = (unit_id: string) => templates.filter(t => t.unit_id === unit_id);

  /**
   * Shared bill-time logic — assigns an invoice number from company settings,
   * deducts inventory for parts used, and marks the WO billed.
   * On un-bill, adds inventory back and clears billed state.
   * The invoice number is NOT released on unbill (it stays with the WO for history).
   */
  async function applyBilling(wo: WorkOrder, nowBilled: boolean): Promise<void> {
    try {
      let updates: Partial<WorkOrder> = {
        billed: nowBilled,
        billed_at: nowBilled ? new Date().toISOString() : null,
      };

      if (nowBilled) {
        // ─── BILLING ─────────────────────────────────────────────
        // Assign an invoice number only if WO doesn't already have one
        if (!wo.invoice_number && company) {
          const next = Number(company.next_invoice_number || 1150);
          updates.invoice_number = next;
          // Bump settings counter
          await upsertCompany.mutateAsync({ ...company, next_invoice_number: next + 1 });
        }
        // Deduct inventory for tracked parts (only once per bill)
        if (!wo.inventory_deducted && wo.parts_used && wo.parts_used.length > 0) {
          // Resolve part_number → part_id for each line
          const adjustments: { part_id: string; delta: number }[] = [];
          for (const line of wo.parts_used) {
            const p = parts.find(x => x.part_number === line.part_number);
            if (p) adjustments.push({ part_id: p.part_id, delta: -Math.abs(Number(line.qty) || 0) });
          }
          if (adjustments.length > 0) {
            await adjustInventory.mutateAsync(adjustments);
          }
          updates.inventory_deducted = true;
        }
      } else {
        // ─── UN-BILLING ──────────────────────────────────────────
        // Add inventory back IF we had previously deducted
        if (wo.inventory_deducted && wo.parts_used && wo.parts_used.length > 0) {
          const adjustments: { part_id: string; delta: number }[] = [];
          for (const line of wo.parts_used) {
            const p = parts.find(x => x.part_number === line.part_number);
            if (p) adjustments.push({ part_id: p.part_id, delta: Math.abs(Number(line.qty) || 0) });
          }
          if (adjustments.length > 0) {
            await adjustInventory.mutateAsync(adjustments);
          }
          updates.inventory_deducted = false;
        }
      }

      await updateWorkOrder.mutateAsync({ work_order_id: wo.work_order_id, updates });

      if (nowBilled) {
        const invMsg = !wo.invoice_number && updates.invoice_number ? ` as INV-${updates.invoice_number}` : '';
        showToast(`Marked billed${invMsg}`);
      } else {
        showToast('Marked unbilled — inventory restored');
      }
    } catch (err: any) {
      showToast(`Failed: ${err?.message || 'Unknown error'}`, true);
    }
  }

  /**
   * Build a single invoice PDF (returns Blob).
   * Mirrors the on-screen invoice layout: company header, Bill To, equipment, parts table, cost breakdown.
   */
  async function buildInvoicePdfBlob(wo: WorkOrder): Promise<Blob> {
    const { default: jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const u = getUnit(wo.unit_id);
    const c = getCustomer(wo.customer_id);
    const e = u ? getEngine(u.engine_id) : null;

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ml = 40, mr = 40, mt = 40;

    // ─── Header ─────────────────────────────────────────
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0);
    doc.text(company?.company_name || 'Your Company', ml, mt);
    if (company?.address) {
      const lines = company.address.split('\n');
      doc.setFontSize(8).setTextColor(68);
      lines.forEach((line, i) => doc.text(line, ml, mt + 12 + i * 10));
    }

    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(0);
    doc.text('INVOICE', pw - mr, mt + 5, { align: 'right' });
    doc.setFontSize(11).setFont('helvetica', 'normal');
    doc.text(wo.invoice_number ? `#${wo.invoice_number}` : 'Unbilled', pw - mr, mt + 22, { align: 'right' });
    doc.setFontSize(8).setTextColor(68);
    // Inline date formatter (MM/DD/YYYY)
    const dateDisplay = (() => {
      const [yy, mm, dd] = (wo.service_date || '').split('-');
      return (mm && dd) ? `${mm}/${dd}/${yy}` : (wo.service_date || '');
    })();
    doc.text(`Unit: ${u?.unit_number || '—'}`, pw - mr, mt + 36, { align: 'right' });
    doc.text(`Date: ${dateDisplay}`, pw - mr, mt + 48, { align: 'right' });
    doc.text(`Terms: ${company?.payment_terms || 'Net 15'}`, pw - mr, mt + 60, { align: 'right' });

    // ─── Bill To (window envelope position) ────────────
    const btY = 170;
    doc.setFontSize(8).setTextColor(140);
    doc.text('BILL TO', ml, btY);
    doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(0);
    doc.text(c?.name || '', ml, btY + 14);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    let y = btY + 28;
    if (c?.contact_name) { doc.text(c.contact_name, ml, y); y += 12; }
    if (c?.billing_address) {
      c.billing_address.split('\n').forEach(line => { doc.text(line, ml, y); y += 12; });
    }
    if (c?.phone) { doc.text(`Phone: ${c.phone}`, ml, y); y += 12; }

    // ─── Equipment summary ─────────────────────────────
    const eqY = 300;
    doc.setFontSize(8).setTextColor(140);
    doc.text('EQUIPMENT', ml, eqY);
    doc.setFontSize(10).setTextColor(0);
    const eqLine = `${u?.unit_number || ''} — ${u?.nickname || u?.type || ''}` +
      (u?.make ? ` · ${u.make} ${u.model || ''}` : '') +
      (e?.name ? ` · Engine: ${e.name}` : '') +
      (wo.engine_hours ? ` · Hours: ${wo.engine_hours.toLocaleString()}` : '') +
      ` · Service: ${wo.tier}`;
    const eqWrapped = doc.splitTextToSize(eqLine, pw - ml - mr);
    doc.text(eqWrapped, ml, eqY + 14);
    let afterEqY = eqY + 14 + eqWrapped.length * 11;

    // ─── Parts table ───────────────────────────────────
    // Discount-priced work orders: Retail / Discount / Price columns + savings line.
    // Older work orders (no discount saved) print exactly as before.
    const discLayout = !wo.customer_provided_filters && workOrderHasDiscountLines(wo.parts_used);
    const rows: (string | number)[][] = [];
    if (discLayout) {
      wo.parts_used.forEach(p => {
        const price = partChargePrice(p);
        rows.push([p.part_number, p.description, String(p.qty), formatMoney(p.retail_price), invoiceDiscountText(p), formatMoney(price), formatMoney(p.line_total_retail)]);
      });
      if (wo.oil_used) {
        const oilDesc = `${wo.oil_used.type} engine oil${wo.customer_provided_oil ? ' (customer supplied)' : ''}`;
        rows.push(['—', oilDesc, `${wo.oil_used.gallons} gal`, '', '', formatMoney(wo.oil_used.retail_per_gallon), formatMoney(wo.oil_used.total_retail)]);
      }
    } else if (!wo.customer_provided_filters) {
      wo.parts_used.forEach(p => rows.push([
        p.part_number, p.description, p.supplier, String(p.qty),
        formatMoney(p.retail_price), formatMoney(p.line_total_retail),
      ]));
    }
    if (wo.oil_used && !discLayout) {
      const oilDesc = `${wo.oil_used.type} engine oil${wo.customer_provided_oil ? ' (customer supplied)' : ''}`;
      rows.push([
        '—', oilDesc, wo.customer_provided_oil ? 'Customer' : 'CAT',
        `${wo.oil_used.gallons} gal`,
        formatMoney(wo.oil_used.retail_per_gallon), formatMoney(wo.oil_used.total_retail),
      ]);
    }

    let endY = afterEqY + 10;
    if (rows.length > 0 && discLayout) {
      autoTable(doc, {
        startY: afterEqY + 10,
        head: [['Part #', 'Description', 'Qty', 'Retail', 'Discount', 'Price', 'Total']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineWidth: 0.5, lineColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 68, fontStyle: 'bold' },
          2: { halign: 'right', cellWidth: 44 },
          3: { halign: 'right', cellWidth: 58 },
          4: { halign: 'right', cellWidth: 52 },
          5: { halign: 'right', cellWidth: 58 },
          6: { halign: 'right', cellWidth: 64 },
        },
        margin: { left: ml, right: mr },
      });
      endY = (doc as any).lastAutoTable.finalY || endY;
      const savings = workOrderPartsSavings(wo.parts_used);
      if (savings > 0) {
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(0);
        doc.text(`Parts discount savings: ${formatMoney(savings)}`, pw - mr, endY + 14, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        endY += 14;
      }
    } else if (rows.length > 0) {
      autoTable(doc, {
        startY: afterEqY + 10,
        head: [['Part #', 'Description', 'Supplier', 'Qty', 'Retail', 'Total']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 4, textColor: 0 },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', lineWidth: 0.5, lineColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 65, fontStyle: 'bold' },
          2: { cellWidth: 60 },
          3: { halign: 'right', cellWidth: 50 },
          4: { halign: 'right', cellWidth: 65 },
          5: { halign: 'right', cellWidth: 70 },
        },
        margin: { left: ml, right: mr },
      });
      endY = (doc as any).lastAutoTable.finalY || endY;
    }

    // ─── Cost breakdown (right-aligned) ─────────────────
    let cy = Math.max(endY + 24, ph - 240);
    const feeEntries = Object.entries(wo.fees || {}).filter(([_, v]) => Number(v) > 0);
    const labelX = pw - mr - 180;
    const valX = pw - mr;
    doc.setFontSize(10).setTextColor(0).setFont('helvetica', 'normal');
    feeEntries.forEach(([k, v]) => {
      const lbl = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      doc.text(lbl, labelX, cy);
      doc.text(formatMoney(Number(v)), valX, cy, { align: 'right' });
      cy += 13;
    });
    doc.setLineWidth(0.5).setDrawColor(160);
    doc.line(labelX, cy, valX, cy); cy += 4;
    doc.text('Parts + Oil (taxable)', labelX, cy);
    doc.text(formatMoney(wo.subtotal_parts_oil || 0), valX, cy, { align: 'right' });
    cy += 13;
    doc.text(`Tax (${wo.tax_rate_percent}%)`, labelX, cy);
    doc.text(formatMoney(wo.tax_amount || 0), valX, cy, { align: 'right' });
    cy += 18;
    // Total line
    doc.setLineWidth(1).setDrawColor(0);
    doc.line(labelX, cy - 4, valX, cy - 4);
    doc.setFont('helvetica', 'bold').setFontSize(12);
    doc.text('TOTAL', labelX, cy + 8);
    doc.text(formatMoney(wo.total_retail || 0), valX, cy + 8, { align: 'right' });
    doc.setLineWidth(0.75);
    doc.line(labelX, cy + 14, valX, cy + 14);
    doc.line(labelX, cy + 17, valX, cy + 17);

    // ─── Notes ─────────────────────────────────────────
    if (wo.notes) {
      doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(90);
      doc.text('Notes:', ml, ph - 90);
      doc.setFont('helvetica', 'normal').setFontSize(8);
      const wrap = doc.splitTextToSize(wo.notes, pw - ml - mr);
      doc.text(wrap, ml, ph - 80);
    }

    // ─── Footer ────────────────────────────────────────
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100);
    doc.setLineWidth(0.5).setDrawColor(150);
    doc.line(ml, ph - 50, pw - mr, ph - 50);
    const footerBits = [company?.company_name, company?.address?.replace(/\n/g, ', '), company?.phone, company?.email].filter(Boolean);
    if (footerBits.length > 0) {
      const footer = footerBits.join(' · ');
      const fw = doc.splitTextToSize(footer, pw - ml - mr);
      doc.text(fw, pw / 2, ph - 38, { align: 'center' });
    }
    if (company?.invoice_footer_notes) {
      doc.setFontSize(7).setTextColor(120);
      const w2 = doc.splitTextToSize(company.invoice_footer_notes, pw - ml - mr);
      doc.text(w2, pw / 2, ph - 22, { align: 'center' });
    }

    return doc.output('blob');
  }

  /**
   * Build invoice PDFs for a batch of WOs, package into a single zip, trigger download.
   * Filenames: {unit}_{MMDDYYYY}.pdf, e.g. ITH-37_10152026.pdf
   * Collisions (same unit + same date) get a numeric suffix.
   */
  async function batchExportInvoices(selectedWOs: WorkOrder[], selectedFOs: FilterOrder[] = []): Promise<void> {
    const { default: JSZip } = await import('jszip');
    const saveAs = await loadSaveAs();
    const zip = new JSZip();

    const used: Record<string, number> = {};
    for (const wo of selectedWOs) {
      const u = getUnit(wo.unit_id);
      const unit = (u?.unit_number || 'UNIT').replace(/[^A-Za-z0-9_-]/g, '-');
      const dateStr = fmtMMDDYYYY(wo.service_date);
      let name = `${unit}_${dateStr}.pdf`;
      if (used[name] != null) {
        used[name] = (used[name] || 0) + 1;
        name = `${unit}_${dateStr}_${used[name] + 1}.pdf`;
      } else {
        used[name] = 0;
      }
      const blob = await buildInvoicePdfBlob(wo);
      zip.file(name, blob);
    }
    for (const fo of selectedFOs) {
      const c = getCustomer(fo.customer_id);
      const contact = allContacts.find(x => x.contact_id === fo.contact_id) || allContacts.find(x => x.customer_id === fo.customer_id && x.is_primary);
      const blob = await buildFilterInvoicePdfBlob({ order: fo, items: foItemsByOrder[fo.filter_order_id] || [], customer: c, contact, units, company });
      let name = filterInvoiceFileName(fo, c);
      if (used[name] != null) { used[name] += 1; name = name.replace(/\.pdf$/, `_${used[name] + 1}.pdf`); } else used[name] = 0;
      zip.file(name, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const today = fmtMMDDYYYY(new Date());
    saveAs(zipBlob, `invoices_${today}.zip`);
  }

  async function buildWorkOrderFromTemplate(template: ServiceTemplate): Promise<string | null> {
    const u = getUnit(template.unit_id);
    if (!u) return null;
    const customer = getCustomer(u.customer_id);
    if (!customer) return null;
    const engine = getEngine(u.engine_id);
    const cf = customer.default_fees || {} as any;

    const checklist: ChecklistItem[] = (template.tasks.length > 0 ? template.tasks : ['Drain engine oil', 'Replace filters', 'Greased all lube points', 'Checked for leaks', 'Recorded engine hours']).map(t => ({ text: t, done: false }));

    const partsUsed: ServicePartSnapshot[] = [];
    for (const ref of template.parts_list) {
      const p = getPart(ref.part_number);
      if (!p) continue;
      // Catalog retail minus this customer's discount (custom per-customer part prices are no longer used)
      const retail = Number(p.retail_price) || 0;
      const cost = Number(p.cost) || 0;
      const discount_pct = partDiscountPct(p, Number(customer.discount_pct ?? company?.default_customer_discount_pct ?? 6));
      partsUsed.push(recalculatePartLine({
        part_number: p.part_number, description: p.description, manufacturer: p.manufacturer, supplier: p.supplier,
        qty: ref.qty, retail_price: retail, cost, discount_pct, sell_price: discountedPrice(retail, discount_pct), price_overridden: false, no_discount: !!p.no_discount,
        line_total_retail: 0, line_total_cost: 0,
      }));
    }

    const custOil = !!(customer as any).provides_own_oil;
    const oil = engine && engine.oil_capacity_gallons > 0 ? {
      type: engine.oil_type, gallons: engine.oil_capacity_gallons,
      retail_per_gallon: custOil ? 0 : (cf.oil_retail_per_gallon || 0), cost_per_gallon: custOil ? 0 : (cf.oil_cost_per_gallon || 0),
      total_retail: custOil ? 0 : round2(engine.oil_capacity_gallons * (cf.oil_retail_per_gallon || 0)),
      total_cost: custOil ? 0 : round2(engine.oil_capacity_gallons * (cf.oil_cost_per_gallon || 0)),
    } : null;

    const fees = {
      labor: template.labor || 0, environmental_fee: cf.environmental_fee || 0,
      travel_charge: cf.travel_charge || 0, service_supplies: cf.service_supplies || 0,
      oil_sample_fee: 0, other: 0,
    };

    const tax_rate_percent = company?.tax_rate_percent ?? 2.25;
    const totals = calculateWorkOrderTotals({ parts: partsUsed, oil, fees, tax_rate_percent });

    try {
      const wo = await createWorkOrder.mutateAsync({
        customer_id: u.customer_id, unit_id: u.unit_id, service_template_id: template.template_id,
        // Explicitly null so Postgres doesn't auto-assign from the old sequence default
        invoice_number: null,
        status: 'open', tier: template.name, service_date: new Date().toISOString().split('T')[0],
        engine_hours: 0, technician: '', customer_provided_filters: false, customer_provided_oil: custOil, notes: '',
        parts_used: partsUsed, oil_used: oil, fees, tax_rate_percent, ...totals, checklist,
        billed: false, billed_at: null, inventory_deducted: false,
      } as any);
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
      labor: 0, environmental_fee: cf.environmental_fee || 0,
      travel_charge: cf.travel_charge || 0, service_supplies: cf.service_supplies || 0,
      oil_sample_fee: 0, other: 0,
    };
    const tax_rate_percent = company?.tax_rate_percent ?? 2.25;
    const totals = calculateWorkOrderTotals({ parts: [], oil: null, fees, tax_rate_percent });
    try {
      const wo = await createWorkOrder.mutateAsync({
        customer_id: u.customer_id, unit_id: u.unit_id, status: 'open', tier: 'Custom Service',
        // Explicitly null so Postgres doesn't auto-assign from the old sequence default
        invoice_number: null,
        service_date: new Date().toISOString().split('T')[0],
        engine_hours: 0, technician: '', customer_provided_filters: false, customer_provided_oil: !!(customer as any).provides_own_oil, notes: '',
        parts_used: [], oil_used: null, fees, tax_rate_percent, ...totals, checklist: [],
        billed: false, billed_at: null, inventory_deducted: false,
      } as any);
      return wo.work_order_id;
    } catch (err: any) { showToast(`Failed: ${err?.message || 'Unknown error'}`, true); return null; }
  }

  const sendAi = useCallback(async () => {
    if (!aiIn.trim()) return;
    const msg = aiIn.trim();
    setAiIn(''); setAiMsgs(p => [...p, { r: 'u', t: msg }]); setAiLoad(true);
    const ctx = JSON.stringify({
      customers: customers.map(c => ({ name: c.name })),
      units: units.map(u => ({ num: u.unit_number, nick: u.nickname, engine: getEngine(u.engine_id)?.name })),
      engines: engines.map(e => ({ name: e.name, oil: e.oil_type, cap: e.oil_capacity_gallons })),
      templates: templates.map(t => ({ unit: getUnit(t.unit_id)?.unit_number, name: t.name, labor: t.labor, parts: t.parts_list.length, tasks: t.tasks.length })),
      wos: workOrders.slice(0, 8).map(w => ({ unit: getUnit(w.unit_id)?.unit_number, date: w.service_date, tier: w.tier, total: w.total_retail, status: w.status })),
    });
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: ctx, messages: [{ role: 'user', content: msg }] }) });
      const d = await r.json();
      setAiMsgs(p => [...p, { r: 'a', t: d.content?.map((c: any) => c.text || '').join('\n') || 'Error' }]);
    } catch { setAiMsgs(p => [...p, { r: 'a', t: 'Connection error.' }]); }
    setAiLoad(false);
  }, [aiIn, customers, units, engines, templates, workOrders]);

  useEffect(() => { aiRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMsgs]);

  const curId = trail.length ? trail[trail.length - 1].id : null;

  const IC = (d: string, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
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
  const iUnlock = 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 019.9-1';
  const iBill = 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8';
  const iDrop = 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z';
  const iInv = 'M20 7H4v13h16V7z M8 7V4a2 2 0 012-2h4a2 2 0 012 2v3 M4 11h16';

  async function handleSignOut() { const supabase = createClient(); await supabase.auth.signOut(); }

  const renderDashboard = () => {
    const open = workOrders.filter(w => w.status === 'open');
    const completed = workOrders.filter(w => w.status === 'complete');

    // Years that appear in completed WOs, plus the current year, newest first
    const availableYears = (() => {
      const years = new Set<number>();
      completed.forEach(w => {
        const y = yearOfServiceDate(w.service_date);
        if (y != null) years.add(y);
      });
      filterOrders.forEach(o => {
        const y = yearOfServiceDate(isoDateOf(o.delivered_at));
        if (y != null && ['delivered', 'paid'].includes(o.status)) years.add(y);
      });
      years.add(new Date().getFullYear());
      return Array.from(years).sort((a, b) => b - a);
    })();

    const serviceRev = completed
      .filter(w => yearOfServiceDate(w.service_date) === dashYear)
      .reduce((s, w) => s + (w.total_retail || 0), 0);
    // Filter revenue: delivered or paid filter orders, by delivery date
    const filterRev = filterOrders
      .filter(o => ['delivered', 'paid'].includes(o.status) && yearOfServiceDate(isoDateOf(o.delivered_at)) === dashYear)
      .reduce((s, o) => s + foTotals(o).total, 0);
    const rev = serviceRev + filterRev;

    return (
      <>
        <FollowUpsWidget nav={nav} toast={showToast} />
        <div className="stats">
          <div className="st"><div className="st-l">Customers</div><div className="st-v" style={{ color: 'var(--ac)' }}>{customers.length}</div></div>
          <div className="st"><div className="st-l">Fleet Units</div><div className="st-v" style={{ color: 'var(--bl)' }}>{units.length}</div></div>
          <div className="st"><div className="st-l">Open WOs</div><div className="st-v" style={{ color: open.length ? 'var(--am)' : 'var(--gn)' }}>{open.length}</div></div>
          <div className="st">
            <div className="st-l" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span>Revenue</span>
              <select className="st-yr-sel" value={dashYear} onChange={e => setDashYear(Number(e.target.value))} aria-label="Filter revenue by year">
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="st-v">${Math.round(rev).toLocaleString()}</div>
            <div className="rev-split">Service ${Math.round(serviceRev).toLocaleString()} · Filters ${Math.round(filterRev).toLocaleString()}</div>
          </div>
        </div>
        {open.length > 0 && (
          <div className="card">
            <div className="ch"><h3>Open Work Orders</h3></div>
            <table>
              <thead><tr><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th><th>Invoice #</th></tr></thead>
              <tbody>
                {open.map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td>{getCustomer(w.customer_id)?.name}</td>
                      <td><span className="tag tc">{w.tier}</span></td>
                      <td className="m">{w.service_date}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card">
          <div className="ch"><h3>Recent Completed</h3></div>
          {completed.length === 0 ? (<div className="empty"><p>No completed work orders yet</p></div>) : (
            <table>
              <thead><tr><th>Unit</th><th>Date</th><th>Customer</th><th>Total</th><th>Invoice #</th></tr></thead>
              <tbody>
                {completed.slice(0, 8).map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td className="m">{w.service_date}</td>
                      <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                      <td className="m">{formatMoney(w.total_retail)}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderCustomers = () => {
    const q = custSearch.trim().toLowerCase();
    const list = customers.filter(c =>
      (custType === 'all' || (c.customer_type || 'service') === custType ||
        (custType !== 'both' && c.customer_type === 'both')) &&
      (custStatus === 'all' || (c.status || 'active') === custStatus) &&
      (!q || c.name.toLowerCase().includes(q) || (c.contact_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    );
    return (
      <div className="card">
        <div className="ch"><h3>Customers ({list.length === customers.length ? customers.length : `${list.length} of ${customers.length}`})</h3><button className="btn bs bp" onClick={() => setModal({ t: 'addCust' })}>{IC(iPlus, 15)} Add</button></div>
        {customers.length > 0 && (
          <>
            <input type="search" className="srch" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customers by name, contact, or phone…" style={{ marginBottom: 8 }} />
            <div className="chips">
              {(['all', 'service', 'filter_only', 'both'] as const).map(t => (
                <button key={t} className={`chip${custType === t ? ' on' : ''}`} onClick={() => setCustType(t)}>{t === 'all' ? 'All types' : t === 'service' ? 'Service' : t === 'filter_only' ? 'Filter' : 'Both'}</button>
              ))}
              <span style={{ width: 8 }} />
              {(['active', 'inactive', 'all'] as const).map(st => (
                <button key={st} className={`chip${custStatus === st ? ' on' : ''}`} onClick={() => setCustStatus(st)}>{st === 'active' ? 'Active' : st === 'inactive' ? 'Inactive' : 'Any status'}</button>
              ))}
            </div>
          </>
        )}
        {loadingCustomers ? <div className="loading">Loading customers…</div> : customers.length === 0 ? (<div className="empty"><p>No customers yet. Click "Add" to create your first one.</p></div>) : list.length === 0 ? (<div className="empty"><p>No customers match these filters.</p></div>) : (
          <div className="tw">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Discount</th><th>Contact</th><th>Units</th><th>WOs</th><th title="Overdue follow-up"></th></tr></thead>
            <tbody>
              {list.map(c => (
                <tr key={c.customer_id} onClick={() => nav('cust', c.customer_id, c.name)} style={{ opacity: c.status === 'inactive' ? 0.6 : 1 }}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><CustomerTypeBadge c={c} /></td>
                  <td className="m">{formatPct(Number(c.discount_pct ?? 0))}</td>
                  <td style={{ color: 'var(--tx2)' }}>{c.contact_name || '—'}</td>
                  <td className="m">{units.filter(u => u.customer_id === c.customer_id).length}</td>
                  <td className="m">{workOrders.filter(w => w.customer_id === c.customer_id).length}</td>
                  <td>{overdueCustIds.has(c.customer_id) && <span className="tag tred" title="Has an overdue follow-up">{uiIC(ICONS.bell, 11)} overdue</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    );
  };

  const renderCustDetail = () => {
    const c = customers.find(x => x.customer_id === curId);
    if (!c) return <div className="empty"><p>Not found</p></div>;
    const cu = units.filter(u => u.customer_id === curId);
    const cf = c.default_fees || {} as any;
    const isFilterOnly = c.customer_type === 'filter_only';
    const renderEquipment = () => (
        <div className="card">
          <div className="ch">
            <h3>Equipment ({cu.length})</h3>
            <button className="btn bs bp" onClick={() => setModal({ t: 'addUnit', customer_id: curId! })}>{IC(iPlus, 15)} Add</button>
          </div>
          {cu.length === 0 ? <div className="empty"><p>No equipment yet</p></div> : (
            <table>
              <thead><tr><th>Unit #</th><th>Description</th><th>Engine</th><th>Hours</th><th>Templates</th><th>WOs</th><th></th></tr></thead>
              <tbody>
                {cu.map(u => {
                  const lastWO = workOrders.filter(w => w.unit_id === u.unit_id && w.status === 'complete' && w.completed_at)
                    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))[0];
                  return (
                  <tr key={u.unit_id} onClick={() => nav('unit', u.unit_id, u.unit_number)}>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u.unit_number}</td>
                    <td>{u.equipment_use === 'filters'
                      ? <span style={{ color: 'var(--tx2)' }}>{u.serial_number ? `S/N ${u.serial_number}` : ''}</span>
                      : <>{u.nickname || u.type}{u.make ? ` — ${u.make} ${u.model || ''}` : ''}</>}</td>
                    <td>{u.equipment_use === 'filters' ? <span className="tag tg">Filters only</span> : <span className="tag tb">{getEngine(u.engine_id)?.name || '—'}</span>}</td>
                    <td className="m">
                      {u.current_hours > 0 ? u.current_hours.toLocaleString() : '—'}
                      {lastWO?.completed_at && <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 400, marginTop: 2 }}>{new Date(lastWO.completed_at).toLocaleDateString()}</div>}
                    </td>
                    <td className="m">{templatesForUnit(u.unit_id).length}</td>
                    <td className="m">{workOrders.filter(w => w.unit_id === u.unit_id).length}</td>
                    <td onClick={e => e.stopPropagation()} style={{ width: 34 }}>
                      <button className="btn bs bd2btn" onClick={() => {
                        const woCount = workOrders.filter(w => w.unit_id === u.unit_id).length;
                        setModal({
                          t: 'confirmDelete',
                          what: `unit "${u.unit_number}"${woCount > 0 ? ` — it has ${woCount} work order${woCount === 1 ? '' : 's'} which will remain in history` : ''}`,
                          onConfirm: async () => { await deleteUnit.mutateAsync(u.unit_id); showToast('Equipment deleted'); },
                        });
                      }}>{IC(iTrash, 13)}</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
    );
    const custWOs = workOrders.filter(w => w.customer_id === c.customer_id);
    const renderServices = () => (
      <div className="card">
        <div className="ch"><h3>Service Records ({custWOs.length})</h3></div>
        {custWOs.length === 0 ? <div className="empty"><p>{isFilterOnly ? 'Filter-only customer — no oil change services.' : 'No services yet'}</p></div> : (
          <div className="tw">
          <table>
            <thead><tr><th>Unit</th><th>Date</th><th>Service</th><th>Status</th><th>Total</th><th>Invoice #</th></tr></thead>
            <tbody>
              {custWOs.map(w => {
                const u = getUnit(w.unit_id);
                return (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                    <td className="m">{w.service_date}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td><span className={`tag ${w.status === 'complete' ? 'tg' : 'ta'}`}>{w.status}</span></td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                    <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    );
    return (
      <>
        <div className="card">
          <div className="cust-hd">
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>{c.name}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <CustomerTypeBadge c={c} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gn)' }}>Parts discount: {formatPct(Number(c.discount_pct ?? 0))}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.billing_address || 'No address'}</div>
            </div>
            <button className="btn bs" onClick={() => setModal({ t: 'editCust', d: c })}>{IC(iEdit, 14)} Edit</button>
          </div>
          <div className="g3" style={{ marginBottom: 12 }}>
            {[['Contact', c.contact_name], ['Phone', c.phone], ['Email', c.email]].map(([l, v]) => (
              <div key={l}>
                <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block' }}>{l}</label>
                <p style={{ fontSize: 13 }}>{v || '—'}</p>
              </div>
            ))}
          </div>
          {!isFilterOnly && <div style={{ borderTop: '1px solid var(--bd2)', paddingTop: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--ac)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Default Pricing</label>
            <div className="g5" style={{ fontSize: 12 }}>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Travel</span><div className="m">{formatMoney(cf.travel_charge || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Env Fee</span><div className="m">{formatMoney(cf.environmental_fee || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Supplies</span><div className="m">{formatMoney(cf.service_supplies || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Oil Retail/gal</span><div className="m">{formatMoney(cf.oil_retail_per_gallon || 0)}</div></div>
              <div><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Oil Cost/gal</span><div className="m">{formatMoney(cf.oil_cost_per_gallon || 0)}</div></div>
            </div>
          </div>}
          {c.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx2)', padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>{c.notes}</div>}
        </div>
        <CustomerTabs
          key={c.customer_id}
          customer={c}
          nav={nav}
          toast={showToast}
          confirmDelete={confirmAction}
          renderEquipment={renderEquipment}
          renderServices={renderServices}
          renderFilterOrders={() => <CustomerFilterOrders customerId={c.customer_id} nav={nav} toast={showToast} />}
        />
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

    // Filters-only equipment: just the name, serial, and the filters it takes
    if (u.equipment_use === 'filters') {
      return (
        <>
          <div className="card">
            <div className="cust-hd" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.03em' }}>{u.unit_number}</div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {c?.name} <span className="tag tg">Filters only</span>
                </div>
              </div>
              <button className="btn bs" onClick={() => setModal({ t: 'editUnit', d: u })}>{IC(iEdit, 14)} Edit</button>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block' }}>Serial</label>
              <p style={{ fontSize: 13 }}>{u.serial_number || '—'}</p>
            </div>
          </div>
          <MachineFilters unit={u} nav={nav} toast={showToast} confirm={confirmAction} />
          {uWOs.length > 0 && (
            <div className="card">
              <div className="ch"><h3>Service History ({uWOs.length})</h3></div>
              <p style={{ fontSize: 12, color: 'var(--tx2)' }}>This machine has past oil change work orders. Switch it to &ldquo;For servicing&rdquo; with Edit to see and create them.</p>
            </div>
          )}
        </>
      );
    }

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
          <div className="g3" style={{ gap: 8 }}>
            {(() => {
              const lastWO = workOrders.filter(w => w.unit_id === u.unit_id && w.status === 'complete' && w.completed_at)
                .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))[0];
              const hoursLabel = u.current_hours > 0
                ? `${u.current_hours.toLocaleString()}${lastWO?.completed_at ? ` (as of ${new Date(lastWO.completed_at).toLocaleDateString()})` : ''}`
                : '—';
              return [
                ['Make/Model', `${u.make || '—'} ${u.model || ''}`], ['Engine', e?.name || '—'],
                ['Hours', hoursLabel],
                ['Oil', e ? `${e.oil_capacity_gallons || '—'} gal ${e.oil_type || ''}` : '—'],
                ['Year', u.year || '—'], ['Serial', u.serial_number || '—'],
              ];
            })().map(([l, v]) => (
              <div key={l}>
                <label style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block' }}>{l}</label>
                <p style={{ fontSize: 13, fontWeight: l === 'Engine' ? 600 : 400, color: l === 'Engine' ? 'var(--bl)' : 'inherit' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
        <MachineFilters unit={u} nav={nav} toast={showToast} confirm={confirmAction} />
        <div className="card">
          <div className="ch">
            <h3>Service Templates ({uTpls.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bs" onClick={() => setModal({ t: 'copyTemplate', unit_id: u.unit_id })}>Copy from another unit</button>
              <button className="btn bs bp" onClick={() => setModal({ t: 'addTemplate', unit_id: u.unit_id })}>{IC(iPlus, 15)} Add Service Template</button>
            </div>
          </div>
          {uTpls.length === 0 ? (<div className="empty"><p>No service templates yet for this unit. Click "Add Service Template" to create one.</p></div>) : (
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
              <button key={t.template_id} className="runtpl" onClick={async () => { const wid = await buildWorkOrderFromTemplate(t); if (wid) nav('wo', wid, t.name); }}>
                <span>{t.name}</span><span className="sub">{formatMoney(t.labor)} · {t.parts_list.length}p</span>
              </button>
            ))}
            <button className="btn" style={{ padding: '14px 16px', fontSize: 13, justifyContent: 'flex-start', borderStyle: 'dashed' }} onClick={async () => { const wid = await buildBlankWorkOrder(u.unit_id); if (wid) nav('wo', wid, 'Custom Service'); }}>
              {IC(iPlus, 14)} One-off Service (blank)
            </button>
          </div>
        </div>
        <div className="card">
          <div className="ch"><h3>History ({uWOs.length})</h3></div>
          {uWOs.length === 0 ? <div className="empty"><p>No work orders</p></div> : (
            <table>
              <thead><tr><th>Date</th><th>Service</th><th>Status</th><th>Total</th><th>Invoice #</th></tr></thead>
              <tbody>
                {uWOs.map(w => (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u.unit_number)}>
                    <td className="m" style={{ fontWeight: 700 }}>{w.service_date}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td><span className={`tag ${w.status === 'complete' ? 'tg' : 'ta'}`}>{w.status}</span></td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                    <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
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

    const togChecklist = (i: number) => { const newList = wo.checklist.map((it, j) => j === i ? { ...it, done: !it.done } : it); updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { checklist: newList } }); };
    const updField = (k: string, v: any) => updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { [k]: v } });
    // Accepts number directly (from LocalNumberInput) or string (backwards-compatible)
    const updFee = (k: string, v: number | string) => {
      const num = typeof v === 'number' ? v : (Number(v) || 0);
      const newFees = { ...wo.fees, [k]: num };
      const totals = calculateWorkOrderTotals({ parts: wo.parts_used, oil: wo.oil_used, fees: newFees, tax_rate_percent: wo.tax_rate_percent });
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { fees: newFees, ...totals } });
    };
    // Change the price charged on one part line (marks it as a custom price)
    const updPartPrice = (idx: number, price: number) => {
      const newParts = wo.parts_used.map((p, j) => {
        if (j !== idx) return p;
        const listSell = discountedPrice(p.retail_price, p.discount_pct ?? 0);
        return recalculatePartLine({ ...p, sell_price: round2(price), price_overridden: round2(price) !== listSell });
      });
      const totals = calculateWorkOrderTotals({ parts: newParts, oil: wo.oil_used, fees: wo.fees, tax_rate_percent: wo.tax_rate_percent });
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { parts_used: newParts, ...totals } });
    };
    const resetPartPrice = (idx: number) => {
      const p = wo.parts_used[idx];
      updPartPrice(idx, discountedPrice(p.retail_price, p.discount_pct ?? 0));
    };
    const toggleOil = (on: boolean) => {
      const cf = (c?.default_fees || {}) as any;
      const newOil = on && e && e.oil_capacity_gallons > 0 ? {
        type: e.oil_type, gallons: e.oil_capacity_gallons,
        retail_per_gallon: cf.oil_retail_per_gallon || 0, cost_per_gallon: cf.oil_cost_per_gallon || 0,
        total_retail: round2(e.oil_capacity_gallons * (cf.oil_retail_per_gallon || 0)),
        total_cost: round2(e.oil_capacity_gallons * (cf.oil_cost_per_gallon || 0)),
      } : null;
      const totals = calculateWorkOrderTotals({ parts: wo.parts_used, oil: newOil, fees: wo.fees, tax_rate_percent: wo.tax_rate_percent });
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { oil_used: newOil, ...totals } });
    };
    const toggleCustOil = (on: boolean) => {
      const cf = (c?.default_fees || {}) as any;
      const newOil = wo.oil_used ? {
        ...wo.oil_used,
        retail_per_gallon: on ? 0 : (cf.oil_retail_per_gallon || 0),
        cost_per_gallon: on ? 0 : (cf.oil_cost_per_gallon || 0),
        total_retail: on ? 0 : round2(wo.oil_used.gallons * (cf.oil_retail_per_gallon || 0)),
        total_cost: on ? 0 : round2(wo.oil_used.gallons * (cf.oil_cost_per_gallon || 0)),
      } : null;
      const totals = calculateWorkOrderTotals({ parts: wo.parts_used, oil: newOil, fees: wo.fees, tax_rate_percent: wo.tax_rate_percent });
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { customer_provided_oil: on, oil_used: newOil, ...totals } as any });
    };
    const addChecklistItem = () => { if (!newItem.trim()) return; const newList = [...wo.checklist, { text: newItem.trim(), done: false }]; updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { checklist: newList } }); setNewItem(''); };
    const complete = () => {
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { status: 'complete', completed_at: new Date().toISOString() } });
      if (wo.engine_hours > 0 && u) updateUnit.mutate({ unit_id: u.unit_id, updates: { current_hours: wo.engine_hours, previous_hours: u.current_hours || 0 } as any });
      showToast('Work order completed!');
    };
    const reopen = () => {
      updateWorkOrder.mutate({ work_order_id: wo.work_order_id, updates: { status: 'open', completed_at: null as any } });
      showToast('Work order unlocked for editing');
    };
    const toggleBilled = async () => {
      const nowBilled = !(wo as any).billed;
      await applyBilling(wo, nowBilled);
    };
    const handleDelete = async () => {
      try { await deleteWorkOrder.mutateAsync(wo.work_order_id); showToast('Work order deleted'); back(); }
      catch (err: any) { showToast('Failed to delete: ' + (err?.message || 'Unknown error'), true); }
    };

    const bySupplier: Record<string, ServicePartSnapshot[]> = {};
    if (!wo.customer_provided_filters) {
      for (const p of wo.parts_used) { if (!bySupplier[p.supplier]) bySupplier[p.supplier] = []; bySupplier[p.supplier].push(p); }
    }
    const allDone = wo.checklist.length > 0 && wo.checklist.every(i => i.done);
    const inp = { padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 12, background: 'var(--bg)', fontFamily: "'Outfit',sans-serif" };

    return (
      <div className="wo">
        {/* PRINT-ONLY HEADER */}
        <div className="print-only print-header">
          <div className="co">
            <h1>{company?.company_name || 'Your Company'}</h1>
            {company?.address && <p style={{ whiteSpace: 'pre-wrap' }}>{company.address}</p>}
            {company?.phone && <p>Phone: {company.phone}</p>}
            {company?.email && <p>Email: {company.email}</p>}
            {company?.tax_id && <p>Tax ID: {company.tax_id}</p>}
          </div>
          <div className="inv">
            <div className="lbl">Invoice</div>
            <div className="num">{wo.invoice_number ? `INV-${wo.invoice_number}` : 'DRAFT'}</div>
            <div className="date">Date: {fmtDateUS(wo.service_date)}</div>
            <div className="date">Terms: {company?.payment_terms || 'Net 15'}</div>
          </div>
        </div>
        <div className="print-only print-billto">
          <div>
            <div className="lbl">Bill To</div>
            <p><strong>{c?.name}</strong></p>
            {c?.contact_name && <p>{c.contact_name}</p>}
            {c?.billing_address && <p style={{ whiteSpace: 'pre-wrap' }}>{c.billing_address}</p>}
            {c?.phone && <p>Phone: {c.phone}</p>}
            {c?.email && <p>{c.email}</p>}
          </div>
          <div>
            <div className="lbl">Equipment</div>
            <p><strong>{u?.unit_number}</strong> — {u?.nickname || u?.type}</p>
            {u?.make && <p>{u.make} {u.model}</p>}
            {u?.serial_number && <p>S/N: {u.serial_number}</p>}
            {e?.name && <p>Engine: {e.name}</p>}
          </div>
        </div>

        {/* SCREEN HEADER */}
        <div className="wh">
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>Work Order {u?.unit_number || woPrimaryId(wo, u)}</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>
              {c?.name} · {u?.nickname ? `${u.nickname} · ` : ''}{e?.name}
              {wo.invoice_number ? <span style={{ marginLeft: 8, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--tx3)' }}>· {invNumDisplay(wo)}</span> : <span style={{ marginLeft: 8, color: 'var(--am)', fontSize: 11, fontWeight: 600 }}>· UNBILLED (no invoice # yet)</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", background: isOpen ? 'var(--am2)' : 'var(--gn2)', color: isOpen ? 'var(--am)' : 'var(--gn)' }}>{wo.status.toUpperCase()}</span>
            {!isOpen && (
              <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", background: (wo as any).billed ? 'var(--bl2)' : 'var(--am2)', color: (wo as any).billed ? 'var(--bl)' : 'var(--am)' }}>{(wo as any).billed ? 'BILLED' : 'UNBILLED'}</span>
            )}
            <button className="btn bs" onClick={() => setModal({ t: 'editInvoiceNumber', wo })} title="Edit invoice number">
              {IC(iEdit, 13)} INV #
            </button>
            {!isOpen && (
              <button className={`btn bs ${(wo as any).billed ? 'bg' : 'bp'}`} onClick={toggleBilled} title={(wo as any).billed ? 'Mark as unbilled' : 'Mark as billed'}>
                {IC(iChk, 13)} {(wo as any).billed ? 'Mark Unbilled' : 'Mark Billed'}
              </button>
            )}
            {!isOpen && (
              <button className="btn bs bwarn" onClick={reopen} title="Re-open this work order to edit it">
                {IC(iUnlock, 13)} Unlock
              </button>
            )}
            <button className="btn bs" onClick={() => window.print()}>{IC(iPrint, 15)} Print</button>
            <button
              className="btn bs bd2btn"
              onClick={() => setModal({
                t: 'confirmDelete',
                what: `Work Order ${u?.unit_number || woPrimaryId(wo, u)}${wo.invoice_number ? ` (INV-${wo.invoice_number})` : ''}${!isOpen ? ' — a COMPLETED work order' : ''}`,
                danger: true,
                onConfirm: handleDelete,
              })}
              title="Delete this work order"
            >
              {IC(iTrash, 13)}
            </button>
          </div>
        </div>

        <div className="ws wo-details">
          <h4>Details</h4>
          <div className="print-only print-equipment">
            <p><strong>{u?.unit_number}</strong> — {u?.nickname || u?.type}{u?.make ? ` · ${u.make} ${u.model || ''}` : ''}{e?.name ? ` · Engine: ${e.name}` : ''}{wo.engine_hours ? ` · Hours: ${wo.engine_hours.toLocaleString()}` : ''} · Service: {wo.tier}</p>
          </div>
          <div className="wi">
            <div><label>Unit</label><p style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number}</p></div>
            <div><label>Equipment</label><p>{u?.nickname}{u?.make ? ` — ${u.make} ${u.model || ''}` : ''}</p></div>
            <div><label>Engine</label><p style={{ color: 'var(--bl)', fontWeight: 600 }}>{e?.name}</p></div>
            <div><label>Service</label><p><span className="tag tc">{wo.tier}</span></p></div>
            <div><label>Date</label>{isOpen ? <input type="date" value={wo.service_date} onChange={ev => updField('service_date', ev.target.value)} style={inp} /> : <p className="m">{wo.service_date}</p>}</div>
            <div><label>Engine Hours</label>{isOpen ? (
              <LocalNumberInput
                value={wo.engine_hours || 0}
                placeholder="Enter hours"
                onCommit={v => updField('engine_hours', v)}
                style={{ ...inp, fontFamily: "'IBM Plex Mono',monospace", width: 120 }}
              />
            ) : <p className="m">{wo.engine_hours || '—'}</p>}</div>
            <div><label>Technician</label>{isOpen ? <input value={wo.technician} onChange={ev => updField('technician', ev.target.value)} placeholder="Name" style={{ ...inp, width: 140 }} /> : <p>{wo.technician || '—'}</p>}</div>
            <div><label>Invoice #</label><p className="m" style={{ fontWeight: 700, color: wo.invoice_number ? 'var(--tx)' : 'var(--am)' }}>{wo.invoice_number ? `INV-${wo.invoice_number}` : 'Unbilled'}</p></div>
            {isOpen && (
              <div><label>Cust. Filters</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={wo.customer_provided_filters} onChange={ev => updField('customer_provided_filters', ev.target.checked)} style={{ accentColor: 'var(--ac)' }} />
                  Customer providing
                </label>
              </div>
            )}
            {isOpen && (
              <div><label>Cust. Oil</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={!!(wo as any).customer_provided_oil} onChange={ev => toggleCustOil(ev.target.checked)} style={{ accentColor: 'var(--ac)' }} />
                  Customer providing
                </label>
              </div>
            )}
            {isOpen && (
              <div><label>Oil</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={!!wo.oil_used} onChange={ev => toggleOil(ev.target.checked)} style={{ accentColor: 'var(--ac)' }} />
                  Include oil
                </label>
              </div>
            )}
          </div>
        </div>

{/* Work orders saved before discount pricing keep their original layout */}
                {!wo.customer_provided_filters && (wo.parts_used.length > 0 || wo.oil_used) && !workOrderHasDiscountLines(wo.parts_used) && (
          <div className="ws wo-parts">
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
                {wo.oil_used && (
                  <tr className="oil-row print-only-row" style={{ cursor: 'default' }}>
                    <td className="m" style={{ color: '#888' }}>—</td>
                    <td style={{ fontSize: 12 }}>{wo.oil_used.type} engine oil{(wo as any).customer_provided_oil ? ' (customer supplied)' : ''}</td>
                    <td>{(wo as any).customer_provided_oil ? <span className="tag">Customer</span> : <span className="tag tb">CAT</span>}</td>
                    <td className="m">{wo.oil_used.gallons} gal</td>
                    <td className="m">{formatMoney(wo.oil_used.retail_per_gallon)}</td>
                    <td className="m">{formatMoney(wo.oil_used.total_retail)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!wo.customer_provided_filters && (wo.parts_used.length > 0 || wo.oil_used) && workOrderHasDiscountLines(wo.parts_used) && (
          <div className="ws wo-parts">
            <h4>Parts / Filter Order</h4>
            <table className="parts-disc">
              <thead><tr><th>Part #</th><th>Description</th><th>Qty</th><th>Retail</th><th>Discount</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                {wo.parts_used.map((p, i) => {
                  const price = partChargePrice(p);
                  const below = price < (Number(p.cost) || 0);
                  return (
                    <tr key={i} className={below ? 'below-cost' : ''} style={{ cursor: 'default' }}>
                      <td className="m" style={{ fontWeight: 600 }}>{p.part_number}</td>
                      <td style={{ fontSize: 12 }}>
                        {p.description}
                        {p.price_overridden && <span className="tag ta no-print" style={{ marginLeft: 6 }}>custom price{isOpen && <button className="linkbtn" onClick={() => resetPartPrice(i)}>reset</button>}</span>}
                        {p.no_discount && <span className="tag nodisc no-print" style={{ marginLeft: 6 }}>No discount</span>}
                        {below && <span className="below-cost-tag no-print">Below cost ({formatMoney(p.cost)})</span>}
                      </td>
                      <td className="m">{p.qty}</td>
                      <td className="m">{formatMoney(p.retail_price)}</td>
                      <td className="m">
                        <span className="no-print">{formatPct(effectiveDiscountPct(p.retail_price, price))}</span>
                        <span className="print-only">{invoiceDiscountText(p)}</span>
                      </td>
                      <td className="m">
                        {isOpen ? (
                          <>
                            <LocalNumberInput value={price} step="0.01" ariaLabel={`Price for ${p.part_number}`} className="num-in no-print" onCommit={v => updPartPrice(i, v)} />
                            <span className="print-only">{formatMoney(price)}</span>
                          </>
                        ) : formatMoney(price)}
                      </td>
                      <td className="m">{formatMoney(p.line_total_retail)}</td>
                    </tr>
                  );
                })}
                {wo.oil_used && (
                  <tr className="oil-row print-only-row" style={{ cursor: 'default' }}>
                    <td className="m" style={{ color: '#888' }}>—</td>
                    <td style={{ fontSize: 12 }}>{wo.oil_used.type} engine oil{(wo as any).customer_provided_oil ? ' (customer supplied)' : ''}</td>
                    <td className="m">{wo.oil_used.gallons} gal</td>
                    <td></td>
                    <td></td>
                    <td className="m">{formatMoney(wo.oil_used.retail_per_gallon)}</td>
                    <td className="m">{formatMoney(wo.oil_used.total_retail)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {workOrderPartsSavings(wo.parts_used) > 0 && (
              <div className="cr savings-row"><span>Parts discount savings</span><span className="m">{formatMoney(workOrderPartsSavings(wo.parts_used))}</span></div>
            )}
          </div>
        )}

        {wo.oil_used && (
          <div className="ws screen-only-oil">
            <h4>Oil</h4>
            <div style={{ padding: '6px 10px', background: 'var(--gn2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--gn)' }}>
              <strong>{wo.oil_used.gallons} gal {wo.oil_used.type}</strong> · {formatMoney(wo.oil_used.total_retail)}
            </div>
          </div>
        )}

        <div className="ws wo-work">
          <h4>Work Performed</h4>
          {wo.checklist.map((it, i) => (
            <div key={i} className="wk">
              {isOpen ? (<div className={`ck${it.done ? ' on' : ''}`} onClick={() => togChecklist(i)}>{it.done && IC(iChk, 14)}</div>) :
                (<div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: it.done ? 'var(--gn)' : 'var(--tx3)', fontSize: 14 }}>{it.done ? '\u2713' : '\u25CB'}</div>)}
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

        {/* COST BREAKDOWN — gets its own page in print */}
        <div className="ws cost-section">
          <h4>Cost Breakdown</h4>
          {isOpen && (
            <div className="cost-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[['Labor', 'labor'], ['Travel', 'travel_charge'], ['Supplies', 'service_supplies'], ['Environmental', 'environmental_fee'], ['Oil Sample', 'oil_sample_fee'], ['Other', 'other']].map(([l, k]) => (
                <div key={k} className="fld" style={{ marginBottom: 6 }}>
                  <label>{l}</label>
                  <LocalNumberInput
                    value={(wo.fees as any)[k] || 0}
                    step="0.01"
                    onCommit={v => updFee(k, v)}
                    style={{ padding: '5px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", width: '100%', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', color: 'var(--tx)', outline: 'none' }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className={isOpen ? 'fees-print-only' : ''}>
            {Object.entries(wo.fees).filter(([_k, v]) => v > 0).map(([k, v]) => (
              <div key={k} className="cr">
                <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                <span className="m">{formatMoney(Number(v))}</span>
              </div>
            ))}
          </div>
          <div className="cr"><span>Parts + Oil (taxable)</span><span className="m">{formatMoney(wo.subtotal_parts_oil)}</span></div>
          <div className="cr no-print"><span>Labor & Fees (subtotal)</span><span className="m">{formatMoney(wo.subtotal_fees)}</span></div>
          <div className="cr"><span>Tax ({wo.tax_rate_percent}%)</span><span className="m">{formatMoney(wo.tax_amount)}</span></div>
          <div className="cr tot"><span>TOTAL</span><span className="m">{formatMoney(wo.total_retail)}</span></div>
          <div className="cr no-print" style={{ color: 'var(--gn)', fontSize: 11, marginTop: 4 }}>
            <span>Profit ({wo.profit_margin_percent?.toFixed(1) || '0'}% margin)</span>
            <span className="m">{formatMoney(wo.profit)}</span>
          </div>
        </div>

        {(isOpen || wo.notes) && (
        <div className={`ws wo-notes${!wo.notes ? ' wo-notes-empty' : ''}`}>
          <h4>Notes</h4>
          {isOpen ? (<textarea value={wo.notes} onChange={ev => updField('notes', ev.target.value)} placeholder="Observations, issues..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", background: 'var(--bg)', minHeight: 50, resize: 'vertical', outline: 'none' }} />) :
            (<p style={{ fontSize: 13, color: wo.notes ? 'var(--tx)' : 'var(--tx3)' }}>{wo.notes || 'No notes'}</p>)}
        </div>
        )}

        {/* PRINT FOOTER — company contact info at bottom (per partner request) */}
        <div className="print-only print-company-footer">
          {company?.company_name} · {company?.address?.replace(/\n/g, ', ')}
          {company?.phone && ` · ${company.phone}`}
          {company?.email && ` · ${company.email}`}
        </div>

        {/* PRINT FOOTER */}
        {company?.invoice_footer_notes && (
          <div className="print-only print-footnotes" style={{ padding: '12pt 0 0 0', fontSize: '8.5pt', color: '#555', borderTop: '1pt solid #ccc' }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{company.invoice_footer_notes}</p>
          </div>
        )}

        {isOpen && (
          <div className="ws wo-complete" style={{ background: allDone ? 'var(--gn2)' : 'var(--bg)', textAlign: 'center', padding: 20 }}>
            <button className="btn bp" style={{ fontSize: 14, padding: '10px 28px' }} onClick={complete}>{IC(iChk, 14)} Complete Work Order</button>
            {!allDone && wo.checklist.length > 0 && <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>{wo.checklist.filter(x => !x.done).length} unchecked</p>}
          </div>
        )}
      </div>
    );
  };

  // ===== OIL ANALYSIS SLIPS =====
  const woSeq = (w: WorkOrder) => `${w.service_date}|${String(w.invoice_number ?? 0).padStart(10, '0')}`;
  const fluidHoursFor = (wo: WorkOrder): number | null => {
    if (!wo.engine_hours || wo.engine_hours <= 0) return null;
    const prior = workOrders
      .filter(w => w.unit_id === wo.unit_id && w.work_order_id !== wo.work_order_id && (w.engine_hours || 0) > 0 && woSeq(w) < woSeq(wo))
      .sort((a, b) => woSeq(b).localeCompare(woSeq(a)))[0];
    if (prior) {
      const diff = wo.engine_hours - (prior.engine_hours || 0);
      if (diff > 0) return diff;
    }
    const prevHrs = (getUnit(wo.unit_id) as any)?.previous_hours || 0;
    if (prevHrs > 0 && wo.engine_hours > prevHrs) return wo.engine_hours - prevHrs;
    return null;
  };

  const needsOilSlip = (w: WorkOrder) =>
    w.status === 'complete' && (
      ((w.fees as any)?.oil_sample_fee || 0) > 0 ||
      w.parts_used.some(p => {
        const cat = getPart(p.part_number)?.category || '';
        return cat === 'Lab/Testing' || /oil\s*(analysis|sample)|s\W?o\W?s/i.test(p.description || '');
      })
    );

  const fmtDateUS = (d: string) => {
    const [y, m, dd] = (d || '').split('-');
    return m && dd ? `${m}/${dd}/${y}` : d;
  };

  const toggleSlip = (id: string) => setSelectedOilSlips(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const printOilSlips = () => { setShowOilSlips(true); setTimeout(() => window.print(), 350); };
  const markSlipsPrinted = async (ids: string[], printed: boolean) => {
    try {
      for (const id of ids) {
        await updateWorkOrder.mutateAsync({ work_order_id: id, updates: { oil_slip_printed: printed, oil_slip_printed_at: printed ? new Date().toISOString() : null } as any });
      }
      showToast(printed ? `${ids.length} slip${ids.length === 1 ? '' : 's'} marked printed` : 'Moved back to pending');
    } catch (err: any) { showToast('Failed: ' + (err?.message || 'Unknown error'), true); }
  };

  const renderOilSlip = (wo: WorkOrder) => {
    const u = getUnit(wo.unit_id);
    const e = u ? getEngine(u.engine_id) : undefined;
    const fluidHrs = fluidHoursFor(wo);
    const galsRaw = wo.oil_used?.gallons ?? 0;
    const gal = Math.floor(galsRaw);
    const qt = Math.round((galsRaw - gal) * 4);
    return (
      <div className="oil-slip" key={wo.work_order_id}>
        <div className="oil-slip-hd">
          <b>OIL ANALYSIS SAMPLE</b>
          <span>{company?.phone || ''}</span>
        </div>
        <div className="osrow" style={{ gridTemplateColumns: '1.7fr 0.9fr 1.6fr 0.9fr' }}>
          <div className="oscell"><span className="osl">Company Name</span><span className="osv">{company?.company_name || 'Complete Fleet Solutions, LLC'}</span></div>
          <div className="oscell"><span className="osl">Date</span><span className="osv">{fmtDateUS(wo.service_date)}</span></div>
          <div className="oscell"><span className="osl">Serial #</span><span className="osv">{u?.serial_number || ''}</span></div>
          <div className="oscell"><span className="osl">Unit #</span><span className="osv">{u?.unit_number || ''}</span></div>
        </div>
        <div className="osrow" style={{ gridTemplateColumns: '1fr 1fr 1.1fr 1.2fr 1fr' }}>
          <div className="oscell"><span className="osl">Equip Hrs</span><span className="osv">{wo.engine_hours > 0 ? wo.engine_hours.toLocaleString() : ''}</span></div>
          <div className="oscell"><span className="osl">Fluid Hrs</span><input className="osinput" defaultValue={fluidHrs != null ? fluidHrs.toLocaleString() : ''} /></div>
          <div className="oscell"><span className="osl">Oil Added</span><span className="osv">{galsRaw > 0 ? `${gal} GAL ${qt} QT` : ''}</span></div>
          <div className="oscell"><span className="osl">Oil Brand / WT</span><span className="osv">{wo.oil_used?.type || e?.oil_type || ''}</span></div>
          <div className="oscell"><span className="osl">Compartment</span><span className="osv">ENGINE</span></div>
        </div>
      </div>
    );
  };

  const renderOilSlipsPage = () => {
    const eligible = workOrders.filter(needsOilSlip);
    const pending = eligible.filter(w => !(w as any).oil_slip_printed);
    const printed = eligible.filter(w => (w as any).oil_slip_printed);
    return (
      <>
        <div className="card">
          <div className="ch">
            <h3>Pending Slips ({pending.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bs bg" onClick={() => setSelectedOilSlips(pending.map(w => w.work_order_id))}>Select all</button>
              <button className="btn bs bg" onClick={() => setSelectedOilSlips([])}>Clear</button>
              <button className="btn bs bp" disabled={selectedOilSlips.length === 0} onClick={printOilSlips}>{IC(iPrint, 14)} Print Slips ({selectedOilSlips.length})</button>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Completed work orders with an oil analysis. Select, print, then mark printed.</p>
          {pending.length === 0 ? <div className="empty"><p>No pending oil slips</p></div> : (
            <table>
              <thead><tr><th style={{ width: 30 }}></th><th>Unit</th><th>Date</th><th>Customer</th><th>Invoice #</th><th></th></tr></thead>
              <tbody>
                {pending.map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => toggleSlip(w.work_order_id)} style={{ cursor: 'pointer' }}>
                      <td><input type="checkbox" checked={selectedOilSlips.includes(w.work_order_id)} readOnly style={{ pointerEvents: 'none', accentColor: 'var(--ac)' }} /></td>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td className="m">{fmtDateUS(w.service_date)}</td>
                      <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                      <td onClick={ev => ev.stopPropagation()}><button className="btn bs" onClick={() => markSlipsPrinted([w.work_order_id], true)}>{IC(iChk, 13)} Printed</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="ch"><h3>Printed ({printed.length})</h3></div>
          {printed.length === 0 ? <div className="empty"><p>None yet</p></div> : (
            <table>
              <thead><tr><th>Unit</th><th>Service Date</th><th>Customer</th><th>Invoice #</th><th>Printed</th><th></th></tr></thead>
              <tbody>
                {printed.slice(0, 30).map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td className="m">{fmtDateUS(w.service_date)}</td>
                      <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                      <td className="m">{(w as any).oil_slip_printed_at ? new Date((w as any).oil_slip_printed_at).toLocaleDateString() : '—'}</td>
                      <td onClick={ev => ev.stopPropagation()}><button className="btn bs bg" onClick={() => markSlipsPrinted([w.work_order_id], false)}>Undo</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
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
              <thead><tr><th>Unit</th><th>Customer</th><th>Service</th><th>Date</th><th>Invoice #</th></tr></thead>
              <tbody>
                {open.map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td>{getCustomer(w.customer_id)?.name}</td>
                      <td><span className="tag tc">{w.tier}</span></td>
                      <td className="m">{w.service_date}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="ch"><h3>Completed ({done.length})</h3></div>
          {done.length === 0 ? <div className="empty"><p>None yet</p></div> : (
            <table>
              <thead><tr><th>Unit</th><th>Date</th><th>Customer</th><th>Service</th><th>Total</th><th>Invoice #</th></tr></thead>
              <tbody>
                {done.slice(0, 20).map(w => {
                  const u = getUnit(w.unit_id);
                  return (
                    <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                      <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                      <td className="m">{w.service_date}</td>
                      <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                      <td><span className="tag tc">{w.tier}</span></td>
                      <td className="m">{formatMoney(w.total_retail)}</td>
                      <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                    </tr>
                  );
                })}
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
            <thead><tr><th>Unit</th><th>Date</th><th>Customer</th><th>Service</th><th>Hours</th><th>Total</th><th>Invoice #</th></tr></thead>
            <tbody>
              {all.map(w => {
                const u = getUnit(w.unit_id);
                return (
                  <tr key={w.work_order_id} onClick={() => nav('wo', w.work_order_id, u?.unit_number || woPrimaryId(w, u))}>
                    <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{u?.unit_number || '—'}</td>
                    <td className="m">{w.service_date}</td>
                    <td style={{ color: 'var(--tx2)' }}>{getCustomer(w.customer_id)?.name}</td>
                    <td><span className="tag tc">{w.tier}</span></td>
                    <td className="m">{w.engine_hours || '—'}</td>
                    <td className="m">{formatMoney(w.total_retail)}</td>
                    <td className="m" style={{ color: w.invoice_number ? 'var(--tx)' : 'var(--tx3)', fontStyle: w.invoice_number ? 'normal' : 'italic' }}>{w.invoice_number ? `INV-${w.invoice_number}` : 'unbilled'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderBilling = () => {
    // ─── Time window filter ───────────────────────────────────────
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoffMs =
      billRange === 'all' ? 0 :
      billRange === 'year' ? nowMs - 365 * dayMs :
      nowMs - Number(billRange) * dayMs;
    const inRange = (dateStr: string | null | undefined) => {
      if (billRange === 'all') return true;
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      return !isNaN(t) && t >= cutoffMs;
    };

    // ─── One row shape for work orders AND filter orders ─────────
    type BillRow = {
      kind: 'wo' | 'fo'; id: string; date: string; customer_id: string; label: string; service: string;
      total: number; invoice_number: number | null; billed_at: string | null; wo?: WorkOrder; fo?: FilterOrder;
    };
    const woRow = (w: WorkOrder): BillRow => {
      const u = getUnit(w.unit_id);
      return { kind: 'wo', id: w.work_order_id, date: w.service_date, customer_id: w.customer_id, label: u?.unit_number || woPrimaryId(w, u), service: w.tier, total: w.total_retail || 0, invoice_number: w.invoice_number, billed_at: (w as any).billed_at, wo: w };
    };
    const foRow = (o: FilterOrder): BillRow => ({
      kind: 'fo', id: o.filter_order_id, date: isoDateOf(o.delivered_at) || isoDateOf(o.created_at), customer_id: o.customer_id, label: orderLabel(o),
      service: 'Filter Order', total: foTotals(o).total, invoice_number: o.invoice_number, billed_at: o.billed_at, fo: o,
    });
    const openRow = (r: BillRow) => r.kind === 'wo' ? nav('wo', r.id, r.label) : nav('forder', r.id, r.label);
    const setBilled = (r: BillRow, on: boolean) => r.kind === 'wo' ? applyBilling(r.wo!, on) : applyFilterBilling(r.fo!, on);

    // ─── Sort comparator ──────────────────────────────────────────
    const sortFn = (a: BillRow, b: BillRow): number => {
      switch (billSort) {
        case 'date-old':   return (a.date || '').localeCompare(b.date || '');
        case 'price-high': return (b.total || 0) - (a.total || 0);
        case 'price-low':  return (a.total || 0) - (b.total || 0);
        case 'inv-high':   return (b.invoice_number || 0) - (a.invoice_number || 0);
        case 'inv-low':    return (a.invoice_number || Number.MAX_SAFE_INTEGER) - (b.invoice_number || Number.MAX_SAFE_INTEGER);
        case 'cust':       return (getCustomer(a.customer_id)?.name || '').localeCompare(getCustomer(b.customer_id)?.name || '');
        case 'date-new':
        default:           return (b.date || '').localeCompare(a.date || '');
      }
    };

    const completed = workOrders.filter(w => w.status === 'complete');
    const deliveredFOs = filterOrders.filter(o => ['delivered', 'paid'].includes(o.status));
    // Unbilled filters by service/delivery date (older = more urgent); Billed filters by billed_at ("in last N days I billed")
    const unbilled = [
      ...completed.filter(w => !(w as any).billed && inRange(w.service_date)).map(woRow),
      ...deliveredFOs.filter(o => !o.billed && inRange(o.delivered_at)).map(foRow),
    ].sort(sortFn);
    const billed = [
      ...completed.filter(w => (w as any).billed && inRange((w as any).billed_at)).map(woRow),
      ...filterOrders.filter(o => o.billed && inRange(o.billed_at)).map(foRow),
    ].sort(sortFn);
    const unbilledTotal = unbilled.reduce((s, r) => s + (r.total || 0), 0);
    const billedTotal = billed.reduce((s, r) => s + (r.total || 0), 0);

    const rangeLabel = (r: BillingRange) => ({
      '30': 'Last 30 days', '60': 'Last 60 days', '90': 'Last 90 days', 'year': 'Last year', 'all': 'All time',
    }[r]);

    const toggleSel = (id: string) => setSelectedForExport(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    const selectAllBilled = () => setSelectedForExport(billed.map(r => r.id));
    const clearSel = () => setSelectedForExport([]);

    const doBatchExport = async () => {
      if (selectedForExport.length === 0) return;
      setExporting(true);
      try {
        const rows = billed.filter(r => selectedForExport.includes(r.id));
        await batchExportInvoices(rows.filter(r => r.kind === 'wo').map(r => r.wo!), rows.filter(r => r.kind === 'fo').map(r => r.fo!));
        showToast(`Downloaded ${rows.length} invoice${rows.length === 1 ? '' : 's'}`);
      } catch (err: any) {
        showToast(`Export failed: ${err?.message || 'Unknown error'}`, true);
      } finally {
        setExporting(false);
      }
    };

    const activeLabel = rangeLabel(billRange);
    const typeTag = (r: BillRow) => r.kind === 'fo' ? <span className="tag tg">Filter Order</span> : <span className="tag tc">{r.service}</span>;

    return (
      <>
        {/* Filter + sort + batch export bar */}
        <div className="filterbar">
          <span className="lbl">Period:</span>
          {(['30', '60', '90', 'year', 'all'] as BillingRange[]).map(r => (
            <button key={r} className={`btn bs ${billRange === r ? 'bp' : ''}`} onClick={() => setBillRange(r)}>{rangeLabel(r)}</button>
          ))}
          <div className="sep" />
          <span className="lbl">Sort:</span>
          <select className="sort-sel" value={billSort} onChange={e => setBillSort(e.target.value as BillingSort)}>
            <option value="date-new">Date (newest first)</option>
            <option value="date-old">Date (oldest first)</option>
            <option value="price-high">Price (high to low)</option>
            <option value="price-low">Price (low to high)</option>
            <option value="inv-high">Invoice # (high to low)</option>
            <option value="inv-low">Invoice # (low to high)</option>
            <option value="cust">Customer (A–Z)</option>
          </select>
          <div style={{ flex: 1 }} />
          {selectedForExport.length > 0 && (
            <>
              <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{selectedForExport.length} selected</span>
              <button className="btn bs bg" onClick={clearSel}>Clear</button>
              <button className="btn bs bp" onClick={doBatchExport} disabled={exporting}>
                {IC(iPrint, 13)} {exporting ? 'Building zip…' : `Download ${selectedForExport.length} PDF${selectedForExport.length === 1 ? '' : 's'} (zip)`}
              </button>
            </>
          )}
        </div>

        <div className="stats">
          <div className="st"><div className="st-l">Unbilled</div><div className="st-v" style={{ color: unbilled.length ? 'var(--am)' : 'var(--gn)' }}>{unbilled.length}</div></div>
          <div className="st"><div className="st-l">Outstanding</div><div className="st-v" style={{ color: 'var(--am)' }}>${Math.round(unbilledTotal).toLocaleString()}</div></div>
          <div className="st"><div className="st-l">Billed</div><div className="st-v" style={{ color: 'var(--bl)' }}>{billed.length}</div></div>
          <div className="st"><div className="st-l">Billed Total</div><div className="st-v">${Math.round(billedTotal).toLocaleString()}</div></div>
        </div>

        <div className="card">
          <div className="ch">
            <h3>Unbilled — Needs Invoicing ({unbilled.length})
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--tx3)', marginLeft: 6 }}>· {activeLabel}</span>
            </h3>
          </div>
          {unbilled.length === 0 ? <div className="empty"><p>All caught up for this period! Nothing waiting to be billed.</p></div> : (
            <div className="tw">
            <table>
              <thead><tr><th>Unit / Order</th><th>Date</th><th>Customer</th><th>Service</th><th>Total</th><th>Invoice #</th><th></th></tr></thead>
              <tbody>
                {unbilled.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--ac)', cursor: 'pointer' }} onClick={() => openRow(r)}>{r.label}</td>
                    <td className="m">{r.date}</td>
                    <td>{getCustomer(r.customer_id)?.name}</td>
                    <td>{typeTag(r)}</td>
                    <td className="m" style={{ fontWeight: 600 }}>{formatMoney(r.total)}</td>
                    <td className="m" style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>— unbilled</td>
                    <td><button className="btn bs bp" onClick={() => setBilled(r, true)}>{IC(iChk, 13)} Billed</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="ch">
            <h3>Billed ({billed.length})
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--tx3)', marginLeft: 6 }}>· {activeLabel}</span>
            </h3>
            {billed.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn bs bg" onClick={selectAllBilled}>Select all</button>
                <button className="btn bs bg" onClick={clearSel}>Clear</button>
              </div>
            )}
          </div>
          {billed.length === 0 ? <div className="empty"><p>Nothing billed in this period</p></div> : (
            <div className="tw">
            <table>
              <thead><tr><th style={{ width: 28 }}></th><th>Unit / Order</th><th>Billed</th><th>Customer</th><th>Service</th><th>Total</th><th>Invoice #</th><th></th></tr></thead>
              <tbody>
                {billed.map(r => {
                  const sel = selectedForExport.includes(r.id);
                  return (
                    <tr key={r.id} style={{ background: sel ? 'var(--ac3)' : undefined }}>
                      <td onClick={() => toggleSel(r.id)} style={{ cursor: 'pointer' }}><input type="checkbox" className="batch-cb" checked={sel} readOnly style={{ pointerEvents: 'none' }} aria-label={`Select ${r.label}`} /></td>
                      <td style={{ fontWeight: 700, color: 'var(--ac)', cursor: 'pointer' }} onClick={() => openRow(r)}>{r.label}</td>
                      <td className="m">{r.billed_at ? new Date(r.billed_at).toLocaleDateString() : '—'}</td>
                      <td>{getCustomer(r.customer_id)?.name}</td>
                      <td>{typeTag(r)}</td>
                      <td className="m">{formatMoney(r.total)}</td>
                      <td>
                        {r.kind === 'wo' ? (
                          <span className="inv-cell m" onClick={() => setModal({ t: 'editInvoiceNumber', wo: r.wo! })} title="Click to edit invoice #">
                            {r.invoice_number ? <strong>{r.invoice_number}</strong> : <em className="inv-missing">missing</em>}
                            <span className="pencil">✎</span>
                          </span>
                        ) : (
                          <span className="inv-cell m" onClick={() => openRow(r)} title="Open the order to edit its invoice #">
                            {r.invoice_number ? <strong>{r.invoice_number}</strong> : <em className="inv-missing">missing</em>}
                          </span>
                        )}
                      </td>
                      <td><button className="btn bs bg" onClick={() => setBilled(r, false)}>Undo</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderInventory = () => {
    // Join inventory rows with part info
    const invByPartId: Record<string, InventoryItem> = {};
    inventory.forEach(it => { invByPartId[it.part_id] = it; });

    const q = invSearch.trim().toLowerCase();
    type InvRow = { inv: InventoryItem; part: Part | undefined };
    const rows: InvRow[] = inventory.map(inv => ({ inv, part: parts.find(p => p.part_id === inv.part_id) }));
    const filtered = q ? rows.filter(({ part }) =>
      part && (
        (part.part_number || '').toLowerCase().includes(q) ||
        (part.description || '').toLowerCase().includes(q) ||
        (part.manufacturer || '').toLowerCase().includes(q) ||
        (part.category || '').toLowerCase().includes(q)
      )
    ) : rows;

    const totalItems = inventory.length;
    const lowStock = rows.filter(({ inv }) => inv.reorder_point != null && inv.quantity_on_hand <= Number(inv.reorder_point) && inv.quantity_on_hand > 0).length;
    const outOfStock = rows.filter(({ inv }) => inv.quantity_on_hand <= 0).length;

    const stockStatus = (inv: InventoryItem): { label: string; cls: string } => {
      if (inv.quantity_on_hand <= 0) return { label: 'OUT', cls: 'inv-stock-out' };
      if (inv.reorder_point != null && inv.quantity_on_hand <= Number(inv.reorder_point)) return { label: 'LOW', cls: 'inv-stock-low' };
      return { label: 'OK', cls: 'inv-stock-ok' };
    };

    const commitQty = async (inv: InventoryItem, newQty: number) => {
      if (newQty === inv.quantity_on_hand) return;
      try {
        await updateInventoryItem.mutateAsync({ inventory_id: inv.inventory_id, updates: { quantity_on_hand: newQty } });
      } catch (err: any) { showToast(`Failed to update: ${err?.message || 'Unknown error'}`, true); }
    };

    const commitReorder = async (inv: InventoryItem, newVal: number) => {
      const next = newVal > 0 ? newVal : null;
      if (next === inv.reorder_point) return;
      try {
        await updateInventoryItem.mutateAsync({ inventory_id: inv.inventory_id, updates: { reorder_point: next } });
      } catch (err: any) { showToast(`Failed to update: ${err?.message || 'Unknown error'}`, true); }
    };

    const handleRemove = (inv: InventoryItem, part: Part | undefined) => {
      setModal({
        t: 'confirmDelete',
        what: `"${part?.part_number || 'this part'}" from inventory (part catalog entry stays)`,
        onConfirm: async () => {
          await deleteInventoryItem.mutateAsync(inv.inventory_id);
          showToast('Removed from inventory');
        },
      });
    };

    return (
      <>
        <div className="stats">
          <div className="st"><div className="st-l">Tracked Parts</div><div className="st-v" style={{ color: 'var(--ac)' }}>{totalItems}</div></div>
          <div className="st"><div className="st-l">Low Stock</div><div className="st-v" style={{ color: lowStock ? 'var(--am)' : 'var(--gn)' }}>{lowStock}</div></div>
          <div className="st"><div className="st-l">Out of Stock</div><div className="st-v" style={{ color: outOfStock ? 'var(--rd)' : 'var(--gn)' }}>{outOfStock}</div></div>
          <div className="st"><div className="st-l">Catalog Parts</div><div className="st-v" style={{ color: 'var(--tx2)' }}>{parts.length}</div></div>
        </div>

        <div className="card">
          <div className="ch">
            <h3>Inventory ({q ? `${filtered.length} of ${totalItems}` : totalItems})</h3>
            <button className="btn bs bp" onClick={() => { setInvPickerSearch(''); setModal({ t: 'addInventory' }); }}>{IC(iPlus, 15)} Add Part to Inventory</button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 10 }}>
            Quantities auto-deduct when you mark a work order billed. If you un-bill, the quantity comes back.
            Set a Reorder At to get a LOW tag when stock drops to that level.
          </p>

          {totalItems > 0 && (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text"
                value={invSearch}
                onChange={ev => setInvSearch(ev.target.value)}
                placeholder="Search inventory by part #, description, manufacturer, or category..."
                style={{ width: '100%', padding: '8px 32px 8px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", outline: 'none', color: 'var(--tx)' }}
              />
              {invSearch && (
                <button onClick={() => setInvSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', fontSize: 16, padding: '2px 8px', lineHeight: 1 }}>✕</button>
              )}
            </div>
          )}

          {totalItems === 0 ? (
            <div className="empty"><p>No parts tracked yet. Click "Add Part to Inventory" to start tracking a part from your catalog.</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty"><p>No tracked parts match "{invSearch}"</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Part #</th>
                  <th>Description</th>
                  <th>Mfr</th>
                  <th>On Hand</th>
                  <th>Reorder At</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ inv, part }) => {
                  const status = stockStatus(inv);
                  return (
                    <tr key={inv.inventory_id} style={{ cursor: 'default' }}>
                      <td className="m" style={{ fontWeight: 700 }}>{part?.part_number || <em style={{ color: 'var(--rd)' }}>missing</em>}</td>
                      <td>{part?.description || <em style={{ color: 'var(--tx3)' }}>part deleted from catalog</em>}</td>
                      <td>{part ? <span className="tag tb">{part.manufacturer}</span> : '—'}</td>
                      <td>
                        <LocalNumberInput
                          value={Number(inv.quantity_on_hand) || 0}
                          step="1"
                          onCommit={v => commitQty(inv, v)}
                          style={{ padding: '3px 6px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", width: 70, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--tx)', outline: 'none' }}
                        />
                      </td>
                      <td>
                        <LocalNumberInput
                          value={Number(inv.reorder_point) || 0}
                          step="1"
                          onCommit={v => commitReorder(inv, v)}
                          style={{ padding: '3px 6px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", width: 70, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--tx)', outline: 'none' }}
                        />
                      </td>
                      <td><span className={`inv-stock ${status.cls}`}>{status.label}</span></td>
                      <td><button className="btn bs bd2btn" onClick={() => handleRemove(inv, part)}>{IC(iTrash, 13)}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderParts = () => {
    const q = partsSearch.trim().toLowerCase();
    const stdDisc = Number(company?.default_customer_discount_pct ?? 6);
    const needCheckCount = parts.filter(p => !p.retail_verified && p.active !== false).length;
    const filtered = parts.filter(p =>
      (partsActive === 'all' || (partsActive === 'active' ? p.active !== false : p.active === false)) &&
      (partsCat === 'all' || p.category === partsCat) &&
      (!partsNeedCheck || !p.retail_verified) &&
      (!partsNoDisc || !!p.no_discount) &&
      (!q ||
        (p.part_number || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.manufacturer || '').toLowerCase().includes(q) ||
        (p.supplier || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q))
    );
    const cats = Array.from(new Set([...CATEGORIES, ...parts.map(p => p.category).filter(Boolean)]));
    const commitPart = async (p: Part, updates: Partial<Part>) => {
      try { await updatePart.mutateAsync({ part_id: p.part_id, updates }); }
      catch (err: any) { showToast(`Failed to update: ${err?.message || 'Unknown error'}`, true); }
    };
    const cellInput = { padding: '3px 6px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", width: 76, textAlign: 'right' as const, background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--tx)', outline: 'none' };

    return (
      <div className="card">
        <div className="ch">
          <h3>Parts &amp; Filters ({filtered.length === parts.length ? parts.length : `${filtered.length} of ${parts.length}`})</h3>
          <button className="btn bs bp" onClick={() => setModal({ t: 'addPart' })}>{IC(iPlus, 15)} Add Part</button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 10 }}>
          Customers pay <strong>Retail</strong> minus their discount (standard {stdDisc}%). <strong>Cost</strong> is what you pay and never shows on invoices. Edit cost and retail right in the table, and tick <strong>Verified</strong> once you&apos;ve confirmed a part&apos;s real retail price.
        </p>
        {parts.length > 0 && (
          <>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                type="text"
                value={partsSearch}
                onChange={ev => setPartsSearch(ev.target.value)}
                placeholder="Search by part #, description, manufacturer, supplier, or category..."
                style={{ width: '100%', padding: '8px 32px 8px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", outline: 'none', color: 'var(--tx)' }}
              />
              {partsSearch && (
                <button onClick={() => setPartsSearch('')} title="Clear search" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', fontSize: 16, padding: '2px 8px', lineHeight: 1 }}>✕</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <button className={`chip${partsNeedCheck ? ' on' : ''}`} onClick={() => setPartsNeedCheck(v => !v)} title="Show only parts whose retail price hasn't been verified">
                Needs retail check ({needCheckCount})
              </button>
              <button className={`chip${partsNoDisc ? ' on' : ''}`} onClick={() => setPartsNoDisc(v => !v)} title="Show only parts that always sell at retail">
                No-discount parts ({parts.filter(p => p.no_discount).length})
              </button>
              <select className="sort-sel" value={partsCat} onChange={e => setPartsCat(e.target.value)} aria-label="Filter by category">
                <option value="all">All categories</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="sort-sel" value={partsActive} onChange={e => setPartsActive(e.target.value as any)} aria-label="Filter by active">
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">Active + inactive</option>
              </select>
            </div>
            {needCheckCount > 0 && <p style={{ fontSize: 12, color: 'var(--am)', fontWeight: 600, marginBottom: 8 }}>{needCheckCount} part{needCheckCount === 1 ? '' : 's'} need{needCheckCount === 1 ? 's' : ''} retail check</p>}
          </>
        )}
        {parts.length === 0 ? (
          <div className="empty"><p>No parts yet. Add parts to use them in service templates and filter orders.</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty"><p>No parts match these filters</p></div>
        ) : (
          <div className="tw">
          <table>
            <thead><tr><th>Part #</th><th>Description</th><th>Category</th><th>Cost</th><th>Retail</th><th>Margin at {stdDisc}%</th><th>Verified</th><th>No disc.</th><th>Active</th></tr></thead>
            <tbody>
              {filtered.map(p => {
                // No-discount parts sell at retail, so their margin is retail − cost
                const margin = round2(discountedPrice(p.retail_price, partDiscountPct(p, stdDisc)) - (Number(p.cost) || 0));
                return (
                <tr key={p.part_id} onClick={() => setModal({ t: 'editPart', d: p })} style={{ opacity: p.active === false ? 0.55 : 1 }}>
                  <td className="m" style={{ fontWeight: 700 }}>{p.part_number}</td>
                  <td>{p.description}{(p.manufacturer || p.no_discount) && <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{p.manufacturer}{p.no_discount && <span className="tag nodisc" style={{ marginLeft: 6 }}>No discount</span>}</div>}</td>
                  <td style={{ fontSize: 11, color: 'var(--tx2)' }}>{p.category}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <LocalNumberInput value={Number(p.cost) || 0} step="0.01" ariaLabel={`Cost for ${p.part_number}`} onCommit={v => commitPart(p, { cost: v })} style={cellInput} />
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <LocalNumberInput value={Number(p.retail_price) || 0} step="0.01" ariaLabel={`Retail for ${p.part_number}`} onCommit={v => commitPart(p, { retail_price: v })} style={cellInput} />
                  </td>
                  <td className="m" style={{ fontWeight: 600, color: margin < 0 ? 'var(--rd)' : 'var(--gn)' }}>{formatMoney(margin)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className={`vchk${p.retail_verified ? ' on' : ''}`} aria-pressed={!!p.retail_verified} aria-label={`Retail verified for ${p.part_number}`}
                      title={p.retail_verified ? 'Retail verified — click to un-check' : 'Click once you have confirmed the real retail price'}
                      onClick={() => commitPart(p, { retail_verified: !p.retail_verified })}>{p.retail_verified ? '✓' : ''}</button>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className={`vchk nd${p.no_discount ? ' on' : ''}`} aria-pressed={!!p.no_discount} aria-label={`No discount for ${p.part_number}`}
                      title={p.no_discount ? 'No discount — always sells at retail. Click to allow discounts.' : 'Click if this part can\'t be discounted (always sells at retail)'}
                      onClick={() => commitPart(p, { no_discount: !p.no_discount })}>{p.no_discount ? '✓' : ''}</button>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="batch-cb" checked={p.active !== false} aria-label={`Active ${p.part_number}`} onChange={e => commitPart(p, { active: e.target.checked })} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    );
  };

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

  const renderSettings = () => (<SettingsForm settings={company} onSaveAsync={async (s) => { await upsertCompany.mutateAsync(s); }} />);

  const renderAi = () => (
    <div className="aip" style={{ height: 'calc(100vh - 110px)' }}>
      <div className="aim">
        {aiMsgs.map((msg, i) => (
          <div key={i} className={`am ${msg.r === 'a' ? 'a' : 'u'}`}>
            <div className="sn">{msg.r === 'a' ? 'OilTrack AI' : 'You'}</div>
            <div className="bb" style={{ whiteSpace: 'pre-wrap' }}>{msg.t}</div>
          </div>
        ))}
        {aiLoad && (<div className="am a"><div className="sn">OilTrack AI</div><div className="bb" style={{ color: 'var(--tx3)' }}>Thinking...</div></div>)}
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
        <ModalShell title="Confirm Delete" onClose={() => setModal(null)}
          onSave={async () => { await modal.onConfirm(); setModal(null); }}
          saveLabel="Delete" danger>
          <p style={{ fontSize: 13, marginBottom: 8 }}>Are you sure you want to delete <strong>{modal.what}</strong>?</p>
          <p style={{ fontSize: 12, color: 'var(--rd)', fontWeight: 600 }}>This cannot be undone.</p>
        </ModalShell>
      );
    }

    if (modal.t === 'confirmAction') {
      return (
        <ModalShell title={modal.title} onClose={() => setModal(null)}
          onSave={async () => { await modal.onConfirm(); setModal(null); }}
          saveLabel={modal.label} danger>
          <p style={{ fontSize: 13 }}>{modal.message}</p>
        </ModalShell>
      );
    }

    if (modal.t === 'editInvoiceNumber') {
      return (
        <EditInvoiceNumberForm
          currentNumber={modal.wo.invoice_number}
          allWorkOrders={workOrders}
          currentWorkOrderId={modal.wo.work_order_id}
          otherUsedNumbers={filterOrders.map(o => o.invoice_number).filter((n): n is number => n != null)}
          onClose={() => setModal(null)}
          onSaveAsync={async (newNum) => {
            await updateWorkOrder.mutateAsync({ work_order_id: modal.wo.work_order_id, updates: { invoice_number: newNum } });
            showToast(`Invoice number changed to INV-${newNum}`);
            setModal(null);
          }}
        />
      );
    }

    if (modal.t === 'addCust' || modal.t === 'editCust') {
      return (<CustomerForm initial={modal.d || null} defaultDiscount={Number(company?.default_customer_discount_pct ?? 6)} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        if (modal.t === 'addCust') { await createCustomer.mutateAsync(form); showToast('Customer added'); }
        else { await updateCustomer.mutateAsync({ customer_id: (modal.d as Customer).customer_id, updates: form }); showToast('Customer updated'); }
        setModal(null);
      }} />);
    }
    if (modal.t === 'addUnit' || modal.t === 'editUnit') {
      const editingUnitId = (modal.d as FleetUnit | null)?.unit_id;
      const lastWO = editingUnitId ? workOrders
        .filter(w => w.unit_id === editingUnitId && w.status === 'complete' && w.completed_at)
        .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))[0] : null;
      const hoursLastUpdated = lastWO?.completed_at ? new Date(lastWO.completed_at).toLocaleDateString() : null;
      const unitCustomer = getCustomer(modal.customer_id || (modal.d as FleetUnit | null)?.customer_id || '');
      return (<UnitForm initial={modal.d || null} customer_id={modal.customer_id} engines={engines} hoursLastUpdated={hoursLastUpdated}
        defaultUse={unitCustomer?.customer_type === 'filter_only' ? 'filters' : 'service'} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        if (modal.t === 'addUnit') { await createUnit.mutateAsync(form); showToast('Equipment added'); }
        else { await updateUnit.mutateAsync({ unit_id: (modal.d as FleetUnit).unit_id, updates: form }); showToast('Equipment updated'); }
        setModal(null);
      }} />);
    }
    if (modal.t === 'addEngine' || modal.t === 'editEngine') {
      return (<EngineForm initial={modal.d || null} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        if (modal.t === 'addEngine') { await createEngine.mutateAsync(form); showToast('Engine added'); }
        else { await updateEngine.mutateAsync({ engine_id: (modal.d as Engine).engine_id, updates: form }); showToast('Engine updated'); }
        setModal(null);
      }} />);
    }
    if (modal.t === 'addPart' || modal.t === 'editPart') {
      return (<PartForm initial={modal.d || null} standardDiscount={Number(company?.default_customer_discount_pct ?? 6)} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        if (modal.t === 'addPart') { await createPart.mutateAsync(form); showToast('Part added'); }
        else { await updatePart.mutateAsync({ part_id: (modal.d as Part).part_id, updates: form }); showToast('Part updated'); }
        setModal(null);
      }} />);
    }
    if (modal.t === 'addTemplate' || modal.t === 'editTemplate') {
      const target_unit_id = modal.t === 'addTemplate' ? modal.unit_id! : (modal.d as ServiceTemplate).unit_id;
      return (<ServiceTemplateForm initial={modal.d || null} unit_id={target_unit_id} parts={parts} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        if (modal.t === 'addTemplate') { await createTemplate.mutateAsync(form); showToast('Template added'); }
        else { await updateTemplate.mutateAsync({ template_id: (modal.d as ServiceTemplate).template_id, updates: form }); showToast('Template updated'); }
        setModal(null);
      }} />);
    }
    if (modal.t === 'copyTemplate') {
      return (<CopyTemplateForm unit_id={modal.unit_id} units={units} customers={customers} templates={templates} onClose={() => setModal(null)} onSaveAsync={async (form) => {
        await createTemplate.mutateAsync(form); showToast('Template copied'); setModal(null);
      }} />);
    }
    if (modal.t === 'addInventory') {
      // Pick which part from the catalog to start tracking
      const trackedIds = new Set(inventory.map(i => i.part_id));
      const untracked = parts.filter(p => !trackedIds.has(p.part_id));
      const q = invPickerSearch.trim().toLowerCase();
      const list = q ? untracked.filter(p =>
        (p.part_number || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.manufacturer || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      ) : untracked;

      const addPart = async (part: Part) => {
        try {
          await createInventoryItem.mutateAsync({ part_id: part.part_id, quantity_on_hand: 0, reorder_point: null, notes: '' });
          showToast(`${part.part_number} added to inventory`);
          setInvPickerSearch('');
        } catch (err: any) {
          showToast(`Failed: ${err?.message || 'Unknown error'}`, true);
        }
      };

      return (
        <div className="mbg">
          <div className="mdl">
            <div className="mh">
              <h3>Add Part to Inventory</h3>
              <button className="btn bs bg" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="mb2">
              <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
                Pick a part from your catalog to start tracking inventory for it. Starts with 0 on hand — set the quantity after adding.
              </p>
              <input
                type="text"
                value={invPickerSearch}
                onChange={e => setInvPickerSearch(e.target.value)}
                placeholder="Search parts catalog..."
                autoFocus
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: "'Outfit',sans-serif", outline: 'none', marginBottom: 10 }}
              />
              {untracked.length === 0 ? (
                <div className="empty"><p>Every catalog part is already being tracked. Add more parts to the Parts Catalog first.</p></div>
              ) : list.length === 0 ? (
                <div className="empty"><p>No untracked parts match "{invPickerSearch}"</p></div>
              ) : (
                <div className="inv-add-list">
                  {list.map(p => (
                    <div key={p.part_id} className="row" onClick={() => addPart(p)}>
                      <span className="pn">{p.part_number}</span>
                      <span className="desc">{p.description} — {p.manufacturer}</span>
                      <span className="tag tb">{p.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mf">
              <button className="btn" onClick={() => setModal(null)}>Done</button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const menu = [
    { id: 'dashboard', l: 'Dashboard', ic: iHome },
    { id: 'followups', l: 'Follow-ups', ic: ICONS.bell, ct: followUpBadge || undefined, alert: followUpBadge > 0 },
    { id: 'customers', l: 'Customers', ic: iUsers, ct: customers.length },
    { id: 'filterorders', l: 'Filter Orders', ic: ICONS.filter, ct: filterOrders.filter(o => o.status === 'requested').length || undefined },
    { id: 'supplierlist', l: 'Supplier List', ic: ICONS.list },
    { id: 'parts', l: 'Parts & Filters', ic: iBox, ct: parts.length },
    { id: 'inventory', l: 'Inventory', ic: iInv, ct: inventory.length || undefined },
    { id: 'engines', l: 'Engines', ic: iEngine, ct: engines.length },
    { id: 'workorders', l: 'Work Orders', ic: iClip, ct: workOrders.filter(w => w.status === 'open').length || undefined },
    { id: 'billing', l: 'Billing', ic: iBill, ct: (workOrders.filter(w => w.status === 'complete' && !(w as any).billed).length + filterOrders.filter(o => ['delivered', 'paid'].includes(o.status) && !o.billed).length) || undefined },
    { id: 'oilslips', l: 'Oil Slips', ic: iDrop, ct: workOrders.filter(w => needsOilSlip(w) && !(w as any).oil_slip_printed).length || undefined },
    { id: 'history', l: 'Service History', ic: iHist },
    { id: 'ai', l: 'AI Assistant', ic: iChat },
    { id: 'settings', l: 'Settings', ic: iGear },
  ];

  const active = ['cust', 'unit'].includes(pg) ? 'customers' : pg === 'wo' ? 'workorders' : pg === 'forder' ? 'filterorders' : pg;
  const title =
    pg === 'cust' ? trail[trail.length - 1]?.lbl || 'Customer' :
    pg === 'unit' ? trail[trail.length - 1]?.lbl || 'Unit' :
    pg === 'wo' ? trail[trail.length - 1]?.lbl || 'Work Order' :
    pg === 'forder' ? `Filter Order ${trail[trail.length - 1]?.lbl || ''}` :
    menu.find(m => m.id === pg)?.l || 'Dashboard';

  const crumbs = trail.length > 0 && (
    <div className="crumbs">
      <span onClick={() => { setTrail([]); setPg(active); }}>{menu.find(m => m.id === active)?.l || 'Home'}</span>
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
    billing: renderBilling, oilslips: renderOilSlipsPage, inventory: renderInventory,
    followups: () => <FollowUpsPage nav={nav} toast={showToast} />,
    filterorders: () => <FilterOrdersPage nav={nav} toast={showToast} />,
    forder: () => <FilterOrderDetail key={curId || ''} orderId={curId || ''} nav={nav} back={back} toast={showToast} confirm={confirmAction} />,
    supplierlist: () => <SupplierListPage nav={nav} toast={showToast} />,
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {navOpen && <div className="sb-bg no-print" onClick={() => setNavOpen(false)} />}
        <div className={`sb no-print${navOpen ? ' open' : ''}`}>
          <div className="sb-hd"><h1>OilTrack Pro</h1><p>Complete Fleet Solutions</p></div>
          <nav className="sb-nav">
            {menu.map(m => (
              <div key={m.id} className={`si${active === m.id ? ' on' : ''}`} onClick={() => { setPg(m.id); setTrail([]); setNavOpen(false); }}>
                {IC(m.ic)}{m.l}{m.ct != null && <span className={`ct${(m as any).alert ? ' alert' : ''}`}>{m.ct}</span>}
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            <div style={{ marginBottom: 4 }}>{user.email}</div>
            <button onClick={handleSignOut}>{IC(iOut, 12)} Sign out</button>
          </div>
        </div>
        <div className="mn">
          <div className="topbar no-print">
            <button className="btn bs bg menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>{IC('M3 12h18 M3 6h18 M3 18h18', 18)}</button>
            {trail.length > 0 && <button className="btn bs bg" aria-label="Back" onClick={back}>{IC(iBack, 16)}</button>}
            <h2>{title}</h2>
          </div>
          <div className="area">{crumbs}{(pages[pg] || renderDashboard)()}</div>
        </div>
        {renderModal()}
        {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
      </div>
      {showOilSlips && (
        <div className="oil-slips-print">
          <div className="oil-slips-actions">
            <button className="btn bp" onClick={() => window.print()}>{IC(iPrint, 15)} Print Again</button>
            <button className="btn" onClick={async () => { await markSlipsPrinted(selectedOilSlips, true); setSelectedOilSlips([]); setShowOilSlips(false); }}>{IC(iChk, 15)} Mark Printed & Close</button>
            <button className="btn bg" onClick={() => setShowOilSlips(false)}>Close</button>
          </div>
          {workOrders.filter(w => selectedOilSlips.includes(w.work_order_id)).map(renderOilSlip)}
        </div>
      )}
    </>
  );
}
