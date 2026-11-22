// Iron Pulse Gym API — Cloudflare Pages Function backed by a D1 database (binding: DB).
// Owner logs in with OWNER_PIN (a Pages secret). Members log in with a one-tap link or phone + PIN.

const IST_OFFSET = 330 * 60000; // India Standard Time, UTC+5:30
const STALE_MS = 6 * 3600000; // an open check-in older than this is treated as forgotten
const MAX_FAILS = 10; // failed logins allowed per 15 minutes, per IP and per phone

export async function onRequest({ request, env, params }) {
  const path = '/' + [].concat(params.path || []).join('/');
  try {
    if (!env.DB) return json({ error: 'Database is not connected. See README → Member portal setup.' }, 500);
    return await route(request, env, path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/* ---------- dates (all calendar dates are India time) ---------- */
const today = () => new Date(Date.now() + IST_OFFSET).toISOString().slice(0, 10);
const istDate = (iso) => new Date(Date.parse(iso) + IST_OFFSET).toISOString().slice(0, 10);
const istHour = (iso) => new Date(Date.parse(iso) + IST_OFFSET).getUTCHours();
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const addMonths = (d, n) => {
  const t = new Date(d + 'T00:00:00Z'), day = t.getUTCDate();
  t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));

/* ---------- helpers ---------- */
const cleanPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const rand = (n, chars) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => chars[x % chars.length]).join(''); };
const newPin = () => rand(4, '0123456789');
const newToken = () => rand(32, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789');
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const ownerToken = async (env) => 'o.' + (await hmac(String(env.OWNER_PIN), 'iron-pulse-owner-v1'));
const body = async (req) => { try { return await req.json(); } catch { return {}; } };
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();

async function throttle(env, keys) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  for (const k of keys) {
    const r = await one(env, 'SELECT COUNT(*) n FROM failed_logins WHERE key=? AND at>?', k, since);
    if (r.n >= MAX_FAILS) fail(429, 'Too many wrong attempts. Please wait 15 minutes.');
  }
}
async function recordFail(env, keys) {
  const now = new Date().toISOString();
  await env.DB.batch(keys.map((k) => env.DB.prepare('INSERT INTO failed_logins(key,at) VALUES(?,?)').bind(k, now)));
  await run(env, 'DELETE FROM failed_logins WHERE at<?', new Date(Date.now() - 86400000).toISOString());
}

function status(m, t = today()) {
  const left = daysBetween(t, m.end_date);
  return { days_left: left, status: left < 0 ? 'expired' : left <= 7 ? 'expiring' : 'active' };
}
const publicMember = (m) => ({
  id: m.id, name: m.name, phone: m.phone, plan: m.plan, batch: m.batch, start_date: m.start_date,
  end_date: m.end_date, notes: m.notes, created_at: m.created_at, ...status(m),
});

/* ---------- attendance ---------- */
async function openSession(env, memberId) {
  return one(env, 'SELECT * FROM attendance WHERE member_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1', memberId);
}
async function checkIn(env, m) {
  const open = await openSession(env, m.id);
  if (open) {
    if (Date.now() - Date.parse(open.check_in) < STALE_MS) return open;
    // forgot to check out last time: close it with an estimated 90-minute workout
    await run(env, 'UPDATE attendance SET check_out=? WHERE id=?', new Date(Date.parse(open.check_in) + 90 * 60000).toISOString(), open.id);
  }
  const now = new Date().toISOString();
  const r = await run(env, 'INSERT INTO attendance(member_id,check_in) VALUES(?,?)', m.id, now);
  return { id: r.meta.last_row_id, member_id: m.id, check_in: now, check_out: null };
}
async function checkOut(env, m) {
  const open = await openSession(env, m.id);
  if (!open) fail(400, 'You are not checked in.');
  const now = Date.now(), cap = Date.parse(open.check_in) + STALE_MS;
  const out = new Date(Math.min(now, cap)).toISOString();
  await run(env, 'UPDATE attendance SET check_out=? WHERE id=?', out, open.id);
  return { ...open, check_out: out };
}
const minutes = (a) => a.check_out ? Math.max(0, Math.round((Date.parse(a.check_out) - Date.parse(a.check_in)) / 60000)) : null;

function memberStats(att, t = today()) {
  const days = new Set(att.map((a) => istDate(a.check_in)));
  const month = t.slice(0, 7);
  const weekStart = addDays(t, -((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7)); // Monday
  let streak = 0, d = days.has(t) ? t : addDays(t, -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  const done = att.filter((a) => a.check_out).map(minutes);
  const week = [];
  for (let i = 0; i < 7; i++) { const day = addDays(weekStart, i); week.push({ date: day, visited: days.has(day) }); }
  const hours = att.map((a) => istHour(a.check_in));
  const usual = hours.length ? hours.sort((a, b) => a - b)[Math.floor(hours.length / 2)] : null;
  return {
    visits_this_month: [...days].filter((x) => x.startsWith(month)).length,
    visits_this_week: week.filter((w) => w.visited).length,
    visits_total: days.size,
    streak,
    avg_minutes: done.length ? Math.round(done.reduce((s, x) => s + x, 0) / done.length) : null,
    usual_hour: usual,
    week,
    last_visit: att[0] ? att[0].check_in : null,
  };
}

/* ---------- auth ---------- */
async function auth(req, env) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (tok.startsWith('o.') && env.OWNER_PIN && tok === (await ownerToken(env))) return { role: 'owner' };
  if (tok.startsWith('m.')) {
    const m = await one(env, 'SELECT * FROM members WHERE token=?', tok.slice(2));
    if (m) return { role: 'member', member: m };
  }
  fail(401, 'Please log in again.');
}

/* ---------- routes ---------- */
async function route(req, env, path) {
  const M = req.method;
  const ip = req.headers.get('cf-connecting-ip') || 'local';

  if (M === 'POST' && path === '/login/owner') {
    if (!env.OWNER_PIN) fail(500, 'Owner PIN is not set yet. See README → Member portal setup.');
    await throttle(env, ['ip:' + ip]);
    const { pin } = await body(req);
    if (String(pin || '') !== String(env.OWNER_PIN)) { await recordFail(env, ['ip:' + ip]); fail(401, 'Wrong owner PIN.'); }
    return json({ role: 'owner', token: await ownerToken(env) });
  }

  // Test mode: one tap logs in without a PIN. On only while the DEMO_LOGIN setting is "1".
  if (M === 'POST' && path === '/login/demo') {
    if (env.DEMO_LOGIN !== '1') fail(403, 'Test login is turned off.');
    const { role } = await body(req);
    if (role === 'owner') {
      if (!env.OWNER_PIN) fail(500, 'Owner PIN is not set yet.');
      return json({ role: 'owner', token: await ownerToken(env) });
    }
    const m = await one(env, "SELECT * FROM members WHERE notes='TEST MEMBER' ORDER BY id LIMIT 1")
      || await one(env, 'SELECT * FROM members ORDER BY id LIMIT 1');
    if (!m) fail(404, 'No members yet.');
    return json({ role: 'member', token: 'm.' + m.token, name: m.name });
  }

  if (M === 'POST' && path === '/login/member') {
    const b = await body(req);
    if (b.key) { // one-tap link
      const m = await one(env, 'SELECT * FROM members WHERE token=?', String(b.key));
      if (!m) fail(401, 'This login link is no longer valid. Ask the gym for a new one.');
      return json({ role: 'member', token: 'm.' + m.token, name: m.name });
    }
    const phone = cleanPhone(b.phone);
    await throttle(env, ['ip:' + ip, 'ph:' + phone]);
    const m = await one(env, 'SELECT * FROM members WHERE phone=?', phone);
    if (!m || String(b.pin || '') !== m.pin) { await recordFail(env, ['ip:' + ip, 'ph:' + phone]); fail(401, 'Phone number or PIN is wrong.'); }
    return json({ role: 'member', token: 'm.' + m.token, name: m.name });
  }

  const who = await auth(req, env);

  /* ----- member ----- */
  if (path.startsWith('/me')) {
    if (who.role !== 'member') fail(403, 'Members only.');
    const m = who.member;
    if (M === 'POST' && path === '/me/checkin') {
      if (status(m).status === 'expired') fail(403, 'Your membership has expired. Please renew at the desk or on WhatsApp.');
      await checkIn(env, m); return json(await memberView(env, m));
    }
    if (M === 'POST' && path === '/me/checkout') { await checkOut(env, m); return json(await memberView(env, m)); }
    if (M === 'GET' && path === '/me') return json(await memberView(env, m));
  }

  /* ----- owner ----- */
  if (path.startsWith('/owner')) {
    if (who.role !== 'owner') fail(403, 'Owner only.');
    if (M === 'GET' && path === '/owner/overview') return json(await overview(env));
    if (M === 'POST' && path === '/owner/members') return json(await addMember(env, await body(req)));
    const mm = path.match(/^\/owner\/members\/(\d+)(\/[a-z-]+)?$/);
    if (mm) {
      const m = await one(env, 'SELECT * FROM members WHERE id=?', +mm[1]);
      if (!m) fail(404, 'Member not found.');
      const act = mm[2] || '';
      if (M === 'GET' && !act) return json(await ownerMemberView(env, m));
      if (M === 'PATCH' && !act) return json(await editMember(env, m, await body(req)));
      if (M === 'DELETE' && !act) { await env.DB.batch([
        env.DB.prepare('DELETE FROM attendance WHERE member_id=?').bind(m.id),
        env.DB.prepare('DELETE FROM payments WHERE member_id=?').bind(m.id),
        env.DB.prepare('DELETE FROM members WHERE id=?').bind(m.id)]); return json({ ok: true }); }
      if (M === 'POST' && act === '/renew') return json(await renew(env, m, await body(req)));
      if (M === 'POST' && act === '/checkin') { await checkIn(env, m); return json(await ownerMemberView(env, m)); }
      if (M === 'POST' && act === '/checkout') { await checkOut(env, m); return json(await ownerMemberView(env, m)); }
      if (M === 'POST' && act === '/reset-login') {
        await run(env, 'UPDATE members SET pin=?, token=? WHERE id=?', newPin(), newToken(), m.id);
        return json(await ownerMemberView(env, await one(env, 'SELECT * FROM members WHERE id=?', m.id)));
      }
    }
  }
  fail(404, 'Not found.');
}

async function memberView(env, m) {
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const att = await all(env, 'SELECT * FROM attendance WHERE member_id=? AND check_in>? ORDER BY check_in DESC', m.id, since);
  const pays = await all(env, 'SELECT * FROM payments WHERE member_id=? ORDER BY paid_on DESC, id DESC', m.id);
  const open = att.find((a) => !a.check_out && Date.now() - Date.parse(a.check_in) < STALE_MS) || null;
  return {
    member: publicMember(m),
    inside: open,
    stats: memberStats(att),
    attendance: att.slice(0, 60).map((a) => ({ ...a, minutes: minutes(a) })),
    payments: pays,
    today: today(),
  };
}
async function ownerMemberView(env, m) {
  const v = await memberView(env, m);
  v.member.pin = m.pin;
  v.member.login_key = m.token;
  return v;
}

function readMember(b, partial) {
  const out = {};
  if (!partial || 'name' in b) { out.name = String(b.name || '').trim().slice(0, 80); if (!out.name) fail(400, 'Name is required.'); }
  if (!partial || 'phone' in b) { out.phone = cleanPhone(b.phone); if (out.phone.length !== 10) fail(400, 'Enter a 10-digit phone number.'); }
  if (!partial || 'plan' in b) out.plan = String(b.plan || 'Basic').slice(0, 40);
  if (!partial || 'batch' in b) out.batch = String(b.batch || 'Evening').slice(0, 40);
  if ('notes' in b) out.notes = String(b.notes || '').slice(0, 500);
  if ('end_date' in b) { if (!isDate(b.end_date)) fail(400, 'Invalid end date.'); out.end_date = b.end_date; }
  return out;
}
async function addMember(env, b) {
  const f = readMember(b);
  const start = isDate(b.start_date) ? b.start_date : today();
  const months = Math.max(1, Math.min(36, parseInt(b.months, 10) || 1));
  const end = addDays(addMonths(start, months), -1);
  const amount = Math.max(0, parseInt(b.amount, 10) || 0);
  if (await one(env, 'SELECT id FROM members WHERE phone=?', f.phone)) fail(409, 'A member with this phone number already exists.');
  const r = await run(env, 'INSERT INTO members(name,phone,plan,batch,start_date,end_date,pin,token,notes) VALUES(?,?,?,?,?,?,?,?,?)',
    f.name, f.phone, f.plan, f.batch, start, end, newPin(), newToken(), f.notes || '');
  const id = r.meta.last_row_id;
  if (amount) await run(env, 'INSERT INTO payments(member_id,amount,months,plan,paid_on,note) VALUES(?,?,?,?,?,?)', id, amount, months, f.plan, today(), 'New membership');
  return ownerMemberView(env, await one(env, 'SELECT * FROM members WHERE id=?', id));
}
async function editMember(env, m, b) {
  const f = readMember(b, true);
  if (f.phone && f.phone !== m.phone && (await one(env, 'SELECT id FROM members WHERE phone=?', f.phone))) fail(409, 'Another member has this phone number.');
  const keys = Object.keys(f);
  if (keys.length) await run(env, `UPDATE members SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => f[k]), m.id);
  return ownerMemberView(env, await one(env, 'SELECT * FROM members WHERE id=?', m.id));
}
async function renew(env, m, b) {
  const months = Math.max(1, Math.min(36, parseInt(b.months, 10) || 1));
  const amount = Math.max(0, parseInt(b.amount, 10) || 0);
  const plan = String(b.plan || m.plan).slice(0, 40);
  const t = today();
  const from = m.end_date >= t ? addDays(m.end_date, 1) : t; // continue an active plan, restart an expired one
  const end = addDays(addMonths(from, months), -1);
  await env.DB.batch([
    env.DB.prepare('UPDATE members SET end_date=?, plan=?, start_date=CASE WHEN end_date<? THEN ? ELSE start_date END WHERE id=?').bind(end, plan, t, t, m.id),
    env.DB.prepare('INSERT INTO payments(member_id,amount,months,plan,paid_on,note) VALUES(?,?,?,?,?,?)').bind(m.id, amount, months, plan, t, 'Renewal'),
  ]);
  return ownerMemberView(env, await one(env, 'SELECT * FROM members WHERE id=?', m.id));
}

async function overview(env) {
  const t = today();
  const members = await all(env, 'SELECT * FROM members ORDER BY name COLLATE NOCASE');
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const att = await all(env, 'SELECT a.*, m.name FROM attendance a JOIN members m ON m.id=a.member_id WHERE a.check_in>? ORDER BY a.check_in DESC', since30);
  const lastVisit = Object.fromEntries((await all(env, 'SELECT member_id, MAX(check_in) last FROM attendance GROUP BY member_id')).map((r) => [r.member_id, r.last]));
  const month = t.slice(0, 7);
  const revenue = await one(env, "SELECT COALESCE(SUM(amount),0) total, COUNT(*) n FROM payments WHERE substr(paid_on,1,7)=?", month);
  const recentPays = await all(env, 'SELECT p.*, m.name FROM payments p JOIN members m ON m.id=p.member_id ORDER BY p.paid_on DESC, p.id DESC LIMIT 15');

  const monthVisits = {};
  for (const a of att) if (istDate(a.check_in).startsWith(month)) (monthVisits[a.member_id] ||= new Set()).add(istDate(a.check_in));

  const list = members.map((m) => ({
    ...publicMember(m),
    last_visit: lastVisit[m.id] || null,
    days_since_visit: lastVisit[m.id] ? daysBetween(istDate(lastVisit[m.id]), t) : null,
    visits_this_month: monthVisits[m.id] ? monthVisits[m.id].size : 0,
  }));
  const now = Date.now();
  const inside = att.filter((a) => !a.check_out && now - Date.parse(a.check_in) < STALE_MS)
    .map((a) => ({ id: a.id, member_id: a.member_id, name: a.name, check_in: a.check_in }));
  const todayLog = att.filter((a) => istDate(a.check_in) === t).map((a) => ({ ...a, minutes: minutes(a) }));

  const hours = Array(24).fill(0);
  for (const a of att) hours[istHour(a.check_in)]++;
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(t, -i);
    daily.push({ date: d, visits: new Set(att.filter((a) => istDate(a.check_in) === d).map((a) => a.member_id)).size });
  }
  const active = list.filter((m) => m.status !== 'expired');
  return {
    today: t,
    counts: {
      members: list.length,
      active: active.length,
      inside: inside.length,
      today_visits: new Set(todayLog.map((a) => a.member_id)).size,
      expiring: list.filter((m) => m.status === 'expiring').length,
      expired: list.filter((m) => m.status === 'expired').length,
      revenue_month: revenue.total,
      payments_month: revenue.n,
      new_this_month: list.filter((m) => (m.created_at || '').startsWith(month)).length,
    },
    inside,
    today_log: todayLog,
    expiring: list.filter((m) => m.status === 'expiring').sort((a, b) => a.days_left - b.days_left),
    expired: list.filter((m) => m.status === 'expired' && m.days_left >= -60).sort((a, b) => b.days_left - a.days_left),
    inactive: active.filter((m) => m.days_since_visit === null || m.days_since_visit >= 7)
      .sort((a, b) => (b.days_since_visit ?? 999) - (a.days_since_visit ?? 999)),
    members: list,
    hours,
    daily,
    payments: recentPays,
  };
}
