const { send, fail, isAuthed, makeSession, setSessionCookie, passwordOk } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return send(res, 200, { authed: isAuthed(req) });
    if (req.method === 'DELETE') {
      setSessionCookie(res, '', 0);
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const { password } = req.body || {};
    if (!passwordOk(password)) {
      await new Promise((r) => setTimeout(r, 800)); // upočasni ugibanje
      return send(res, 401, { error: 'Napačno geslo' });
    }
    setSessionCookie(res, makeSession(), 14 * 86400);
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
};
