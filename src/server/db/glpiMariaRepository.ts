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

type GlpiEmailLookupDb = {
  query(sql: string, params: unknown[]): Promise<[any[], unknown]>;
};

export async function findGlpiUserIdsByEmails(
  emails: string[],
  database?: GlpiEmailLookupDb
): Promise<number[]> {
  const normalized = [...new Set(
    emails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  )];
  if (!normalized.length) return [];

  const db = database || getPool();
  if (!db) return [];
  const [queryRows] = await db.query(
    `SELECT DISTINCT u.id AS user_id
     FROM glpi_useremails ue
     JOIN glpi_users u ON u.id = ue.users_id
     WHERE LOWER(TRIM(ue.email)) IN (?)
       AND u.is_active = 1
       AND u.is_deleted = 0
     ORDER BY u.id`,
    [normalized]
  );
  const rows = queryRows as Array<{ user_id: number | string }>;
  return rows.map((row) => Number(row.user_id)).filter(Number.isFinite);
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

export type GlpiTicketParticipant = {
  userId: number;
  username: string;
  fullName: string;
};

export type GlpiTicketFollowup = {
  id: number;
  date: string;
  author: string;
  content: string;
};

export type GlpiTicketSolution = {
  id: number;
  date: string;
  solver: string;
  content: string;
};

export type GlpiTicketDetail = {
  ticketNumber: number;
  title: string;
  content: string;
  date: string;
  status: number | string;
  solvedate?: string | null;
  closedate?: string | null;
  requesters: GlpiTicketParticipant[];
  technicians: GlpiTicketParticipant[];
  observers: GlpiTicketParticipant[];
  followups: GlpiTicketFollowup[];
  solutions: GlpiTicketSolution[];
};

function decodeHtmlEntities(str = "") {
  return str
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/&#38;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function getGlpiTicketDetailFromMaria(ticketId: number): Promise<GlpiTicketDetail | null> {
  const db = getPool();
  if (!db || !ticketId) return null;

  try {
    const [ticketRows] = await db.query<mysql.RowDataPacket[]>(
      `SELECT id, name, content, date, status, solvedate, closedate FROM glpi_tickets WHERE id = ?`,
      [ticketId]
    );

    if (!ticketRows.length) return null;
    const ticket = ticketRows[0];

    const [users] = await db.query<mysql.RowDataPacket[]>(
      `SELECT tu.type, u.id as user_id, u.name as username, u.realname, u.firstname
       FROM glpi_tickets_users tu
       JOIN glpi_users u ON tu.users_id = u.id
       WHERE tu.tickets_id = ?`,
      [ticketId]
    );

    const mapUser = (u: any): GlpiTicketParticipant => ({
      userId: Number(u.user_id),
      username: String(u.username || ""),
      fullName: [u.firstname, u.realname].filter(Boolean).join(" ") || String(u.username || "")
    });

    const requesters = users.filter((u) => u.type === 1).map(mapUser);
    const technicians = users.filter((u) => u.type === 2).map(mapUser);
    const observers = users.filter((u) => u.type === 3).map(mapUser);

    let followups: GlpiTicketFollowup[] = [];
    try {
      const [chats] = await db.query<mysql.RowDataPacket[]>(
        `SELECT f.id, f.date, f.content, u.name as username, u.realname, u.firstname
         FROM glpi_itilfollowups f
         LEFT JOIN glpi_users u ON f.users_id = u.id
         WHERE f.itemtype = 'Ticket' AND f.items_id = ?
         ORDER BY f.date ASC`,
        [ticketId]
      );
      followups = chats.map((c) => ({
        id: Number(c.id),
        date: String(c.date || ""),
        author: [c.firstname, c.realname].filter(Boolean).join(" ") || String(c.username || "System"),
        content: decodeHtmlEntities(c.content || "")
      }));
    } catch {}

    let solutions: GlpiTicketSolution[] = [];
    try {
      const [solRows] = await db.query<mysql.RowDataPacket[]>(
        `SELECT s.id, s.date_creation, s.content, u.name as username, u.realname, u.firstname
         FROM glpi_itilsolutions s
         LEFT JOIN glpi_users u ON s.users_id = u.id
         WHERE s.itemtype = 'Ticket' AND s.items_id = ?`,
        [ticketId]
      );
      solutions = solRows.map((s) => ({
        id: Number(s.id),
        date: String(s.date_creation || ""),
        solver: [s.firstname, s.realname].filter(Boolean).join(" ") || String(s.username || "System"),
        content: decodeHtmlEntities(s.content || "")
      }));
    } catch {}

    return {
      ticketNumber: Number(ticket.id),
      title: String(ticket.name || ""),
      content: decodeHtmlEntities(ticket.content || ""),
      date: ticket.date ? String(ticket.date) : "",
      status: ticket.status,
      solvedate: ticket.solvedate ? String(ticket.solvedate) : null,
      closedate: ticket.closedate ? String(ticket.closedate) : null,
      requesters,
      technicians,
      observers,
      followups,
      solutions
    };
  } catch (error) {
    console.error(`Failed to fetch GLPI ticket #${ticketId} detail:`, error);
    return null;
  }
}

