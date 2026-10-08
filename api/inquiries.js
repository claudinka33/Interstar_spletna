// Seznam povpraševanj za admin.
const { send, fail, requireAuth, db, ensureTable } = require('./_lib');

const STATUSES = ['novo', 'v-obdelavi', 'ponudba-poslana', 'zakljuceno', 'zavrnjeno'];

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await ensureTable();
    const sql = db();

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, created_at, ime, telefon, email, kraj, storitev, sporocilo, status, opomba
                             FROM povprasevanja ORDER BY created_at DESC LIMIT 500`;
      return send(res, 200, { inquiries: rows, statuses: STATUSES });
    }

    if (req.method === 'PATCH') {
      const { id, status, opomba } = req.body || {};
      if (!id) return send(res, 400, { error: 'Manjka id' });
      if (status !== undefined && !STATUSES.includes(status)) return send(res, 400, { error: 'Neznan status' });
      if (status !== undefined) await sql`UPDATE povprasevanja SET status = ${status} WHERE id = ${id}`;
      if (opomba !== undefined) await sql`UPDATE povprasevanja SET opomba = ${String(opomba).slice(0, 2000)} WHERE id = ${id}`;
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return send(res, 400, { error: 'Manjka id' });
      await sql`DELETE FROM povprasevanja WHERE id = ${id}`;
      return send(res, 200, { ok: true });
    }

    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e);
  }
};
