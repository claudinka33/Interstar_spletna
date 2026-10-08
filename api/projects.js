const crypto = require('crypto');
const { send, fail, requireAuth, readFile, commit } = require('./_lib');
const { renderHomeSection, renderAllGrid, replaceBetween } = require('./_cms');

const IMG_DIR = 'images/projekti';
const isOwn = (u) => typeof u === 'string' && u.startsWith('/images/');
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

function slug(s) {
  return String(s || 'projekt')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'projekt';
}

function clean(p) {
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const date = /^\d{4}-\d{2}$/.test(p.date || '') ? p.date : '';
  return {
    title: str(p.title, 120),
    category: str(p.category, 60),
    location: str(p.location, 80),
    date,
    status: p.status === 'v-teku' ? 'v-teku' : 'zakljuceno',
    description: str(p.description, 2000),
  };
}

async function loadProjects() {
  const raw = await readFile('data/projects.json');
  return raw ? JSON.parse(raw) : [];
}

// Pripravi vse datoteke, ki se spremenijo, ko se seznam projektov spremeni.
async function renderedFiles(projects) {
  const [index, page] = await Promise.all([readFile('index.html'), readFile('projekti.html')]);
  return [
    { path: 'data/projects.json', text: JSON.stringify(projects, null, 2) + '\n' },
    { path: 'index.html', text: replaceBetween(index, 'PROJEKTI', renderHomeSection(projects)) },
    { path: 'projekti.html', text: replaceBetween(page, 'PROJEKTI-VSI', renderAllGrid(projects)) },
  ];
}

// Prenese slike s tujih strežnikov (npr. stari CDN) v repozitorij.
async function importExternal(projects) {
  const files = [];
  let count = 0;
  for (const p of projects) {
    const imgs = [];
    for (const u of p.images || []) {
      if (!/^https?:\/\//.test(u)) { imgs.push(u); continue; }
      const r = await fetch(u);
      if (!r.ok) throw new Error(`Slike ni bilo mogoče prenesti: ${u} (${r.status})`);
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = (u.match(/\.(jpe?g|png|webp)(\?|$)/i) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg');
      const path = `${IMG_DIR}/${p.id}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
      files.push({ path, base64: buf.toString('base64') });
      imgs.push('/' + path);
      count++;
    }
    p.images = imgs;
  }
  return { files, count };
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const projects = await loadProjects();

    if (req.method === 'GET') return send(res, 200, { projects });

    if (req.method === 'POST') {
      const body = req.body || {};

      // vrstni red
      if (body.action === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const byId = new Map(projects.map((p) => [p.id, p]));
        const next = ids.filter((i) => byId.has(i)).map((i) => byId.get(i));
        projects.forEach((p) => { if (!ids.includes(p.id)) next.push(p); });
        const sha = await commit(await renderedFiles(next), 'CMS: spremenjen vrstni red projektov');
        return send(res, 200, { ok: true, projects: next, commit: sha });
      }

      // prenos slik s starega CDN-ja na GitHub
      if (body.action === 'import-external') {
        const { files, count } = await importExternal(projects);
        if (!count) return send(res, 200, { ok: true, count: 0 });
        files.push(...(await renderedFiles(projects)));
        const sha = await commit(files, `CMS: ${count} slik preneseno na GitHub`);
        return send(res, 200, { ok: true, count, commit: sha });
      }

      const data = clean(body.project || {});
      if (!data.title) return send(res, 400, { error: 'Vpiši naslov projekta' });

      const id = body.project && body.project.id;
      const existing = id ? projects.find((p) => p.id === id) : null;
      if (id && !existing) return send(res, 404, { error: 'Projekt ne obstaja več' });
      const pid = existing ? existing.id : `${slug(data.title)}-${crypto.randomBytes(3).toString('hex')}`;

      // slike: order = ['/images/projekti/x.jpg', 'new:0', ...]
      const order = Array.isArray(body.order) ? body.order : [];
      const newImages = Array.isArray(body.newImages) ? body.newImages : [];
      const files = [];
      const images = [];
      for (const item of order) {
        if (typeof item !== 'string') continue;
        if (item.startsWith('new:')) {
          const img = newImages[parseInt(item.slice(4), 10)];
          if (!img || typeof img.data !== 'string') continue;
          const b64 = img.data.replace(/^data:image\/\w+;base64,/, '');
          if (Buffer.byteLength(b64, 'base64') > MAX_IMAGE_BYTES) {
            return send(res, 400, { error: 'Slika je prevelika' });
          }
          const ext = /^data:image\/png/.test(img.data) ? 'png' : /^data:image\/webp/.test(img.data) ? 'webp' : 'jpg';
          const path = `${IMG_DIR}/${pid}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
          files.push({ path, base64: b64 });
          images.push('/' + path);
        } else if (existing && (existing.images || []).includes(item)) {
          images.push(item);
        }
      }

      // izbrisane slike odstrani tudi z GitHuba
      if (existing) {
        for (const old of existing.images || []) {
          if (!images.includes(old) && isOwn(old)) files.push({ path: old.slice(1), remove: true });
        }
      }

      const now = new Date().toISOString();
      const keepAlt = existing && existing.alt && existing.title === data.title ? { alt: existing.alt } : {};
      const project = { id: pid, ...data, ...keepAlt, images, createdAt: existing ? existing.createdAt : now, updatedAt: now };
      const next = existing ? projects.map((p) => (p.id === pid ? project : p)) : [project, ...projects];

      files.push(...(await renderedFiles(next)));
      const sha = await commit(files, `CMS: ${existing ? 'posodobljen' : 'nov'} projekt – ${data.title}`);
      return send(res, 200, { ok: true, project, commit: sha });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      const p = projects.find((x) => x.id === id);
      if (!p) return send(res, 404, { error: 'Projekt ne obstaja' });
      const next = projects.filter((x) => x.id !== id);
      const files = (p.images || [])
        .filter(isOwn)
        .map((u) => ({ path: u.slice(1), remove: true }));
      files.push(...(await renderedFiles(next)));
      const sha = await commit(files, `CMS: izbrisan projekt – ${p.title}`);
      return send(res, 200, { ok: true, commit: sha });
    }

    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e);
  }
};

