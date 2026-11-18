'use client';

// Data hooks for Filter Sales + Customer Tracking (migration 001).
// Same pattern as lib/hooks.ts: React Query + Supabase, scoped by RLS.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from './supabase';
import type {
  CustomerContact,
  CustomerActivity,
  FollowUp,
  FilterOrder,
  FilterOrderItem,
  EquipmentFilter,
} from '@/types/database';

async function currentUserId(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

// Builds list/create/update/delete hooks for one table.
function tableHooks<T>(table: string, idCol: string, orderCol: string, ascending = true, extraInvalidate: string[] = []) {
  const key = [table];
  const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: key });
    extraInvalidate.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };

  const useList = () =>
    useQuery({
      queryKey: key,
      queryFn: async (): Promise<T[]> => {
        const supabase = createClient();
        const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending });
        if (error) throw error;
        return (data || []) as T[];
      },
    });

  const useCreate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (row: Partial<T>): Promise<T> => {
        const supabase = createClient();
        const user_id = await currentUserId();
        const { data, error } = await supabase.from(table).insert({ ...row, user_id }).select().single();
        if (error) throw error;
        return data as T;
      },
      onSuccess: () => invalidate(qc),
    });
  };

  const useCreateMany = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (rows: Partial<T>[]): Promise<T[]> => {
        if (!rows.length) return [];
        const supabase = createClient();
        const user_id = await currentUserId();
        const { data, error } = await supabase.from(table).insert(rows.map(r => ({ ...r, user_id }))).select();
        if (error) throw error;
        return (data || []) as T[];
      },
      onSuccess: () => invalidate(qc),
    });
  };

  const useUpdate = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, updates }: { id: string; updates: Partial<T> }): Promise<T> => {
        const supabase: any = createClient();
        const { data, error } = await supabase.from(table).update(updates).eq(idCol, id).select().single();
        if (error) throw error;
        return data as T;
      },
      onSuccess: () => invalidate(qc),
    });
  };

  const useUpdateMany = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({ ids, updates }: { ids: string[]; updates: Partial<T> }) => {
        if (!ids.length) return;
        const supabase: any = createClient();
        const { error } = await supabase.from(table).update(updates).in(idCol, ids);
        if (error) throw error;
      },
      onSuccess: () => invalidate(qc),
    });
  };

  const useDelete = () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const supabase = createClient();
        const { error } = await supabase.from(table).delete().eq(idCol, id);
        if (error) throw error;
      },
      onSuccess: () => invalidate(qc),
    });
  };

  return { useList, useCreate, useCreateMany, useUpdate, useUpdateMany, useDelete };
}

export const contactsApi = tableHooks<CustomerContact>('customer_contacts', 'contact_id', 'name');
export const activitiesApi = tableHooks<CustomerActivity>('customer_activities', 'activity_id', 'occurred_at', false);
export const followUpsApi = tableHooks<FollowUp>('follow_ups', 'follow_up_id', 'due_date');
export const filterOrdersApi = tableHooks<FilterOrder>('filter_orders', 'filter_order_id', 'order_number', false);
export const filterOrderItemsApi = tableHooks<FilterOrderItem>('filter_order_items', 'item_id', 'sort_order', true, ['filter_orders']);
export const equipmentFiltersApi = tableHooks<EquipmentFilter>('equipment_filters', 'equipment_filter_id', 'created_at');

// Make one contact the primary for its customer (clears the old primary first,
// because the database allows only one primary per customer).
export function useSetPrimaryContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customer_id, contact_id }: { customer_id: string; contact_id: string }) => {
      const supabase = createClient();
      const { error: e1 } = await supabase.from('customer_contacts').update({ is_primary: false }).eq('customer_id', customer_id).eq('is_primary', true);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('customer_contacts').update({ is_primary: true }).eq('contact_id', contact_id);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer_contacts'] }),
  });
}
