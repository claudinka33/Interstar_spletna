// Prenos priloge povpraševanja (samo za prijavljene v admin).
const { send, fail, requireAuth, db, ensureTable } = require('./_lib');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = Number(req.query && req.query.id);
    if (!id) return send(res, 400, { error: 'Manjka id' });
    await ensureTable();
    const rows = await db()`SELECT ime, tip, vsebina FROM priloge WHERE id = ${id}`;
    if (!rows.length) return send(res, 404, { error: 'Priloga ne obstaja' });
    const f = rows[0];
    const buf = Buffer.from(f.vsebina, 'base64');
    res.status(200);
    res.setHeader('Content-Type', f.tip);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const disp = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disp}; filename*=UTF-8''${encodeURIComponent(f.ime)}`);
    res.end(buf);
  } catch (e) {
    fail(res, e);
  }
};
