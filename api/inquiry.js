// Javni obrazec za povpraševanje s spletne strani.
const crypto = require('crypto');
const { send, fail, db, ensureTable } = require('./_lib');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function notify(row) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // e-mail obvestila še niso nastavljena
  const to = (process.env.NOTIFY_EMAIL || 'interstar.doo@gmail.com').split(',').map((s) => s.trim());
  const from = process.env.MAIL_FROM || 'Interstar spletna stran <onboarding@resend.dev>';
  const rows = [
    ['Ime', row.ime],
    ['Telefon', row.telefon],
    ['E-mail', row.email],
    ['Kraj', row.kraj],
    ['Storitev', row.storitev],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#666">${k}</td><td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">
    <div style="background:#0A0A0A;color:#FFD400;padding:16px 20px;font-weight:bold;font-size:18px">Novo povpraševanje – interstar.si</div>
    <div style="padding:20px;border:1px solid #eee">
      <table>${rows}</table>
      <p style="margin-top:16px;white-space:pre-wrap">${esc(row.sporocilo)}</p>
      <p style="margin-top:24px"><a href="https://interstar.si/admin" style="background:#FFD400;color:#000;padding:10px 18px;text-decoration:none;font-weight:bold">Odpri v adminu</a></p>
    </div></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      reply_to: row.email || undefined,
      subject: `Novo povpraševanje: ${row.ime}${row.storitev ? ' – ' + row.storitev : ''}`,
      html,
    }),
  });
  if (!r.ok) console.error('Resend napaka', r.status, await r.text());
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const b = req.body || {};
    // zaščita pred spamom: skrito polje + prehitro oddan obrazec
    if (b.website) return send(res, 200, { ok: true });
    if (b.t && Date.now() - Number(b.t) < 3000) return send(res, 200, { ok: true });

    const str = (v, max) => String(v ?? '').trim().slice(0, max);
    const row = {
      ime: str(b.ime, 120),
      telefon: str(b.telefon, 40),
      email: str(b.email, 160),
      kraj: str(b.kraj, 120),
      storitev: str(b.storitev, 80),
      sporocilo: str(b.sporocilo, 4000),
      stran: str(b.stran, 200),
    };
    if (!row.ime) return send(res, 400, { error: 'Vpišite ime in priimek.' });
    if (!row.telefon && !row.email) return send(res, 400, { error: 'Vpišite telefon ali e-mail, da vas lahko pokličemo.' });
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return send(res, 400, { error: 'E-mail naslov ni pravilen.' });
    if (!row.sporocilo) return send(res, 400, { error: 'Na kratko opišite, kaj potrebujete.' });
    if (!b.soglasje) return send(res, 400, { error: 'Potrdite strinjanje s politiko zasebnosti.' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ipHash = ip ? crypto.createHash('sha256').update(ip + (process.env.ADMIN_PASSWORD || '')).digest('hex').slice(0, 16) : null;

    await ensureTable();
    const sql = db();
    if (ipHash) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM povprasevanja WHERE ip_hash = ${ipHash} AND created_at > now() - interval '15 minutes'`;
      if (n >= 5) return send(res, 429, { error: 'Preveč poskusov. Pokličite nas na 041 624 728.' });
    }
    await sql`INSERT INTO povprasevanja (ime, telefon, email, kraj, storitev, sporocilo, stran, ip_hash)
              VALUES (${row.ime}, ${row.telefon}, ${row.email}, ${row.kraj}, ${row.storitev}, ${row.sporocilo}, ${row.stran}, ${ipHash})`;

    try {
      await notify(row);
    } catch (e) {
      console.error('Obvestilo ni bilo poslano', e);
    }
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, new Error('Pošiljanje ni uspelo. Pokličite nas na 041 624 728.'));
    console.error(e);
  }
};
