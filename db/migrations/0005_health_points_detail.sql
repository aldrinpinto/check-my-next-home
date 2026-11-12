-- Migration 0005 — health points: branch parent link, the
-- emergency-department flag, and hospital detail
-- (plan step M4.7; added after the user-seat gap check of
-- 12 Nov 2026).
--
-- parent_ods_code: branch surgeries are filed as points in their
-- own right (the user confirmed branches are in, 12 Nov 2026);
-- this is the register's own parent-practice code, so a branch
-- always names the practice a patient registers with.
--
-- has_emergency_department is deliberately THREE-state. TRUE
-- means the CQC ratings file carries an "Urgent and emergency
-- services" row for the location; FALSE means the location is
-- rated, its services are known, and no such row exists; NULL
-- means the data says nothing (the location has no ratings rows
-- at all) and must never be presented as "no A&E".
--
-- cqc_service_types and provider_name (hospital points only):
-- the CQC directory's "Hospital" set is not a list of acute
-- hospitals — it includes community hospitals, private hospitals
-- and other providers — so the filed types and provider are what
-- let the product label them honestly.

ALTER TABLE health_points
  ADD COLUMN parent_ods_code text,
  ADD COLUMN has_emergency_department boolean,
  ADD COLUMN cqc_service_types text,
  ADD COLUMN provider_name text;
