# DataVista 2026 Compliance Pack

This folder closes the DBMS gaps from the DataVista 2026 mini-project rubric.

## What is included

1. `datavista-postgres-features.sql`
- Trigger
- 2 Stored Procedures
- Cursor-based routine
- Transaction demo (canned transaction pattern)

2. `DATAVISTA_SUBMISSION_CHECKLIST.md`
- Requirement-by-requirement checklist
- What to present in demo/report

## How to run (PostgreSQL)

1. Start PostgreSQL and create DB `hemolink`.
2. Run your base schema/data first:
- `src/main/resources/schema.sql`
- `src/main/resources/data.sql` (adjust H2-specific functions if needed)
3. Run:
- `datavista-compliance/datavista-postgres-features.sql`

## Why PostgreSQL

Your app already includes PostgreSQL support (`application-postgres.properties`), and DataVista requires demonstrating DB-level advanced features (trigger/procedure/cursor) which are best shown directly in a full RDBMS.
