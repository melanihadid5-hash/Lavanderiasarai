"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ─────────── Paleta ─────────── */
const BG = "#F6F8FC";
const SURFACE = "#FFFFFF";
const LINE = "#E4E9F2";
const INK = "#14213D";
const MUTED = "#68738A";
const ACCENT = "#2F6FEB";
const ACCENT_SOFT = "#EAF1FF";
const ACCENT_DARK = "#1D4FC4";
const SOFT = "#F1F3F7";
const DANGER = "#D34848";
const WHATSAPP = "#25D366";

/* ─────────── Horario ─────────── */
const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;
const WINDOW_SPAN = 2;
const LAST_START_HOUR = CLOSE_HOUR - WINDOW_SPAN;
const HOUR_OPTIONS = Array.from(
  { length: LAST_START_HOUR - OPEN_HOUR + 1 },
  (_, i) => OPEN_HOUR + i
);

function formatHour12(h) {
  const hh = ((h % 24) + 24) % 24;
  const period = hh >= 12 ? "p.m." : "a.m.";
  let x = hh % 12;
  if (x === 0) x = 12;
  return `${x}:00 ${period}`;
}
const BUSINESS_HOURS = `${formatHour12(OPEN_HOUR)} – ${formatHour12(CLOSE_HOUR)}`;

// Sugiere 3 horas después de recibir, pero nunca antes de abrir.
// Si esa hora ya no cabe antes del cierre, pasa al día siguiente.
function suggestEstimate() {
  // Math.max evita proponer horas anteriores a la apertura cuando
  // el panel se usa muy temprano (por ejemplo, a las 5 de la mañana).
  const c = Math.max(new Date().getHours() + 3, OPEN_HOUR + 2);
  return c <= LAST_START_HOUR ? { hour: c, nextDay: false } : { hour: OPEN_HOUR + 2, nextDay: true };
}

// Con "Hoy" seleccionado, no tiene sentido ofrecer horas ya pasadas.
function isHourDisabled(h, nextDay) {
  if (nextDay) return false;
  return h < new Date().getHours();
}

function windowText(iso) {
  if (!iso) return "Por confirmar";
  const s = new Date(iso).getHours();
  return `${formatHour12(s)} – ${formatHour12(s + WINDOW_SPAN)}`;
}

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "hoy";
  const t = new Date(today);
  t.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return "mañana";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const readyText = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) : "—";

const relDay = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? "hoy"
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

/* ─────────── Utilidades ─────────── */
const digitsOf = (v) => String(v || "").replace(/\D/g, "");
const maskPhone = (v) => (digitsOf(v) ? "•••• " + digitsOf(v).slice(-4) : "Sin teléfono");

function ticketLink(number) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/?ticket=${encodeURIComponent(number)}`;
}

function openWhatsApp(phone, msg) {
  const cc = process.env.NEXT_PUBLIC_COUNTRY_CODE || "52";
  const d = digitsOf(phone);
  const full = d.length === 10 ? cc + d : d;
  window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

const msgCreated = (t) =>
  `Hola ${t.client_name.split(" ")[0]}, recibimos tu ropa.\n\n` +
  `Tu número de ticket es: ${t.number}\n\n` +
  `Consulta el estado aquí:\n${ticketLink(t.number)}`;

const msgReady = (t) =>
  `Hola ${t.client_name.split(" ")[0]}, tu ropa ya está lista para recoger.\n\n` +
  `Ticket: ${t.number}\n\n` +
  `Detalles aquí:\n${ticketLink(t.number)}`;

async function api(action, method = "GET", body) {
  const res = await fetch(`/api?action=${action}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ─────────── Piezas de interfaz ─────────── */

const card = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(20,33,61,.04), 0 8px 24px -12px rgba(20,33,61,.08)",
};

const inputStyle = {
  width: "100%",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 14,
  background: SURFACE,
  color: INK,
};

function Spinner({ size = 22 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div
        className="spin"
        style={{
          width: size,
          height: size,
          border: `2px solid ${LINE}`,
          borderTopColor: ACCENT,
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

function Badge({ status }) {
  const map = {
    proceso: { label: "En proceso", bg: SOFT, color: MUTED },
    lista: { label: "Lista para recoger", bg: ACCENT, color: "#fff" },
    entregado: { label: "Entregada", bg: "#EEF0F3", color: "#8A93A6" },
  };
  const s = map[status] || map.proceso;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function Button({ children, onClick, type = "button", busy, color = ACCENT, full = true }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      style={{
        width: full ? "100%" : undefined,
        padding: "12px 16px",
        borderRadius: 12,
        border: "none",
        background: color,
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? "Un momento…" : children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus, onKeyDown }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, marginBottom: 10 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/* ─────────── Cliente ─────────── */

function ClientEntry({ onFound, onStaff }) {
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!number.trim()) return setError("Escribe el número de ticket que te dieron.");
    setBusy(true);
    const { ok, data } = await api(`ticket&number=${encodeURIComponent(number.trim())}`);
    setBusy(false);
    if (!ok) return setError("No encontramos ese número. Revisa que esté escrito igual, por ejemplo B001.");
    onFound(data.ticket);
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Consulta tu pedido</h1>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>
          Escribe el número de ticket que te dimos al dejar tu ropa.
        </p>
      </div>

      <div style={{ ...card, padding: 24 }}>
        <form onSubmit={submit}>
          <Field label="Número de ticket" value={number} onChange={setNumber} placeholder="B001" autoFocus />
          {error && <p style={{ fontSize: 12, color: DANGER, marginTop: -6, marginBottom: 12 }}>{error}</p>}
          <Button type="submit" busy={busy}>Ver mi resumen</Button>
        </form>
      </div>

      <p style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 20 }}>
        ¿No tienes número? Pídelo en el mostrador al dejar tu ropa.
      </p>

      <div style={{ textAlign: "center", marginTop: 28 }}>
        <button
          onClick={onStaff}
          style={{ background: "none", border: "none", color: MUTED, fontSize: 12, opacity: 0.7 }}
        >
          Panel del personal
        </button>
      </div>
    </div>
  );
}

function ClientSummary({ ticket, onExit }) {
  const [cur, setCur] = useState(ticket);
  const [justReady, setJustReady] = useState(false);
  const prev = useRef(ticket.status);

  const refresh = useCallback(async () => {
    const { ok, data } = await api(`ticket&number=${encodeURIComponent(ticket.number)}`);
    if (ok) {
      if (prev.current === "proceso" && data.ticket.status === "lista") setJustReady(true);
      prev.current = data.ticket.status;
      setCur(data.ticket);
    }
  }, [ticket.number]);

  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", width: "100%" }}>
      {justReady && (
        <div
          style={{
            background: ACCENT_SOFT,
            color: ACCENT_DARK,
            padding: "14px 16px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          ¡Tu ropa ya está lista! Puedes pasar a recogerla.
        </div>
      )}

      <div style={{ ...card, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", margin: 0 }}>
              Tu ticket
            </p>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: "2px 0 0" }}>{cur.number}</h2>
          </div>
          <Badge status={cur.status} />
        </div>

        <Row label="Nombre" value={cur.client_name} />
        <Row label="Fecha de recepción" value={relDay(cur.created_at)} />

        {(cur.services || cur.price != null) && (
          <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 0 }}>
              Detalle del servicio
            </p>
            {cur.services && <Row label="Servicios" value={cur.services} />}
            {cur.price != null && <Row label="Total" value={`$${Number(cur.price).toFixed(2)}`} />}
          </div>
        )}

        <div style={{ background: BG, borderRadius: 12, padding: 16, marginTop: 24 }}>
          {cur.status === "proceso" ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Entrega estimada</p>
              <p style={{ fontSize: 14, margin: "2px 0 0" }}>
                {windowText(cur.estimate_at)}
                {cur.estimate_at && ` · ${dayLabel(cur.estimate_at)}`}
              </p>
              <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0" }}>
                Es un estimado. Te avisaremos en cuanto esté lista.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                {cur.status === "entregado" ? "Estuvo lista" : "Lista desde"}
              </p>
              <p style={{ fontSize: 14, margin: "2px 0 0" }}>{readyText(cur.ready_at)}</p>
            </>
          )}
          <p style={{ fontSize: 12, color: MUTED, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
            Horario: {BUSINESS_HOURS}
          </p>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button onClick={onExit} style={{ background: "none", border: "none", color: MUTED, fontSize: 14 }}>
          Salir
        </button>
      </div>
    </div>
  );
}

/* ─────────── Personal ─────────── */

function StaffGate({ onSuccess, onBack }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { ok, data } = await api("login", "POST", { code });
    setBusy(false);
    if (ok) onSuccess();
    else setError(data.error || "Código incorrecto.");
  }

  return (
    <div style={{ maxWidth: 320, margin: "0 auto", width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Acceso del personal</h1>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>Escribe el código para entrar.</p>
      </div>
      <div style={{ ...card, padding: 24 }}>
        <form onSubmit={submit}>
          <Field label="Código de acceso" value={code} onChange={setCode} type="password" placeholder="••••" autoFocus />
          {error && <p style={{ fontSize: 12, color: DANGER, marginTop: -6, marginBottom: 12 }}>{error}</p>}
          <Button type="submit" busy={busy}>Entrar</Button>
        </form>
      </div>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: MUTED, fontSize: 14 }}>
          Volver
        </button>
      </div>
    </div>
  );
}

function NewTicket({ clients, onCreate, onCancel }) {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const init = useMemo(() => suggestEstimate(), []);
  const [hour, setHour] = useState(init.hour);
  const [nextDay, setNextDay] = useState(init.nextDay);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients).slice(0, 6);
  }, [query, clients]);

  const exact = clients.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exact;

  async function run(payload) {
    setError("");
    setBusy(true);
    const err = await onCreate(payload);
    setBusy(false);
    if (err) setError(err);
  }

  const chip = (active) => ({
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${active ? ACCENT : LINE}`,
    background: active ? ACCENT : SURFACE,
    color: active ? "#fff" : MUTED,
  });

  return (
    <div style={{ ...card, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <b style={{ fontSize: 14 }}>Nuevo ticket</b>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: MUTED }}>✕</button>
      </div>

      <Field
        label="Nombre del cliente"
        value={query}
        onChange={(v) => { setQuery(v); setError(""); }}
        placeholder="Buscar o escribir nombre y apellido"
        autoFocus
      />

      <div style={{ background: BG, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b style={{ fontSize: 12 }}>Entrega estimada</b>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                setNextDay(false);
                // Si la hora elegida ya pasó hoy, se mueve a la siguiente válida.
                if (isHourDisabled(hour, false)) {
                  const next = HOUR_OPTIONS.find((h) => !isHourDisabled(h, false));
                  if (next) setHour(next);
                  else setNextDay(true);
                }
              }}
              style={chip(!nextDay)}
            >
              Hoy
            </button>
            <button onClick={() => setNextDay(true)} style={chip(nextDay)}>Mañana</button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {HOUR_OPTIONS.map((h) => {
            const off = isHourDisabled(h, nextDay);
            return (
              <button
                key={h}
                onClick={() => !off && setHour(h)}
                disabled={off}
                style={{ ...chip(hour === h), opacity: off ? 0.35 : 1 }}
              >
                {formatHour12(h).replace(":00", "")}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: "10px 0 0" }}>
          El cliente verá <b style={{ color: INK }}>{formatHour12(hour)} – {formatHour12(hour + WINDOW_SPAN)}</b>{" "}
          {nextDay ? "mañana" : "hoy"}.
        </p>
      </div>

      {matches.length > 0 && (
        <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, margin: "0 0 8px" }}>Clientes registrados</p>
      )}
      {matches.map((c) => (
        <button
          key={c.id}
          onClick={() => run({ clientId: c.id, hour, nextDay })}
          disabled={busy}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            background: SURFACE,
            marginBottom: 6,
            textAlign: "left",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{c.name}</span>
            <span style={{ display: "block", fontSize: 12, color: MUTED }}>{maskPhone(c.phone)}</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT_DARK, whiteSpace: "nowrap" }}>
            Generar →
          </span>
        </button>
      ))}

      {canCreate && (
        <div style={{ border: `1px solid ${ACCENT}`, background: ACCENT_SOFT, borderRadius: 12, padding: 12, marginTop: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: ACCENT_DARK, margin: "0 0 8px" }}>
            Cliente nuevo: «{query.trim()}»
          </p>
          <input
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            placeholder="Teléfono (10 dígitos)"
            type="tel"
            inputMode="numeric"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <Button onClick={() => run({ newClient: { name: query.trim(), phone }, hour, nextDay })} busy={busy}>
            Registrar y generar ticket
          </Button>
          <p style={{ fontSize: 12, color: ACCENT_DARK, margin: "8px 0 0" }}>
            El teléfono se pide una sola vez. Después queda oculto.
          </p>
        </div>
      )}

      {!canCreate && matches.length === 0 && (
        <p style={{ fontSize: 12, color: MUTED, textAlign: "center", padding: 12 }}>
          Aún no hay clientes. Escribe un nombre para registrar el primero.
        </p>
      )}

      {error && <p style={{ fontSize: 12, color: DANGER, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

function Panel({ onLogout }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("activos");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [servicesDraft, setServicesDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const [detailError, setDetailError] = useState("");
  const [banner, setBanner] = useState(null);
  const [loadError, setLoadError] = useState("");
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const { ok, status, data: d } = await api("data");
    if (status === 401) return onLogout();
    if (ok) { setData(d); setLoadError(""); }
    else setLoadError(d.error || "No se pudieron cargar los tickets.");
  }, [onLogout]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  async function createTicket(payload) {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      const { ok, data: d } = await api("create", "POST", payload);
      if (!ok) return d.error || "No se pudo generar el ticket.";
      setBanner(d.ticket);
      setCreating(false);
      await refresh();
      return null;
    } finally {
      busyRef.current = false;
    }
  }

  async function setStatus(id, status) {
    const { ok, data: d } = await api("status", "POST", { id, status });
    if (ok) {
      if (status === "lista" && d.ticket.client_phone) {
        openWhatsApp(d.ticket.client_phone, msgReady(d.ticket));
      }
      refresh();
    }
  }

  async function saveDetails(id) {
    setDetailError("");
    const raw = priceDraft.trim();
    if (raw !== "" && (Number.isNaN(Number(raw)) || Number(raw) < 0)) {
      return setDetailError("El precio debe ser un número válido (ej. 150 o 150.50).");
    }
    const { ok, data: d } = await api("details", "POST", {
      id,
      services: servicesDraft,
      price: raw === "" ? null : Number(raw),
    });
    if (ok) {
      setEditing(null);
      setServicesDraft("");
      setPriceDraft("");
      refresh();
    } else setDetailError(d.error || "No se pudo guardar.");
  }

  if (loadError) {
    return (
      <div style={{ ...card, padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <b style={{ color: DANGER }}>No se pudo conectar</b>
        <p style={{ fontSize: 14, color: MUTED }}>{loadError}</p>
        <Button onClick={refresh}>Reintentar</Button>
      </div>
    );
  }

  if (!data) return <Spinner />;

  const counts = {
    activos: data.tickets.filter((t) => t.status !== "entregado").length,
    proceso: data.tickets.filter((t) => t.status === "proceso").length,
    lista: data.tickets.filter((t) => t.status === "lista").length,
  };
  const list = data.tickets.filter((t) => {
    if (filter === "activos") return t.status !== "entregado";
    if (filter === "todos") return true;
    return t.status === filter;
  });

  const pill = (active) => ({
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${active ? ACCENT : LINE}`,
    background: active ? ACCENT : SURFACE,
    color: active ? "#fff" : MUTED,
  });

  const smallBtn = (bg, color) => ({
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    background: bg,
    color,
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, fontSize: 12, color: MUTED }}>
        <span>Horario: {BUSINESS_HOURS}</span>
        <span style={{ display: "flex", gap: 14 }}>
          <span>{data.clients.length} clientes</span>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: MUTED, fontSize: 12 }}>
            Salir
          </button>
        </span>
      </div>

      {banner && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>
                Ticket {banner.number} generado para {banner.client_name}
              </b>
              <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 12px" }}>
                Envía el número y el enlace al cliente, o entrégaselo en mano.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  onClick={() => openWhatsApp(banner.client_phone, msgCreated(banner))}
                  style={smallBtn(WHATSAPP, "#fff")}
                >
                  Enviar por WhatsApp
                </button>
                <CopyLink number={banner.number} />
              </div>
            </div>
            <button onClick={() => setBanner(null)} style={{ background: "none", border: "none", color: MUTED }}>✕</button>
          </div>
        </div>
      )}

      {creating ? (
        <NewTicket clients={data.clients} onCreate={createTicket} onCancel={() => setCreating(false)} />
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Button onClick={() => { setCreating(true); setBanner(null); }}>+ Nuevo ticket</Button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {[
          { k: "activos", label: `Activos (${counts.activos})` },
          { k: "proceso", label: `En proceso (${counts.proceso})` },
          { k: "lista", label: `Listos (${counts.lista})` },
          { k: "todos", label: "Todos" },
        ].map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={pill(filter === f.k)}>
            {f.label}
          </button>
        ))}
        <button onClick={refresh} style={{ ...pill(false), color: ACCENT_DARK, marginLeft: "auto" }}>
          Actualizar
        </button>
      </div>

      {list.length === 0 ? (
        <p style={{ textAlign: "center", color: MUTED, fontSize: 14, padding: 40 }}>
          No hay tickets en esta vista todavía.
        </p>
      ) : (
        list.map((t) => (
          <div key={t.id} style={{ ...card, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18, minWidth: 56 }}>{t.number}</b>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.client_name}</div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {t.status === "proceso"
                    ? `Entrega ${windowText(t.estimate_at)}${t.estimate_at ? ` · ${dayLabel(t.estimate_at)}` : ""}`
                    : t.ready_at
                      ? `Lista desde ${readyText(t.ready_at)}`
                      : "—"}
                </div>
              </div>
              <Badge status={t.status} />
              <div style={{ display: "flex", gap: 6 }}>
                {t.status === "proceso" && (
                  <button onClick={() => setStatus(t.id, "lista")} style={smallBtn(ACCENT, "#fff")}>
                    Marcar lista
                  </button>
                )}
                {t.status === "lista" && (
                  <>
                    <button
                      onClick={() => openWhatsApp(t.client_phone, msgReady(t))}
                      style={smallBtn(WHATSAPP, "#fff")}
                    >
                      Avisar
                    </button>
                    <button onClick={() => setStatus(t.id, "entregado")} style={smallBtn(SOFT, MUTED)}>
                      Entregada
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 10, paddingLeft: 2 }}>
              {editing === t.id ? (
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      autoFocus
                      value={servicesDraft}
                      onChange={(e) => setServicesDraft(e.target.value)}
                      placeholder="Servicios (ej. Lavado, planchado)"
                      onKeyDown={(e) => e.key === "Enter" && saveDetails(t.id)}
                      style={{ ...inputStyle, flex: 1, minWidth: 150, fontSize: 12, padding: "6px 10px" }}
                    />
                    <input
                      value={priceDraft}
                      onChange={(e) => setPriceDraft(e.target.value)}
                      placeholder="$0.00"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      onKeyDown={(e) => e.key === "Enter" && saveDetails(t.id)}
                      style={{ ...inputStyle, width: 100, fontSize: 12, padding: "6px 10px" }}
                    />
                    <button onClick={() => saveDetails(t.id)} style={smallBtn(ACCENT, "#fff")}>Guardar</button>
                    <button
                      onClick={() => { setEditing(null); setServicesDraft(""); setPriceDraft(""); setDetailError(""); }}
                      style={smallBtn(SOFT, MUTED)}
                    >
                      Cancelar
                    </button>
                  </div>
                  {detailError && <p style={{ fontSize: 12, color: DANGER, margin: "6px 0 0" }}>{detailError}</p>}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditing(t.id);
                    setServicesDraft(t.services || "");
                    setPriceDraft(t.price != null ? String(t.price) : "");
                    setDetailError("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 12,
                    fontWeight: t.services || t.price != null ? 400 : 600,
                    color: t.services || t.price != null ? MUTED : ACCENT_DARK,
                  }}
                >
                  {t.services || t.price != null
                    ? `${t.services || "Sin servicios"}${t.price != null ? ` · $${Number(t.price).toFixed(2)}` : ""}`
                    : "+ Llenar servicios y precio"}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CopyLink({ number }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const link = ticketLink(number);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", link);
    }
  }
  return (
    <button
      onClick={copy}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${LINE}`,
        background: SURFACE,
        color: ACCENT_DARK,
      }}
    >
      {copied ? "Copiado" : "Copiar enlace"}
    </button>
  );
}

/* ─────────── App ─────────── */

export default function Page() {
  const [view, setView] = useState("loading"); // loading | entry | summary | gate | staff
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const num = new URLSearchParams(window.location.search).get("ticket");
      if (num) {
        const { ok, data } = await api(`ticket&number=${encodeURIComponent(num)}`);
        if (ok && !cancel) {
          setTicket(data.ticket);
          setView("summary");
          return;
        }
      }
      if (!cancel) setView("entry");
    })();
    return () => { cancel = true; };
  }, []);

  async function enterStaff() {
    const { data } = await api("session");
    setView(data.authed ? "staff" : "gate");
  }

  async function logout() {
    await api("logout", "POST");
    setView("entry");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      {view === "loading" && <Spinner />}
      {view === "entry" && <ClientEntry onFound={(t) => { setTicket(t); setView("summary"); }} onStaff={enterStaff} />}
      {view === "summary" && ticket && <ClientSummary ticket={ticket} onExit={() => { setTicket(null); setView("entry"); }} />}
      {view === "gate" && <StaffGate onSuccess={() => setView("staff")} onBack={() => setView("entry")} />}
      {view === "staff" && <Panel onLogout={logout} />}
    </div>
  );
}
