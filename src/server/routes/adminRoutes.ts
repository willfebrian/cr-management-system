import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../auth/middleware.js";

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
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/people/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM issue_people WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
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
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRoutes.delete("/group-emails/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM issue_group_emails WHERE id = $1`, [id]);
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
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
