const crypto = require('crypto');
const { send, fail, requireAuth, readFile, commit } = require('./_lib');
const { renderHomeSection, renderAllGrid, replaceBetween } = require('./_cms');

const IMG_DIR = 'images/aktualno';
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
    status: p.status === 'zakljuceno' ? 'zakljuceno' : 'v-teku',
    description: str(p.description, 2000),
  };
}

async function loadProjects() {
  const raw = await readFile('data/projects.json');
  return raw ? JSON.parse(raw) : [];
}

// Pripravi vse datoteke, ki se spremenijo, ko se seznam projektov spremeni.
async function renderedFiles(projects) {
  const [index, page] = await Promise.all([readFile('index.html'), readFile('aktualna-dela.html')]);
  return [
    { path: 'data/projects.json', text: JSON.stringify(projects, null, 2) + '\n' },
    { path: 'index.html', text: replaceBetween(index, 'AKTUALNO', renderHomeSection(projects)) },
    { path: 'aktualna-dela.html', text: replaceBetween(page, 'AKTUALNA-DELA', renderAllGrid(projects)) },
  ];
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const projects = await loadProjects();

    if (req.method === 'GET') return send(res, 200, { projects });

    if (req.method === 'POST') {
      const body = req.body || {};
      const data = clean(body.project || {});
      if (!data.title) return send(res, 400, { error: 'Vpiši naslov projekta' });

      const id = body.project && body.project.id;
      const existing = id ? projects.find((p) => p.id === id) : null;
      if (id && !existing) return send(res, 404, { error: 'Projekt ne obstaja več' });
      const pid = existing ? existing.id : `${slug(data.title)}-${crypto.randomBytes(3).toString('hex')}`;

      // slike: order = ['images/aktualno/x.jpg', 'new:0', ...]
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
          if (!images.includes(old) && old.startsWith(`/${IMG_DIR}/`)) files.push({ path: old.slice(1), remove: true });
        }
      }

      const now = new Date().toISOString();
      const project = { id: pid, ...data, images, createdAt: existing ? existing.createdAt : now, updatedAt: now };
      const next = existing ? projects.map((p) => (p.id === pid ? project : p)) : [project, ...projects];

      files.push(...(await renderedFiles(next)));
      const sha = await commit(files, `CMS: ${existing ? 'posodobljeno' : 'novo'} aktualno delo – ${data.title}`);
      return send(res, 200, { ok: true, project, commit: sha });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      const p = projects.find((x) => x.id === id);
      if (!p) return send(res, 404, { error: 'Projekt ne obstaja' });
      const next = projects.filter((x) => x.id !== id);
      const files = (p.images || [])
        .filter((u) => u.startsWith(`/${IMG_DIR}/`))
        .map((u) => ({ path: u.slice(1), remove: true }));
      files.push(...(await renderedFiles(next)));
      const sha = await commit(files, `CMS: izbrisano aktualno delo – ${p.title}`);
      return send(res, 200, { ok: true, commit: sha });
    }

    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    fail(res, e);
  }
};

