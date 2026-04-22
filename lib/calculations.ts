import type {
  ServicePartSnapshot,
  OilUsedSnapshot,
  WorkOrderFees,
} from '@/types/database';

// ─── Money rounding (avoid floating-point weirdness) ───
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Calculate work order totals ───
// Tax applies ONLY to parts + oil (per CA farm tax rules).
// Labor, travel, env fee, supplies are NOT taxed.
export interface WorkOrderTotals {
  subtotal_parts_oil: number;
  subtotal_fees: number;
  tax_amount: number;
  total_retail: number;
  total_cost: number;
  profit: number;
  profit_margin_percent: number | null;
}

export function calculateWorkOrderTotals(args: {
  parts: ServicePartSnapshot[];
  oil: OilUsedSnapshot | null;
  fees: WorkOrderFees;
  tax_rate_percent: number;
}): WorkOrderTotals {
  const { parts, oil, fees, tax_rate_percent } = args;

  // Taxable portion: parts + oil
  const parts_retail = parts.reduce((sum, p) => sum + p.line_total_retail, 0);
  const parts_cost = parts.reduce((sum, p) => sum + p.line_total_cost, 0);
  const oil_retail = oil?.total_retail ?? 0;
  const oil_cost = oil?.total_cost ?? 0;
  const subtotal_parts_oil = round2(parts_retail + oil_retail);

  // Non-taxable: labor, travel, env fee, supplies, oil sample, other
  const subtotal_fees = round2(
    fees.labor +
      fees.environmental_fee +
      fees.travel_charge +
      fees.service_supplies +
      fees.oil_sample_fee +
      fees.other
  );

  // Tax on parts + oil only
  const tax_amount = round2(subtotal_parts_oil * (tax_rate_percent / 100));

  const total_retail = round2(subtotal_parts_oil + subtotal_fees + tax_amount);
  const total_cost = round2(parts_cost + oil_cost);
  const profit = round2(total_retail - total_cost);
  const profit_margin_percent =
    total_cost > 0 ? round2((profit / total_cost) * 100) : null;

  return {
    subtotal_parts_oil,
    subtotal_fees,
    tax_amount,
    total_retail,
    total_cost,
    profit,
    profit_margin_percent,
  };
}

// ─── Line total recalculation for a single part ───
export function recalculatePartLine(
  part: ServicePartSnapshot
): ServicePartSnapshot {
  return {
    ...part,
    line_total_retail: round2(part.retail_price * part.qty),
    line_total_cost: round2(part.cost * part.qty),
  };
}

// ─── Oil total recalculation ───
export function recalculateOilTotals(oil: OilUsedSnapshot): OilUsedSnapshot {
  return {
    ...oil,
    total_retail: round2(oil.retail_per_gallon * oil.gallons),
    total_cost: round2(oil.cost_per_gallon * oil.gallons),
  };
}

// ─── Format money for display ───
export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ─── Format invoice number ───
export function formatInvoiceNumber(n: number): string {
  return `INV-${n}`;
}
