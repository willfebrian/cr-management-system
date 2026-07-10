import mysql from "mysql2/promise";

type GlpiTicketRow = {
  ticket_number: number;
  title?: string | null;
  opened_at?: string | null;
  status?: string | number | null;
  source: "glpi_mariadb";
};

let pool: mysql.Pool | null = null;

function enabled() {
  return String(process.env.GLPI_DB_ENABLED || "").toLowerCase() === "true";
}

function tableName() {
  return process.env.GLPI_DB_TABLE || "glpi_tickets";
}

function columns() {
  return {
    id: process.env.GLPI_DB_ID_COLUMN || "id",
    title: process.env.GLPI_DB_TITLE_COLUMN || "name",
    openedAt: process.env.GLPI_DB_OPENED_AT_COLUMN || process.env.GLPI_DB_CREATED_COLUMN || "date",
    status: process.env.GLPI_DB_STATUS_COLUMN || "status"
  };
}

function ident(value: string) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Invalid GLPI identifier: ${value}`);
  return `\`${value}\``;
}

function getPool() {
  if (!enabled()) return null;
  if (pool) return pool;
  if (!process.env.GLPI_DB_HOST || !process.env.GLPI_DB_NAME || !process.env.GLPI_DB_USER) return null;

  pool = mysql.createPool({
    host: process.env.GLPI_DB_HOST,
    port: Number(process.env.GLPI_DB_PORT || 3306),
    database: process.env.GLPI_DB_NAME,
    user: process.env.GLPI_DB_USER,
    password: process.env.GLPI_DB_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: Number(process.env.GLPI_DB_CONNECTION_LIMIT || 5),
    namedPlaceholders: true,
    timezone: "local"
  });
  return pool;
}

export function isGlpiMariaConfigured() {
  return Boolean(getPool());
}

export async function searchGlpiTicketsFromMaria(q = ""): Promise<GlpiTicketRow[]> {
  const db = getPool();
  if (!db) return [];

  const clean = q.trim();
  const numeric = clean.replace(/[^\d]/g, "");
  const likeText = `%${clean.toUpperCase()}%`;
  const likeNumber = `%${numeric}%`;
  const column = columns();

  const where = clean
    ? `WHERE CAST(${ident(column.id)} AS CHAR) LIKE :likeNumber OR UPPER(COALESCE(${ident(column.title)}, '')) LIKE :likeText`
    : "";

  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `
      SELECT
        ${ident(column.id)} AS ticket_number,
        ${ident(column.title)} AS title,
        ${ident(column.openedAt)} AS opened_at,
        ${ident(column.status)} AS status
      FROM ${ident(tableName())}
      ${where}
      ORDER BY ${ident(column.id)} DESC
      LIMIT 30
    `,
    { likeNumber, likeText }
  );

  return rows.map((row) => ({
    ticket_number: Number(row.ticket_number),
    title: row.title ?? null,
    opened_at: row.opened_at ? String(row.opened_at) : null,
    status: row.status ?? null,
    source: "glpi_mariadb"
  }));
}

