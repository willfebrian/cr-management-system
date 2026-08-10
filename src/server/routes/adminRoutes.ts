import { Router } from "express";
import net from "net";
import { pool } from "../db/pool.js";
import { requireAdmin, resolveAuthUser } from "../auth/middleware.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { deleteAdminPerson, PeopleAdminError } from "../admin/peopleAdminService.js";

export const adminRoutes = Router();

adminRoutes.get("/people", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, full_name, nickname, email, department, is_active, is_approver, is_abaper, is_requester, is_tester, is_evaluator, is_transporter
      FROM issue_people
      ORDER BY coalesce(full_name, nickname)
    `);
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

adminRoutes.post("/people", async (req, res, next) => {
  try {
    const { full_name, nickname, email } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO issue_people (full_name, nickname, email, department, is_active, is_approver, is_abaper, is_requester, is_tester, is_evaluator, is_transporter)
      VALUES ($1, $2, $3, 'IT', true, false, false, true, false, false, false)
      RETURNING id, full_name, nickname, email, department, is_active, is_approver, is_abaper, is_requester, is_tester, is_evaluator, is_transporter
    `, [full_name || `New Person ${Date.now()}`, nickname || '', email || null]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "create_person",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Added new person "${rows[0].full_name || rows[0].nickname}" (ID: ${rows[0].id})`,
      ipAddress: req.ip
    });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRoutes.put("/people/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { is_active, is_approver, is_abaper, is_requester, is_tester, is_evaluator, is_transporter, full_name, nickname, email } = req.body;
    
    await pool.query(`
      UPDATE issue_people 
      SET is_active = $2, 
          is_approver = $3, 
          is_abaper = $4, 
          is_requester = $5,
          is_tester = $6,
          is_evaluator = $7,
          is_transporter = $11,
          full_name = COALESCE($8, full_name),
          nickname = COALESCE($9, nickname),
          email = COALESCE($10, email),
          updated_at = now()
      WHERE id = $1
    `, [
      id, 
      is_active ?? null, 
      is_approver ?? null, 
      is_abaper ?? null, 
      is_requester ?? null, 
      is_tester ?? null,
      is_evaluator ?? null, 
      full_name ?? null, 
      nickname ?? null, 
      email ?? null,
      is_transporter ?? null
    ]);
    
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "update_person",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Updated master data person ID ${id}`,
      ipAddress: req.ip
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/people/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await deleteAdminPerson(id);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "delete_person",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Deleted master data person ID ${id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof PeopleAdminError) {
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        ...error.details
      });
      return;
    }
    next(error);
  }
});

adminRoutes.get("/group-emails", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, email_address, name, is_active, created_at
      FROM issue_group_emails
      ORDER BY id ASC
    `);
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

adminRoutes.post("/group-emails", async (req, res, next) => {
  try {
    const { email_address, name } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO issue_group_emails (email_address, name, is_active)
      VALUES ($1, $2, true)
      RETURNING id, email_address, name, is_active, created_at
    `, [email_address, name || ""]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "create_group_email",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Added group email "${email_address}"`,
      ipAddress: req.ip
    });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRoutes.put("/group-emails/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { email_address, name, is_active } = req.body;
    await pool.query(`
      UPDATE issue_group_emails
      SET email_address = COALESCE($2, email_address),
          name = COALESCE($3, name),
          is_active = COALESCE($4, is_active),
          updated_at = now()
      WHERE id = $1
    `, [id, email_address ?? null, name ?? null, is_active ?? null]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "update_group_email",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Updated group email ID ${id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/group-emails/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM issue_group_emails WHERE id = $1`, [id]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "delete_group_email",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Deleted group email ID ${id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.get("/settings", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT setting_key, setting_value FROM app_settings`);
    const settings = rows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {} as Record<string, string>);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

adminRoutes.put("/settings", async (req, res, next) => {
  try {
    const settings = req.body as Record<string, string>;
    const keys = Object.keys(settings);
    
    for (const key of keys) {
      await pool.query(`
        INSERT INTO app_settings (setting_key, setting_value)
        VALUES ($1, $2)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now()
      `, [key, settings[key]]);
    }
    
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "update_settings",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Updated system settings (${keys.length} keys)`,
      ipAddress: req.ip
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function ensureSapSystemsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sap_systems (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      environment TEXT DEFAULT 'Development',
      allow_multiple_logon BOOLEAN DEFAULT FALSE,
      host TEXT,
      system_number TEXT DEFAULT '00',
      client TEXT DEFAULT '100',
      rfc_user TEXT,
      rfc_password TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'Development';
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS allow_multiple_logon BOOLEAN DEFAULT FALSE;
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS host TEXT DEFAULT '192.168.2.8';
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS system_number TEXT DEFAULT '00';
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS client TEXT DEFAULT '100';
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS rfc_user TEXT DEFAULT 'TRSTDEV';
    ALTER TABLE sap_systems ADD COLUMN IF NOT EXISTS rfc_password TEXT;

    UPDATE sap_systems SET host = '192.168.2.8' WHERE host IS NULL;
    UPDATE sap_systems SET system_number = '00' WHERE system_number IS NULL;
    UPDATE sap_systems SET client = '100' WHERE client IS NULL;
    UPDATE sap_systems SET rfc_user = 'TRSTDEV' WHERE rfc_user IS NULL;
  `);

  const { rows } = await pool.query(`SELECT count(*)::int as count FROM sap_systems`);
  if (rows[0].count === 0) {
    await pool.query(`
      INSERT INTO sap_systems (code, description, environment, host, system_number, client, rfc_user)
      VALUES
        ('DEV_NC', 'Development NC', 'Development', '192.168.2.8', '00', '130', 'TRSTDEV'),
        ('DEV_AIX', 'Development AIX', 'Development', '192.168.2.9', '00', '130', 'TRSTDEV'),
        ('QA', 'QA Server', 'QA', '192.168.2.10', '00', '130', 'TRSTDEV'),
        ('PRD', 'Production Server', 'Production', '192.168.2.11', '00', '130', 'TRSTDEV')
      ON CONFLICT (code) DO NOTHING;
    `);
  }
}

adminRoutes.get("/systems", async (_req, res, next) => {
  try {
    await ensureSapSystemsTable();
    const { rows } = await pool.query(`
      SELECT id, code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active, created_at
      FROM sap_systems
      ORDER BY id
    `);
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

adminRoutes.post("/systems", async (req, res, next) => {
  try {
    await ensureSapSystemsTable();
    const { code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ ok: false, message: "Target System Code is required" });
    }
    const cleanCode = code.trim().toUpperCase();
    const { rows } = await pool.query(`
      INSERT INTO sap_systems (code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active, created_at
    `, [
      cleanCode,
      description || cleanCode,
      environment || 'Development',
      Boolean(allow_multiple_logon),
      host || '',
      system_number || '00',
      client || '100',
      rfc_user || '',
      rfc_password || '',
      is_active ?? true
    ]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "create_sap_system",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Added target system "${rows[0].code}" (${rows[0].description})`,
      ipAddress: req.ip
    });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

adminRoutes.put("/systems/:id", async (req, res, next) => {
  try {
    await ensureSapSystemsTable();
    const id = Number(req.params.id);
    const { code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active } = req.body;
    const { rows } = await pool.query(`
      UPDATE sap_systems
      SET code = COALESCE($2, code),
          description = COALESCE($3, description),
          environment = COALESCE($4, environment),
          allow_multiple_logon = COALESCE($5, allow_multiple_logon),
          host = COALESCE($6, host),
          system_number = COALESCE($7, system_number),
          client = COALESCE($8, client),
          rfc_user = COALESCE($9, rfc_user),
          rfc_password = COALESCE($10, rfc_password),
          is_active = COALESCE($11, is_active)
      WHERE id = $1
      RETURNING id, code, description, environment, allow_multiple_logon, host, system_number, client, rfc_user, rfc_password, is_active, created_at
    `, [
      id,
      code ? code.trim().toUpperCase() : null,
      description ?? null,
      environment ?? null,
      allow_multiple_logon ?? null,
      host ?? null,
      system_number ?? null,
      client ?? null,
      rfc_user ?? null,
      rfc_password ?? null,
      is_active ?? null
    ]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "update_sap_system",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Updated target system ID ${id}`,
      ipAddress: req.ip
    });
    res.json(rows[0] || { ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/systems/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM sap_systems WHERE id = $1`, [id]);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "admin",
      action: "delete_sap_system",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Deleted target system ID ${id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.post("/systems/test-connection", async (req, res, next) => {
  try {
    let { id, code, host, system_number, client, rfc_user, rfc_password } = req.body;
    const targetHost = String(host || "").trim();
    if (!targetHost) {
      return res.status(400).json({ ok: false, message: "Host IP/Hostname is required for test connection." });
    }

    // If password was left blank during edit, fetch existing password from database
    if ((!rfc_password || !rfc_password.trim()) && (id || code)) {
      const existing = await pool.query(
        `SELECT rfc_user, rfc_password FROM sap_systems WHERE id = $1 OR code = $2 LIMIT 1`,
        [id || 0, code || ""]
      );
      if (existing.rows[0]) {
        if (!rfc_user) rfc_user = existing.rows[0].rfc_user;
        if (!rfc_password) rfc_password = existing.rows[0].rfc_password;
      }
    }

    const cleanUser = String(rfc_user || "").trim();
    const cleanPass = String(rfc_password || "").trim();
    const sysNum = String(system_number || "00").padStart(2, "0");
    const port = 3300 + (parseInt(sysNum, 10) || 0);

    // 1. Check TCP socket connectivity to SAP Gateway Port (Port 33xx)
    const isConnected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, targetHost);
    });

    if (!isConnected) {
      return res.status(502).json({
        ok: false,
        message: `Connection FAILED: Host ${targetHost}:${port} (SAP Gateway Sys ${sysNum}) is unreachable or timed out.`
      });
    }

    // 2. Perform SAP RFC / ICF Auth Ping if user is specified
    if (cleanUser) {
      const httpPorts = [8000 + (parseInt(sysNum, 10) || 0), 8000, 8001, 8080];
      const authHeader = `Basic ${Buffer.from(`${cleanUser}:${cleanPass}`).toString("base64")}`;
      let authFailed = false;
      let authSuccess = false;

      for (const httpPort of httpPorts) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const pingRes = await fetch(`http://${targetHost}:${httpPort}/sap/bc/ping?sap-client=${client || "100"}`, {
            headers: {
              Authorization: authHeader,
              "User-Agent": "CR-Management-System-SAP-Test"
            },
            signal: controller.signal
          }).catch(() => null);

          clearTimeout(timeoutId);

          if (pingRes) {
            if (pingRes.status === 401 || pingRes.status === 403) {
              authFailed = true;
              break;
            } else if (pingRes.status === 200 || pingRes.status === 204) {
              authSuccess = true;
              break;
            }
          }
        } catch {}
      }

      if (authFailed) {
        return res.status(401).json({
          ok: false,
          message: `Host ${targetHost}:${port} is reachable, BUT RFC User '${cleanUser}' authentication FAILED (HTTP 401 Unauthorized - Invalid username or password for Client ${client || "100"}).`
        });
      }

      if (authSuccess) {
        return res.json({
          ok: true,
          message: `RFC Gateway port ${port} on ${targetHost} (Client ${client || '100'}) is REACHABLE & RFC User '${cleanUser}' authenticated successfully!`
        });
      }

      // If HTTP ICF port is disabled/closed, inform user accurately
      return res.json({
        ok: true,
        message: `RFC Gateway port ${port} on ${targetHost} is REACHABLE! (Note: HTTP ICF Auth Service port 80${sysNum} is disabled on host, gateway socket ping verified).`
      });
    }

    return res.json({
      ok: true,
      message: `RFC Gateway port ${port} on ${targetHost} (Client ${client || '100'}) is REACHABLE!`
    });
  } catch (error) {
    next(error);
  }
});
