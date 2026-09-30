# CR Management System

Web application for SAP Change Request management.

## Current Scope

- Primary CR source: SAP DEV AIX, configured as `DEV`.
- Additional lifecycle systems: `QA` and `PRD`.
- Default CR owner: `TRSTDEV`.
- Database: PostgreSQL schema from `PGSCHEMA`, default `cr_management`.
- Web URL: `http://127.0.0.1:3001`.

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Fill `.env`.

   Required database fields:

   ```env
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=sap_cr_management
   PGUSER=sap_cr_app
   PGPASSWORD=change-me
   PGSCHEMA=cr_management
   ```

   Required SAP fields:

   ```env
   SAP_CR_SYSTEMS=DEV,QA,PRD
   SAP_CR_DEFAULT_SYSTEM=DEV

   SAP_CR_DEV_SERVER=SAP_DEV_AIX
   SAP_CR_DEV_OWNER=TRSTDEV
   SAP_CR_DEV_ENABLED=true

   SAP_CR_QA_SERVER=SAP_QA
   SAP_CR_QA_OWNER=TRSTDEV
   SAP_CR_QA_ENABLED=true

   SAP_CR_PRD_SERVER=SAP_PRD
   SAP_CR_PRD_OWNER=TRSTDEV
   SAP_CR_PRD_ENABLED=true
   ```

   Create CR Transport uses the bundled `scripts/cr-transport-request.mjs` runtime. No external platform directory is required.

3. Apply schema:

   ```powershell
   npm run db:schema
   ```

4. Build and start:

   ```powershell
   npm run build
   npm run start
   ```

## Sync CR

Manual Sync CR is available from Dashboard and Report.

Default behavior:

- `DEV`, `QA`, and `PRD` are selected by default.
- Sync mode defaults to `Incremental`.
- Incremental period is calculated per system from the last successful sync time minus the configured lookback days.
- If a system has no previous successful sync, it starts from January 1 of the current year.
- Full by Period can still be selected for from/to month-year reloads.

Performance behavior:

- The sync still reads the CR list from SAP for the effective period.
- Detail/object retrieval is skipped when the cached parent CR signature has not changed.
- The signature uses status, SAP changed date/time, and cached object presence.
- This keeps repeated incremental syncs lighter while still refreshing changed CRs.

Lifecycle behavior:

- DEV remains the primary parent CR source.
- QA and PRD enrich lifecycle status.
- Transport lifecycle is confirmed from SAP import log when available.
- If import history cannot be read, lifecycle falls back to cache matching and is treated as inferred internally.

Status definitions:

- `Outstanding`: parent CR in DEV is not released.
- `Released`: parent CR in DEV is released.
- `Pending to QA`: released parent CR exists in DEV but is not imported in QA.
- `In QA`: parent CR has imported lifecycle evidence in QA.
- `Pending to PRD`: parent CR is in QA but not imported in PRD.
- `In PRD`: parent CR has imported lifecycle evidence in PRD.

## User-to-person assignment

ADMIN can open User Management, select a current account, and use **Assign Person**, **Change Assignment**, or **Unassign**. Accounts may remain unassigned. Only active people can be selected, and one person can belong to only one account. Archived accounts keep their link but must be restored before it can change.

## Role and feature permissions

Accounts keep the `ADMIN` and `USER` role labels, while feature access is granted separately to each account. Administrators with **Manage Users & Permissions** can open **User Management**, select or create an account, and maintain its feature checkboxes. Role presets fill the initial selection only; later changes are stored as explicit grants.

The **Create Transport** and **Release Transport** permissions are separate, unchecked by default, and never implied by the `ADMIN` role or a preset. Grant them individually only to accounts that should perform those SAP actions. The user list can be filtered by these grants.

Issue reference grants are also separate. CR SAP and GLPI references require both the `ADMIN` role and the corresponding grant; CR Helpdesk numbers can be edited by either role when granted, and the standard presets include that access. Other Issue actions, including creating and editing Issues, generating emails and ticket forms, opening a prefilled GLPI ticket, and sending reminders, can be managed independently.

The schema backfills existing non-archived accounts with their prior intended feature access, excluding Transport Create and Release. Apply `npm run db:schema` during deployment to create and backfill the permission table. On a fresh database, run `npm run auth:seed` after applying the schema; newly seeded accounts receive their role preset, and the Admin preset includes **Manage Users & Permissions** but not either Transport mutation grant. Set `INITIAL_USER_PASSWORD` before seeding. A one-time marker prevents later schema runs from restoring grants that an administrator has removed. Keep at least one active, non-archived `ADMIN` account with **Manage Users & Permissions** enabled.

After migration, sign in as an administrator, open **User Management**, filter users by **Create Transport** or **Release Transport**, and grant each permission independently to the approved accounts. Confirm that an active permission manager remains before removing or changing an administrator's grants.

## Automatic Incremental Sync

Auto sync is available but disabled by default.

Use these `.env` values to enable it:

```env
SAP_CR_AUTO_SYNC_ENABLED=true
SAP_CR_AUTO_SYNC_SYSTEMS=DEV,QA,PRD
SAP_CR_AUTO_SYNC_INTERVAL_MINUTES=60
SAP_CR_AUTO_SYNC_DEV_INTERVAL_MINUTES=10
SAP_CR_AUTO_SYNC_QA_INTERVAL_MINUTES=20
SAP_CR_AUTO_SYNC_PRD_INTERVAL_MINUTES=30
SAP_CR_AUTO_SYNC_LOOKBACK_DAYS=3
SAP_CR_AUTO_SYNC_ROW_COUNT=5000
```

Notes:

- Auto sync runs in the web server process.
- Each listed system uses `SAP_CR_AUTO_SYNC_<SYSTEM>_INTERVAL_MINUTES`; when omitted, it falls back to `SAP_CR_AUTO_SYNC_INTERVAL_MINUTES`.
- Systems omitted from `SAP_CR_AUTO_SYNC_SYSTEMS` remain available for manual sync but are never scheduled automatically.
- It will not start a second sync if a previous auto sync is still running.
- Keep it disabled unless this app is intended to poll SAP continuously.

## Start Web Automatically On Windows

Preferred option: install a Windows Scheduled Task:

```powershell
npm run windows:install-startup
```

If Windows blocks Scheduled Task registration, install a Startup folder shortcut:

```powershell
npm run windows:install-startup-shortcut
```

The startup target runs:

```powershell
npm run start
```

To remove it later:

```powershell
Unregister-ScheduledTask -TaskName "CR Management System" -Confirm:$false
```

To remove the Startup shortcut later, delete:

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CR Management System.lnk
```

## Useful Commands

```powershell
npm run build
npm run start
npm run db:check
npm run sync:summary
npm run db:refresh-lifecycle-cache
npm run sap:refresh-transport-logs
```

## API

- `GET /api/health`
- `GET /api/systems`
- `GET /api/dashboard`
- `GET /api/dashboard/status-trend`
- `GET /api/cr`
- `GET /api/cr/:trkorr`
- `POST /api/sync/cr`
