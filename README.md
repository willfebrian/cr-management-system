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
   SAP_AGENT_PLATFORM_DIR=
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

## Automatic Incremental Sync

Auto sync is available but disabled by default.

Use these `.env` values to enable it:

```env
SAP_CR_AUTO_SYNC_ENABLED=true
SAP_CR_AUTO_SYNC_SYSTEMS=DEV,QA,PRD
SAP_CR_AUTO_SYNC_INTERVAL_MINUTES=60
SAP_CR_AUTO_SYNC_LOOKBACK_DAYS=3
SAP_CR_AUTO_SYNC_ROW_COUNT=5000
```

Notes:

- Auto sync runs in the web server process.
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
