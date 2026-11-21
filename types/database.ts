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
  next_invoice_number: number;
  // Filter sales (migration 001)
  default_filter_markup_pct: number; // no longer used (kept in the database)
  default_customer_discount_pct: number;
  filter_tax_rate_percent: number;
  supplier_name: string;
  supplier_contact_name: string;
  supplier_phone: string;
  supplier_email: string;
  supplier_account_number: string;
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

export type CustomerType = 'service' | 'filter_only' | 'both';
export type CustomerStatus = 'active' | 'inactive';

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
  part_price_overrides: Record<string, PartPriceOverride>; // no longer used (kept in the database)
  customer_type: CustomerType;
  discount_pct: number; // % off retail on every catalog part
  status: CustomerStatus;
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
  | 'Lab/Testing'
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
  markup_pct: number | null; // no longer used (kept in the database)
  active: boolean;
  retail_verified: boolean; // real retail price confirmed
  no_discount: boolean; // always sell at full retail (e.g. John Deere)
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
  // 'service' = oil change equipment (engine, hours, templates); 'filters' = filters only (name + serial)
  equipment_use: 'service' | 'filters';
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
  // Discount pricing (missing on lines saved before it existed)
  discount_pct?: number;
  sell_price?: number;
  price_overridden?: boolean;
  no_discount?: boolean; // part was marked "No discount" when the line was added
  // Amount charged for the line (sell price × qty; retail × qty on old lines)
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
  // Nullable now — only assigned at bill-time
  invoice_number: number | null;
  status: WorkOrderStatus;
  tier: string;
  service_date: string;
  engine_hours: number;
  technician: string;
  customer_provided_filters: boolean;
  customer_provided_oil: boolean;
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
  // Bill-time / inventory / oil-slip tracking
  billed: boolean;
  billed_at: string | null;
  inventory_deducted: boolean;
  oil_slip_printed: boolean;
  oil_slip_printed_at: string | null;
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

// ─── Inventory ──────────────────────────────────
export interface InventoryItem {
  inventory_id: string;
  user_id: string;
  part_id: string;
  quantity_on_hand: number;
  reorder_point: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

// =============================================
// Filter Sales + Customer Tracking (migration 001)
// =============================================

export interface CustomerContact {
  contact_id: string;
  user_id: string;
  customer_id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  is_primary: boolean;
  notes: string;
  created_at: string;
}

export type ActivityType = 'note' | 'call' | 'visit' | 'text' | 'email';

export interface CustomerActivity {
  activity_id: string;
  user_id: string;
  customer_id: string;
  contact_id: string | null;
  type: ActivityType;
  body: string;
  occurred_at: string;
  created_at: string;
}

export type FollowUpStatus = 'open' | 'done';

export interface FollowUp {
  follow_up_id: string;
  user_id: string;
  customer_id: string;
  contact_id: string | null;
  title: string;
  notes: string;
  due_date: string; // YYYY-MM-DD
  status: FollowUpStatus;
  completed_at: string | null;
  related_filter_order_id: string | null;
  created_at: string;
}

export type FilterOrderStatus = 'requested' | 'ordered' | 'received' | 'delivered' | 'paid' | 'cancelled';

export interface FilterOrder {
  filter_order_id: string;
  user_id: string;
  order_number: number;
  customer_id: string;
  contact_id: string | null;
  status: FilterOrderStatus;
  requested_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  supplier_ref: string;
  notes: string;
  tax_rate_percent: number;
  invoice_number: number | null;
  billed: boolean;
  billed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilterOrderItem {
  item_id: string;
  user_id: string;
  filter_order_id: string;
  part_id: string | null;
  part_number: string;
  description: string;
  brand: string;
  unit_id: string | null;
  quantity: number;
  unit_cost: number;
  unit_price: number; // sell price charged
  retail_price: number; // 0 on lines saved before discount pricing
  discount_pct: number;
  price_overridden: boolean;
  sort_order: number;
  created_at: string;
}

export interface EquipmentFilter {
  equipment_filter_id: string;
  user_id: string;
  unit_id: string;
  part_id: string;
  quantity_per_change: number;
  notes: string;
  created_at: string;
}
