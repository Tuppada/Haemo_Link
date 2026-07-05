# DataVista 2026 Submission Checklist (HaemoLink)

## 1) Database Design

- [ ] ER diagram included (entities, relationships, constraints)
- [ ] PK/FK shown clearly
- [ ] Normalization explained up to 3NF
- [ ] SQL table creation scripts included (`schema.sql`)

## 2) Basic DBMS Concepts

- [x] Primary Key
- [x] Foreign Key
- [x] Referential Integrity
- [x] Constraints (NOT NULL, UNIQUE, defaults, FK references)
- [ ] Indexing section added in report (optional, but recommended)
- [x] Transactions used (Spring `@Transactional`)
- [ ] Canned transactions explicitly documented and demoed

## 3) Advanced DBMS Features (Mandatory)

- [x] Trigger implemented
  - File: `datavista-postgres-features.sql`
  - Trigger: `trg_inventory_status_change`
- [x] Stored procedures (at least 2)
  - `sp_mark_expired_inventory`
  - `sp_submit_blood_request`
- [x] Cursor implemented
  - `sp_log_hospital_stock_snapshot` (cursor over hospitals)

## 4) Frontend Requirements

- [x] Data Input forms
- [x] Data Retrieval tables/views
- [x] Update operations
- [x] Delete operation(s) (example: appointment cancel)
- [x] Usable UI with backend integration

## 5) Deliverables to Prepare Before Submission

- [ ] Project report PDF with:
  - Objective/problem statement
  - ERD + schema + relationships
  - Trigger/procedure/cursor explanation
  - Transaction/canned transaction explanation
  - Frontend-backend interaction
  - Testing with sample input/output
- [ ] SQL scripts bundle:
  - `src/main/resources/schema.sql`
  - `src/main/resources/data.sql`
  - `datavista-compliance/datavista-postgres-features.sql`
- [ ] Source code bundle (backend + frontend + README)
- [ ] Demo script (15-20 minutes)

## Quick Demo Flow (Suggested)

1. Show login and role-based modules.
2. Add inventory and submit blood request from frontend.
3. Run `CALL sp_mark_expired_inventory();`.
4. Update an inventory status and show trigger log in `inventory_audit`.
5. Run `CALL sp_log_hospital_stock_snapshot();` and show cursor-generated logs.
6. Show canned transaction block and explain rollback behavior.

## Notes

- For PostgreSQL UUID function used in the script, ensure extension:
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
