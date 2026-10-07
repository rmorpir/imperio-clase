// Servidor de la partida de clase (Netlify Functions v2 + Netlify Blobs).
// Diseño sin conflictos de escritura: cada jugador escribe SOLO su ficha; las acciones entre jugadores viajan
// como mensajes con clave única en la bandeja de entrada del destinatario, y es el destinatario quien aplica los cambios a sus recursos.
export const config = { path: "/api" };

const ONLINE_MS = 25000;
const MAX_PLAYERS = 60;
const RES = ["food", "wood", "stone", "gold"];
const RAID_COOLDOWN = 60000, RAID_DEADLINE = 45000, PROTECT_MS = 150000, RAID_STALE = 10 * 60000;
const GIFT_MAX = 150, GIFT_PER_MIN = 4, LOOT_MAX = 400;

let _store = null;
async function store() {
  if (globalThis.__IMPERIO_STORE__) return globalThis.__IMPERIO_STORE__;       // pruebas
  if (_store) return _store;
  const { getStore } = await import("@netlify/blobs");
  _store = getStore({ name: "imperio-aula", consistency: "strong" });
  return _store;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);
const now = () => (globalThis.__NOW__ ? globalThis.__NOW__() : Date.now());
const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(now()));
function cleanCode(c) { c = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return c.length >= 3 && c.length <= 10 ? c : null; }
function cleanName(n) { n = String(n || "").replace(/[\u0000-\u001f<>&"`]/g, "").trim().replace(/\s+/g, " "); return n.length >= 2 && n.length <= 16 ? n : null; }
const num = (v, lo, hi) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
async function pinHash(code, name, pin) {
  const d = new TextEncoder().encode("elementia|" + code + "|" + name.toLowerCase() + "|" + pin);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", d))).map(b => b.toString(16).padStart(2, "0")).join("");
}
const cleanPin = p => { p = String(p || "").replace(/\D/g, ""); return p.length === 4 ? p : null; };
function cleanPub(p) {
  p = p || {}; const res = {};
  for (const k of RES) res[k] = num(p.res && p.res[k], 0, 1e6);
  return { score: num(p.score, 0, 1e7), age: num(p.age, 1, 6), mastered: num(p.mastered, 0, 1e5), pop: num(p.pop, 0, 200), streak: num(p.streak, 0, 1e4), prot: num(p.prot, 0, 4e12), res };
}
const K = {
  p: (c, id) => `r/${c}/p/${id}`, pl: c => `r/${c}/p/`, i: (c, id, m) => `r/${c}/i/${id}/${m}`, il: (c, id) => `r/${c}/i/${id}/`,
  raid: (c, v, r) => `r/${c}/raid/${v}/${r}`, raidl: (c, v) => `r/${c}/raid/${v}/`, prot: (c, id) => `r/${c}/prot/${id}`, cool: (c, id) => `r/${c}/cool/${id}`, gift: (c, id) => `r/${c}/gift/${id}`, save: (c, id) => `r/${c}/save/${id}`,
};
async function getJ(s, k) { return await s.get(k, { type: "json" }); }
async function listKeys(s, prefix) { const r = await s.list({ prefix }); return (r.blobs || []).map(b => b.key); }
async function auth(s, code, pid, token) {
  if (!code || !pid || !token) return null;
  const p = await getJ(s, K.p(code, String(pid).slice(0, 60)));
  return p && p.token === token ? p : null;
}
let rosterCache = {};
async function roster(s, code, force) {
  const t = now(), c = rosterCache[code];
  if (!force && c && t - c.t < 2500) return c.v;
  const keys = await listKeys(s, K.pl(code));
  const ps = (await Promise.all(keys.map(k => getJ(s, k)))).filter(Boolean).map(p => ({ pid: p.pid, name: p.name, seen: p.seen, ...p.pub, slot: p.slot | 0, online: t - p.seen < ONLINE_MS }));
  ps.sort((a, b) => b.score - a.score);
  rosterCache[code] = { t, v: ps };
  return ps;
}
const dropCache = code => { delete rosterCache[code]; };

async function op_join(s, b) {
  const code = cleanCode(b.code), name = cleanName(b.name), pin = cleanPin(b.pin);
  if (!code) return bad("Código de clase no válido (3 a 10 letras o números).");
  if (!name) return bad("Escribe un nombre de 2 a 16 caracteres.");
  const keys = await listKeys(s, K.pl(code));
  const all = (await Promise.all(keys.map(k => getJ(s, k)))).filter(Boolean);
  const same = all.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (same) {
    if (b.token && same.token === b.token) return json({ ok: true, pid: same.pid, token: same.token, slot: same.slot | 0, resumed: true });
    if (pin && same.pinHash && same.pinHash === await pinHash(code, name, pin)) return json({ ok: true, pid: same.pid, token: same.token, slot: same.slot | 0, resumed: true });
    return bad(pin ? "Ese nombre ya existe en esta clase y el PIN no coincide." : "Ese nombre ya existe en esta clase. Para continuar en otro dispositivo escribe tu PIN de 4 cifras.");
  }
  if (all.length >= MAX_PLAYERS) return bad("La clase está llena.");
  if (!pin) return bad("Elige un PIN de 4 cifras: te permitirá recuperar tu ciudad otro día o en otro dispositivo.");
  const pid = uid().slice(0, 12), token = uid(), slot = all.reduce((m, p) => Math.max(m, (p.slot | 0) + 1), 0);
  await s.setJSON(K.p(code, pid), { pid, token, name, slot, pinHash: await pinHash(code, name, pin), seen: now(), created: now(), pub: cleanPub({ age: 1 }) });
  dropCache(code);
  return json({ ok: true, pid, token, slot });
}
async function op_sync(s, b) {
  const code = cleanCode(b.code); const me = await auth(s, code, b.pid, b.token);
  if (!me) return bad("Sesión no válida. Vuelve a unirte a la clase.", 401);
  me.seen = now(); me.pub = cleanPub(b.pub);
  await s.setJSON(K.p(code, me.pid), me);
  for (const id of (Array.isArray(b.ack) ? b.ack : []).slice(0, 50)) await s.delete(K.i(code, me.pid, String(id).replace(/[^\w-]/g, "")));
  const keys = (await listKeys(s, K.il(code, me.pid))).slice(0, 30);
  const inbox = (await Promise.all(keys.map(k => getJ(s, k)))).filter(Boolean);
  const players = await roster(s, code, false);
  return json({ ok: true, now: now(), players, inbox });
}
async function put(s, code, to, msg) { const id = uid(); const m = { ...msg, id, at: now() }; await s.setJSON(K.i(code, to, id), m); return m; }

async function op_send(s, b) {
  const code = cleanCode(b.code); const me = await auth(s, code, b.pid, b.token);
  if (!me) return bad("Sesión no válida. Vuelve a unirte a la clase.", 401);
  const m = b.msg || {}, t = now();
  if (m.type === "raid") {
    const toPid = String(m.to || "");
    if (toPid === me.pid) return bad("No puedes atacarte a ti mismo.");
    const victim = await getJ(s, K.p(code, toPid));
    if (!victim) return bad("Jugador no encontrado.");
    if (t - victim.seen > ONLINE_MS) return bad("Ese jugador no está conectado ahora mismo.");
    const cool = await getJ(s, K.cool(code, me.pid));
    if (cool && t - cool.at < RAID_COOLDOWN) return bad("Espera un poco antes de atacar de nuevo (" + Math.ceil((RAID_COOLDOWN - (t - cool.at)) / 1000) + " s).");
    const prot = await getJ(s, K.prot(code, toPid));
    if (prot && prot.until > t) return bad("Ese jugador está protegido unos minutos.");
    const pend = await listKeys(s, K.raidl(code, toPid));
    for (const k of pend) { const r = await getJ(s, k); if (r && t - r.at < RAID_STALE) return bad("Ese jugador ya está siendo atacado."); }
    const raidId = uid().slice(0, 12);
    await s.setJSON(K.raid(code, toPid, raidId), { raidId, from: me.pid, fromName: me.name, at: t, deadline: t + RAID_DEADLINE });
    await s.setJSON(K.cool(code, me.pid), { at: t });
    await put(s, code, toPid, { type: "raid", raidId, from: me.pid, fromName: me.name, deadline: t + RAID_DEADLINE });
    return json({ ok: true });
  }
  if (m.type === "raid_resolve") {
    const r = await getJ(s, K.raid(code, me.pid, String(m.raidId || "")));
    if (!r) return bad("Ataque no encontrado (ya resuelto).");
    const loot = {}; for (const k of RES) loot[k] = num(m.loot && m.loot[k], 0, LOOT_MAX);
    await s.delete(K.raid(code, me.pid, r.raidId));
    await s.setJSON(K.prot(code, me.pid), { until: t + PROTECT_MS });
    await put(s, code, r.from, { type: "loot", fromName: me.name, defended: !!m.defended, loot });
    return json({ ok: true, prot: t + PROTECT_MS });
  }
  if (m.type === "gift") {
    const toPid = String(m.to || "");
    if (toPid === me.pid) return bad("No puedes regalarte recursos a ti mismo.");
    const to = await getJ(s, K.p(code, toPid)); if (!to) return bad("Jugador no encontrado.");
    const g = (await getJ(s, K.gift(code, me.pid))) || { times: [] };
    g.times = g.times.filter(x => t - x < 60000);
    if (g.times.length >= GIFT_PER_MIN) return bad("Demasiados regalos seguidos. Espera un momento.");
    const res = {}; let tot = 0;
    for (const k of RES) {
      const raw = Math.floor(Number(m.res && m.res[k]) || 0);
      if (raw < 0 || raw > GIFT_MAX) return bad("Cantidad no permitida (máx. " + GIFT_MAX + ").");
      if (raw > (me.pub.res[k] || 0)) return bad("No tienes tantos recursos.");
      res[k] = raw; tot += raw;
    }
    if (tot <= 0) return bad("Elige una cantidad.");
    g.times.push(t); await s.setJSON(K.gift(code, me.pid), g);
    await put(s, code, toPid, { type: "gift", fromName: me.name, res });
    return json({ ok: true });
  }
  return bad("Mensaje desconocido.");
}
const SAVE_MAX = 900000;
async function op_save(s, b) {
  const code = cleanCode(b.code); const me = await auth(s, code, b.pid, b.token);
  if (!me) return bad("Sesión no válida. Vuelve a unirte a la clase.", 401);
  if (typeof b.data !== "string" || b.data.length < 10 || b.data.length > SAVE_MAX) return bad("Partida demasiado grande o vacía.");
  await s.setJSON(K.save(code, me.pid), { at: now(), data: b.data });
  return json({ ok: true, at: now() });
}
async function op_load(s, b) {
  const code = cleanCode(b.code); const me = await auth(s, code, b.pid, b.token);
  if (!me) return bad("Sesión no válida. Vuelve a unirte a la clase.", 401);
  const v = await getJ(s, K.save(code, me.pid));
  return json({ ok: true, at: v ? v.at : 0, data: v ? v.data : null });
}
async function op_roster(s, b) {
  const code = cleanCode(b.code); if (!code) return bad("Código no válido.");
  return json({ ok: true, now: now(), players: await roster(s, code, true) });
}

export default async (req) => {
  if (req.method !== "POST") return bad("Método no permitido.", 405);
  let b; try { b = await req.json(); } catch { return bad("Petición no válida."); }
  try {
    const s = await store();
    if (b.op === "join") return await op_join(s, b);
    if (b.op === "sync") return await op_sync(s, b);
    if (b.op === "send") return await op_send(s, b);
    if (b.op === "save") return await op_save(s, b);
    if (b.op === "load") return await op_load(s, b);
    if (b.op === "roster") return await op_roster(s, b);
    return bad("Operación desconocida.");
  } catch (e) { return json({ ok: false, error: "Error del servidor." }, 500); }
};
