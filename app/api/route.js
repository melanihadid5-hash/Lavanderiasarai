import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

/* ─────────────── Base de datos ─────────────── */

// La conexión se crea la primera vez que se usa, no al cargar el archivo.
// Si se creara arriba, el build fallaría porque aún no existe DATABASE_URL.
let _sql = null;
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL. Conecta la base Neon en Vercel > Storage.");
    _sql = neon(url);
  }
  return _sql;
}
const sql = (strings, ...values) => getSql()(strings, ...values);

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // La secuencia garantiza números únicos aunque dos personas registren
  // al mismo tiempo. Lo resuelve la base de datos, no la app.
  await sql`CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1`;
  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      client_id BIGINT REFERENCES clients(id),
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL DEFAULT '',
      services TEXT NOT NULL DEFAULT '',
      price NUMERIC(10,2),
      status TEXT NOT NULL DEFAULT 'proceso',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      estimate_at TIMESTAMPTZ,
      ready_at TIMESTAMPTZ
    )`;
  schemaReady = true;
}

/* ─────────────── Sesión del personal ─────────────── */

const COOKIE = "lav_staff";
const secret = () => process.env.SESSION_SECRET || "cambia-esta-frase";

function signToken() {
  const payload = String(Date.now());
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  return Date.now() - Number(payload) < 12 * 60 * 60 * 1000; // 12 horas
}

const isStaff = () => verifyToken(cookies().get(COOKIE)?.value);

/* ─────────────── Utilidades ─────────────── */

const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;
const WINDOW_SPAN = 2;
const LAST_START_HOUR = CLOSE_HOUR - WINDOW_SPAN; // 18 = 6 p.m.

const digitsOf = (v) => String(v || "").replace(/\D/g, "");
const norm = (v) => String(v || "").replace(/[\s-]/g, "").toLowerCase();

// El navegador del personal envía la fecha ya calculada en su zona horaria.
// El servidor NO debe construirla: Vercel corre en UTC y guardaría una hora
// equivocada (8am se volvería 2am en México).
function parseEstimate(value, hour, nextDay) {
  const d = new Date(value);
  if (value && !Number.isNaN(d.getTime())) return d;
  // Respaldo por si llegara sin fecha (versión antigua del navegador).
  const f = new Date();
  if (nextDay) f.setDate(f.getDate() + 1);
  f.setHours(Number(hour), 0, 0, 0);
  return f;
}

const bad = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

/* ─────────────── GET ─────────────── */

export async function GET(req) {
  const action = req.nextUrl.searchParams.get("action");

  try {
    // Consulta pública del cliente. Nunca devuelve el teléfono.
    if (action === "ticket") {
      const number = req.nextUrl.searchParams.get("number") || "";
      await ensureSchema();
      const rows = await sql`
        SELECT number, client_name, services, price, status,
               created_at, estimate_at, ready_at
        FROM tickets
        WHERE lower(replace(replace(number,'-',''),' ','')) = ${norm(number)}
        LIMIT 1`;
      if (!rows[0]) return bad("No encontrado", 404);
      return NextResponse.json({ ticket: rows[0] });
    }

    if (action === "session") {
      return NextResponse.json({ authed: isStaff() });
    }

    if (action === "data") {
      if (!isStaff()) return bad("No autorizado", 401);
      await ensureSchema();
      const [clients, tickets] = await Promise.all([
        sql`SELECT id, name, phone FROM clients ORDER BY name ASC`,
        sql`SELECT id, number, client_name, client_phone, services, price,
                   status, created_at, estimate_at, ready_at
            FROM tickets ORDER BY id DESC LIMIT 300`,
      ]);
      return NextResponse.json({ clients, tickets });
    }

    return bad("Acción desconocida");
  } catch (e) {
    console.error(e);
    return bad(e.message || "Error del servidor", 500);
  }
}

/* ─────────────── POST ─────────────── */

export async function POST(req) {
  const action = req.nextUrl.searchParams.get("action");
  const body = await req.json().catch(() => ({}));

  try {
    if (action === "login") {
      const expected = process.env.STAFF_CODE;
      if (!expected) return bad("Falta configurar STAFF_CODE en Vercel.", 500);
      if (!body.code || body.code !== expected) return bad("Código incorrecto.", 401);
      const res = NextResponse.json({ ok: true });
      res.cookies.set({
        name: COOKIE,
        value: signToken(),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return res;
    }

    if (action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set({ name: COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
      return res;
    }

    // A partir de aquí, todo requiere sesión de personal.
    if (!isStaff()) return bad("No autorizado", 401);
    await ensureSchema();

    if (action === "create") {
      const hour = Number(body.hour);
      if (!(hour >= OPEN_HOUR && hour <= LAST_START_HOUR)) {
        return bad("Hora de entrega inválida.");
      }

      let client;
      if (body.newClient) {
        const name = String(body.newClient.name || "").trim();
        const phone = digitsOf(body.newClient.phone);
        if (name.split(/\s+/).filter(Boolean).length < 2) {
          return bad("Escribe nombre y apellido del cliente.");
        }
        if (phone.length < 10 || phone.length > 15) {
          return bad("Escribe un teléfono válido de 10 dígitos.");
        }
        const rows = await sql`
          INSERT INTO clients (name, phone) VALUES (${name}, ${phone})
          RETURNING id, name, phone`;
        client = rows[0];
      } else {
        const rows = await sql`
          SELECT id, name, phone FROM clients WHERE id = ${body.clientId} LIMIT 1`;
        if (!rows[0]) return bad("Cliente no encontrado.", 404);
        client = rows[0];
      }

      const estimateAt = parseEstimate(body.estimateAt, hour, Boolean(body.nextDay));
      const rows = await sql`
        INSERT INTO tickets (number, client_id, client_name, client_phone, estimate_at)
        VALUES ('B' || lpad(nextval('ticket_seq')::text, 3, '0'),
                ${client.id}, ${client.name}, ${client.phone}, ${estimateAt})
        RETURNING id, number, client_name, client_phone, services, price,
                  status, created_at, estimate_at, ready_at`;
      return NextResponse.json({ ticket: rows[0] });
    }

    if (action === "status") {
      const valid = ["proceso", "lista", "entregado"];
      if (!valid.includes(body.status)) return bad("Estado inválido.");
      const rows = await sql`
        UPDATE tickets
        SET status = ${body.status},
            ready_at = CASE WHEN ${body.status} = 'lista' AND ready_at IS NULL
                            THEN now() ELSE ready_at END
        WHERE id = ${body.id}
        RETURNING id, number, client_name, client_phone, status, ready_at`;
      if (!rows[0]) return bad("Ticket no encontrado.", 404);
      return NextResponse.json({ ticket: rows[0] });
    }

    if (action === "details") {
      let price = null;
      if (body.price !== null && body.price !== undefined && body.price !== "") {
        const p = Number(body.price);
        if (Number.isNaN(p) || p < 0) return bad("El precio debe ser un número válido.");
        price = p;
      }
      const services = String(body.services ?? "").trim();
      const rows = await sql`
        UPDATE tickets SET services = ${services}, price = ${price}
        WHERE id = ${body.id} RETURNING id, number, services, price`;
      if (!rows[0]) return bad("Ticket no encontrado.", 404);
      return NextResponse.json({ ticket: rows[0] });
    }

    return bad("Acción desconocida");
  } catch (e) {
    console.error(e);
    return bad(e.message || "Error del servidor", 500);
  }
}
