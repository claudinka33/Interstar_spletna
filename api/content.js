const { send, fail, requireAuth, readFile, commit } = require('./_lib');
const { extractFields, applyFields } = require('./_cms');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const html = await readFile('index.html');
    if (!html) throw new Error('index.html ni najden na GitHubu');

    if (req.method === 'GET') return send(res, 200, { fields: extractFields(html) });

    if (req.method === 'POST') {
      const values = (req.body && req.body.values) || {};
      const changed = Object.keys(values);
      if (!changed.length) return send(res, 200, { ok: true, unchanged: true });
      const next = applyFields(html, values);
      if (next === html) return send(res, 200, { ok: true, unchanged: true });
      const sha = await commit([{ path: 'index.html', text: next }], `CMS: posodobljena besedila (${changed.length})`);
      return send(res, 200, { ok: true, commit: sha });
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e, /mora biti/.test(e.message) ? 400 : 500);
  }
};
