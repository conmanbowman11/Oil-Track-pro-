-- =============================================
-- OilTrack Pro Seed Data
-- Run this AFTER schema.sql in Supabase SQL Editor
-- Replace YOUR_USER_ID with your actual auth user ID
-- (you can find it in Supabase > Authentication > Users)
-- =============================================

-- First, set your user ID variable
-- After you sign up, go to Supabase > Authentication > Users
-- Copy your User UID and paste it below
DO $$
DECLARE
  uid uuid := 'YOUR_USER_ID_HERE'; -- <-- REPLACE THIS
  c1 uuid;
  e1 uuid; e2 uuid; e3 uuid;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid; u6 uuid;
  s1 uuid; s2 uuid; s3 uuid;
BEGIN

-- ── Customers ──
INSERT INTO customers (id, user_id, name, notes) VALUES
  (gen_random_uuid(), uid, 'IronTree Solutions, LLC', 'Fleet units I-1 through I-27. Mix of tub trucks (Cat 4.4) and harvesters (Cat 7.1). Some JD units.')
  RETURNING id INTO c1;

-- ── Engines ──
INSERT INTO engines (id, user_id, name, manufacturer, displacement, oil_type, oil_capacity) VALUES
  (gen_random_uuid(), uid, 'Cat 4.4', 'Caterpillar', '4.4L', '15W-40', '3 gal')
  RETURNING id INTO e1;
INSERT INTO engines (id, user_id, name, manufacturer, displacement, oil_type, oil_capacity) VALUES
  (gen_random_uuid(), uid, 'Cat 7.1', 'Caterpillar', '7.1L', '15W-40', '4 gal')
  RETURNING id INTO e2;
INSERT INTO engines (id, user_id, name, manufacturer, displacement, oil_type, oil_capacity) VALUES
  (gen_random_uuid(), uid, 'JD PowerTech 6068', 'John Deere', '6.8L', '15W-40', '5 gal')
  RETURNING id INTO e3;

-- ── Fleet Units ──
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make) VALUES
  (gen_random_uuid(), uid, c1, e1, 'I-1', 'Tub Truck', 'Tub Truck', 'CAT') RETURNING id INTO u1;
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make) VALUES
  (gen_random_uuid(), uid, c1, e1, 'I-2', 'Tub Truck', 'Tub Truck', 'CAT') RETURNING id INTO u2;
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make) VALUES
  (gen_random_uuid(), uid, c1, e1, 'I-3', 'Tub Truck', 'Tub Truck', 'CAT') RETURNING id INTO u3;
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make) VALUES
  (gen_random_uuid(), uid, c1, e2, 'ITH', 'IronTree Harvester', 'Harvester', 'CAT') RETURNING id INTO u4;
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make) VALUES
  (gen_random_uuid(), uid, c1, e2, 'CTM', 'CTM Harvester', 'Harvester', 'CAT') RETURNING id INTO u5;
INSERT INTO fleet_units (id, user_id, customer_id, engine_id, unit_number, nickname, type, make, model) VALUES
  (gen_random_uuid(), uid, c1, e3, 'JD-1', 'JD 7810', 'Tractor', 'John Deere', '7810') RETURNING id INTO u6;

-- ── Service Specs: Cat 4.4 500hr ──
INSERT INTO service_specs (id, user_id, engine_id, tier) VALUES
  (gen_random_uuid(), uid, e1, '500hr') RETURNING id INTO s1;
INSERT INTO spec_parts (spec_id, part_number, description, supplier, qty, unit_cost, sort_order) VALUES
  (s1, '7W-2326', 'Oil Filter', 'CAT', 1, 22.14, 1),
  (s1, '479-4133', 'Water / Fuel Separator', 'CAT', 1, 53.76, 2),
  (s1, '360-8960', 'Fuel Filter', 'CAT', 1, 37.21, 3),
  (s1, '206-5234', 'Air Filter', 'CAT', 1, 69.64, 4),
  (s1, '339-1048', 'Crankcase Filter', 'CAT', 1, 73.86, 5);

-- ── Service Specs: Cat 7.1 500hr ──
INSERT INTO service_specs (id, user_id, engine_id, tier) VALUES
  (gen_random_uuid(), uid, e2, '500hr') RETURNING id INTO s2;
INSERT INTO spec_parts (spec_id, part_number, description, supplier, qty, unit_cost, sort_order) VALUES
  (s2, '462-1171', 'Oil Filter', 'CAT', 1, 26.17, 1),
  (s2, '479-4131', 'Water / Fuel Separator', 'CAT', 1, 56.57, 2),
  (s2, '360-8960', 'Fuel Filter', 'CAT', 1, 37.21, 3),
  (s2, '525-6205', 'In-line Fuel Filter', 'CAT', 1, 58.29, 4),
  (s2, '289-2348', 'Air Filter', 'CAT', 1, 137.74, 5),
  (s2, '339-1048', 'Crankcase Filter', 'CAT', 1, 73.86, 6);

-- ── Service Specs: JD PowerTech 500hr (no parts - customer provides) ──
INSERT INTO service_specs (id, user_id, engine_id, tier) VALUES
  (gen_random_uuid(), uid, e3, '500hr') RETURNING id INTO s3;

END $$;
