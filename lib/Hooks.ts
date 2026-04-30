'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from './supabase';
import type {
  Customer,
  Part,
  Engine,
  FleetUnit,
  EngineServiceSpec,
  UnitServiceOverride,
  WorkOrder,
  CompanySettings,
} from '@/types/database';

// =============================================
// SERVICE TEMPLATE TYPE (per-unit)
// =============================================
export interface ServiceTemplate {
  template_id: string;
  user_id: string;
  unit_id: string;
  name: string;
  labor: number;
  parts_list: { part_number: string; qty: number }[];
  tasks: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

// =============================================
// COMPANY SETTINGS
// =============================================
export function useCompanySettings() {
  return useQuery({
    queryKey: ['company_settings'],
    queryFn: async (): Promise<CompanySettings | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('company_settings').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<CompanySettings>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('company_settings').upsert({ ...settings, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company_settings'] }),
  });
}

// =============================================
// CUSTOMERS
// =============================================
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async (): Promise<Customer[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: Partial<Customer>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('customers').insert({ ...customer, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customer_id, updates }: { customer_id: string; updates: Partial<Customer> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('customers').update(updates).eq('customer_id', customer_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('customers').delete().eq('customer_id', customer_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// =============================================
// PARTS CATALOG
// =============================================
export function useParts() {
  return useQuery({
    queryKey: ['parts'],
    queryFn: async (): Promise<Part[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('parts_catalog').select('*').order('part_number');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (part: Partial<Part>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('parts_catalog').insert({ ...part, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useUpdatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ part_id, updates }: { part_id: string; updates: Partial<Part> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('parts_catalog').update(updates).eq('part_id', part_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useDeletePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (part_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('parts_catalog').delete().eq('part_id', part_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

// =============================================
// ENGINES
// =============================================
export function useEngines() {
  return useQuery({
    queryKey: ['engines'],
    queryFn: async (): Promise<Engine[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('engines').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (engine: Partial<Engine>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('engines').insert({ ...engine, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engines'] }),
  });
}

export function useUpdateEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ engine_id, updates }: { engine_id: string; updates: Partial<Engine> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('engines').update(updates).eq('engine_id', engine_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engines'] }),
  });
}

export function useDeleteEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (engine_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('engines').delete().eq('engine_id', engine_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engines'] }),
  });
}

// =============================================
// FLEET UNITS
// =============================================
export function useFleetUnits() {
  return useQuery({
    queryKey: ['fleet_units'],
    queryFn: async (): Promise<FleetUnit[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('fleet_units').select('*').order('unit_number');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateFleetUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unit: Partial<FleetUnit>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('fleet_units').insert({ ...unit, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet_units'] }),
  });
}

export function useUpdateFleetUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ unit_id, updates }: { unit_id: string; updates: Partial<FleetUnit> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('fleet_units').update(updates).eq('unit_id', unit_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet_units'] }),
  });
}

export function useDeleteFleetUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unit_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('fleet_units').delete().eq('unit_id', unit_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet_units'] }),
  });
}

// =============================================
// SERVICE TEMPLATES (per-unit)
// =============================================
export function useServiceTemplates() {
  return useQuery({
    queryKey: ['service_templates'],
    queryFn: async (): Promise<ServiceTemplate[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('service_templates').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<ServiceTemplate>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('service_templates').insert({ ...template, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_templates'] }),
  });
}

export function useUpdateServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ template_id, updates }: { template_id: string; updates: Partial<ServiceTemplate> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('service_templates').update(updates).eq('template_id', template_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_templates'] }),
  });
}

export function useDeleteServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('service_templates').delete().eq('template_id', template_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_templates'] }),
  });
}

// =============================================
// LEGACY (kept so old code still compiles, no longer used)
// =============================================
export function useEngineServiceSpecs() {
  return useQuery({
    queryKey: ['engine_service_specs'],
    queryFn: async (): Promise<EngineServiceSpec[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('engine_service_specs').select('*');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpsertEngineServiceSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (spec: Partial<EngineServiceSpec>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('engine_service_specs').upsert({ ...spec, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['engine_service_specs'] }),
  });
}

export function useUnitServiceOverrides() {
  return useQuery({
    queryKey: ['unit_service_overrides'],
    queryFn: async (): Promise<UnitServiceOverride[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('unit_service_overrides').select('*');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpsertUnitServiceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (override: Partial<UnitServiceOverride>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('unit_service_overrides').upsert({ ...override, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit_service_overrides'] }),
  });
}

// =============================================
// WORK ORDERS
// =============================================
export function useWorkOrders() {
  return useQuery({
    queryKey: ['work_orders'],
    queryFn: async (): Promise<WorkOrder[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from('work_orders').select('*').order('service_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wo: Partial<WorkOrder>) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('work_orders').insert({ ...wo, user_id: userData.user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work_orders'] }),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ work_order_id, updates }: { work_order_id: string; updates: Partial<WorkOrder> }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from('work_orders').update(updates).eq('work_order_id', work_order_id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work_orders'] }),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (work_order_id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('work_orders').delete().eq('work_order_id', work_order_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work_orders'] }),
  });
}
