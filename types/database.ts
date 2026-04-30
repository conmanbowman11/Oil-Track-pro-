// =============================================
// OilTrack Pro — Database Type Definitions
// These match the Supabase schema exactly.
// =============================================

// ─── Company Settings ───────────────────────────
export interface CompanySettings {
  settings_id: string;
  user_id: string;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  logo_url: string;
  payment_terms: string;
  tax_rate_percent: number;
  invoice_footer_notes: string;
  created_at: string;
  updated_at: string;
}

// ─── Customers ──────────────────────────────────
export interface CustomerDefaultFees {
  labor_rate: number;
  environmental_fee: number;
  travel_charge: number;
  service_supplies: number;
  oil_sample_fee: number;
  oil_retail_per_gallon: number;
  oil_cost_per_gallon: number;
}

export interface PartPriceOverride {
  retail: number;
  cost: number;
}

export interface Customer {
  customer_id: string;
  user_id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  billing_address: string;
  notes: string;
  default_fees: CustomerDefaultFees;
  part_price_overrides: Record<string, PartPriceOverride>;
  created_at: string;
  updated_at: string;
}

// ─── Parts Catalog ──────────────────────────────
export type PartCategory =
  | 'Fuel System'
  | 'Air Filter'
  | 'Oil Filter'
  | 'Hydraulic'
  | 'Transmission'
  | 'DEF'
  | 'Coolant'
  | 'Other';

export interface Part {
  part_id: string;
  user_id: string;
  part_number: string;
  description: string;
  manufacturer: string;
  category: string;
  retail_price: number;
  cost: number;
  supplier: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ─── Engines ────────────────────────────────────
export interface Engine {
  engine_id: string;
  user_id: string;
  name: string;
  manufacturer: string;
  displacement: string;
  oil_type: string;
  oil_capacity_gallons: number;
  notes: string;
  created_at: string;
}

// ─── Fleet Units ────────────────────────────────
export interface FleetUnit {
  unit_id: string;
  user_id: string;
  customer_id: string;
  engine_id: string | null;
  unit_number: string;
  nickname: string;
  type: string;
  make: string;
  model: string;
  year: string;
  serial_number: string;
  current_hours: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ─── Service Templates (Engine-level and Unit-level) ───
export interface TemplatePartReference {
  part_number: string;
  qty: number;
}

export interface EngineServiceSpec {
  spec_id: string;
  user_id: string;
  engine_id: string;
  tier: string;
  labor_override: number | null;
  tasks: string[];
  parts_list: TemplatePartReference[];
  created_at: string;
  updated_at: string;
}

export interface UnitServiceOverride {
  override_id: string;
  user_id: string;
  unit_id: string;
  tier: string;
  labor_override: number | null;
  tasks: string[];
  parts_list: TemplatePartReference[];
  created_at: string;
  updated_at: string;
}

// ─── Work Orders ────────────────────────────────
export interface ServicePartSnapshot {
  part_number: string;
  description: string;
  manufacturer: string;
  supplier: string;
  qty: number;
  retail_price: number;
  cost: number;
  line_total_retail: number;
  line_total_cost: number;
}

export interface OilUsedSnapshot {
  type: string;
  gallons: number;
  retail_per_gallon: number;
  cost_per_gallon: number;
  total_retail: number;
  total_cost: number;
}

export interface WorkOrderFees {
  labor: number;
  environmental_fee: number;
  travel_charge: number;
  service_supplies: number;
  oil_sample_fee: number;
  other: number;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export type WorkOrderStatus = 'open' | 'complete';

export interface WorkOrder {
  work_order_id: string;
  user_id: string;
  customer_id: string;
  unit_id: string;
  service_template_id: string | null;
  invoice_number: number;
  status: WorkOrderStatus;
  tier: string;
  service_date: string;
  engine_hours: number;
  technician: string;
  customer_provided_filters: boolean;
  notes: string;
  parts_used: ServicePartSnapshot[];
  oil_used: OilUsedSnapshot | null;
  fees: WorkOrderFees;
  subtotal_parts_oil: number;
  subtotal_fees: number;
  tax_rate_percent: number;
  tax_amount: number;
  total_retail: number;
  total_cost: number;
  profit: number;
  profit_margin_percent: number | null;
  work_order_pdf_url: string | null;
  invoice_pdf_url: string | null;
  checklist: ChecklistItem[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ─── Drafts ─────────────────────────────────────
export interface WorkOrderDraft {
  draft_id: string;
  user_id: string;
  unit_id: string;
  draft_data: Partial<WorkOrder>;
  updated_at: string;
}
