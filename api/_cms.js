// Pomožne funkcije za urejanje HTML besedil in izris aktualnih del.
// Datoteke z "_" na začetku Vercel ne objavi kot API poti.

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decode(str) {
  return str.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m] || m);
}

function attr(openTag, name) {
  const m = openTag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

// Poišče vse elemente z data-cms in njihove pozicije v HTML-ju.
function findElements(html) {
  const out = [];
  const re = /<([a-z0-9]+)\b[^>]*\sdata-cms="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const openStart = m.index;
    const openEnd = m.index + m[0].length;
    // poišči pripadajočo zaključno oznako (upošteva gnezdenje istih oznak)
    const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = openEnd;
    let depth = 1;
    let t;
    let closeStart = -1;
    let closeEnd = -1;
    while ((t = tagRe.exec(html))) {
      if (t[1] === '/') depth--;
      else if (!t[0].endsWith('/>')) depth++;
      if (depth === 0) {
        closeStart = t.index;
        closeEnd = t.index + t[0].length;
        break;
      }
    }
    if (closeStart < 0) throw new Error(`Ni zaključne oznake za ${m[2]}`);
    const open = m[0];
    out.push({
      key: m[2],
      tag,
      type: attr(open, 'data-cms-type') || 'text',
      hl: attr(open, 'data-cms-hl'),
      label: attr(open, 'data-cms-label') || m[2],
      group: attr(open, 'data-cms-group') || 'Ostalo',
      openStart,
      openEnd,
      closeStart,
      closeEnd,
      open,
      inner: html.slice(openEnd, closeStart),
    });
  }
  return out;
}

// HTML -> preprosto besedilo za urejanje:
//   nova vrstica = <br>, **krepko** = <strong>, *poudarjeno* = rumen <span>
function htmlToEdit(inner, type) {
  if (type === 'list') {
    const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => htmlToEdit(x[1], 'text'));
    return items.join('\n');
  }
  let s = inner.replace(/\s+/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  s = s.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, '*$1*');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  return s
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

function editToHtml(text, type, hl) {
  const clean = String(text ?? '').replace(/\r/g, '');
  if (type === 'list') {
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
    return '\n' + lines.map((l) => `          <li>${inline(l, hl)}</li>`).join('\n') + '\n        ';
  }
  return clean
    .split('\n')
    .map((l) => inline(l.trim(), hl))
    .join('<br>');
}

function inline(line, hl) {
  let s = esc(line);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, `<span class="${hl || 'yellow'}">$1</span>`);
  return s;
}

function readCount(el) {
  const n = attr(el.open, 'data-count') || '0';
  const plus = /class="plus"/.test(el.inner) ? '+' : '';
  return n + plus;
}

// Vrne seznam polj za admin.
function extractFields(html) {
  return findElements(html).map((el) => ({
    key: el.key,
    label: el.label,
    group: el.group,
    type: el.type,
    value: el.type === 'count' ? readCount(el) : htmlToEdit(el.inner, el.type),
  }));
}

// Zapiše nove vrednosti v HTML. values = { key: 'besedilo' }
function applyFields(html, values) {
  const els = findElements(html).filter((el) => Object.prototype.hasOwnProperty.call(values, el.key));
  // od zadaj naprej, da se pozicije ne zamikajo
  els.sort((a, b) => b.openStart - a.openStart);
  let out = html;
  for (const el of els) {
    const val = values[el.key];
    if (typeof val !== 'string') continue;
    if (el.type === 'count') {
      const m = val.trim().match(/^(\d{1,6})\s*(\+?)$/);
      if (!m) throw new Error(`"${el.label}" mora biti število (npr. 30 ali 30+)`);
      const open = el.open.replace(/data-count="[^"]*"/, `data-count="${m[1]}"`);
      const inner = '0' + (m[2] ? '<span class="plus">+</span>' : '');
      out = out.slice(0, el.openStart) + open + inner + out.slice(el.closeStart);
    } else {
      out = out.slice(0, el.openEnd) + editToHtml(val, el.type, el.hl) + out.slice(el.closeStart);
    }
  }
  return out;
}

// ---------- AKTUALNA DELA ----------

const MONTHS = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'];

function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})/.exec(d || '');
  if (!m) return '';
  const name = MONTHS[parseInt(m[2], 10) - 1] || '';
  return `${name.charAt(0).toUpperCase() + name.slice(1)} ${m[1]}`;
}

// Vrstni red določa admin (puščici gor/dol) – prvi v seznamu je prvi na strani.
function sortProjects(list) {
  return [...list];
}

const HOME_COUNT = 6;

function card(p, i) {
  // ?v= prepreči, da bi brskalnik prikazal staro (predpomnjeno) verzijo slike
  const ver = String(p.updatedAt || '').replace(/\D/g, '').slice(-8) || '1';
  const imgs = (p.images || []).filter(Boolean).map((u) => (u.startsWith('/') ? `${u}?v=${ver}` : u));
  const cover = imgs[0];
  const delay = i % 3 ? ` reveal-delay-${i % 3}` : '';
  const live = p.status === 'v-teku';
  const meta = [p.location, fmtDate(p.date)].filter(Boolean).map(esc).join(' · ');
  const alt = esc(p.alt || [p.title, p.location].filter(Boolean).join(' — ') + ' — Interstar d.o.o.');
  const desc = esc(p.description || '').replace(/\n/g, '<br>');
  return `      <article class="project-card ak-card reveal${delay}" tabindex="0" role="button" aria-label="${esc(p.title)} — odpri galerijo" data-images="${esc(imgs.join('|'))}">
        <div class="project-image">
          ${cover ? `<img src="${esc(cover)}" alt="${alt}" loading="lazy" width="600" height="450">` : '<div class="ak-noimg" aria-hidden="true"></div>'}
          ${live ? '<span class="ak-status ak-live">V teku</span>' : ''}
          ${imgs.length > 1 ? `<span class="ak-count">${imgs.length} slik</span>` : ''}
        </div>
        <div class="project-info">
          ${p.category ? `<span class="project-tag">${esc(p.category)}</span>` : ''}
          <h3>${esc(p.title)}</h3>
          ${meta ? `<p class="ak-meta">${meta}</p>` : ''}
          ${desc ? `<p class="ak-desc">${desc}</p>` : ''}
        </div>
      </article>`;
}

// Mreža v sekciji "Naši projekti" na domači strani.
function renderHomeSection(projects) {
  const list = sortProjects(projects);
  const shown = list.slice(0, HOME_COUNT);
  return `
    <div class="projects-grid">
${shown.map(card).join('\n')}
    </div>
    <div class="ak-more reveal">
      <a href="/projekti" class="btn btn-primary">${list.length > HOME_COUNT ? `Vsi projekti (${list.length})` : 'Vsi projekti'} <span class="arrow">→</span></a>
    </div>
`;
}

// Vsi projekti na podstrani /projekti.
function renderAllGrid(projects) {
  const list = sortProjects(projects);
  if (!list.length) {
    return '\n    <p class="ak-empty">Kmalu bomo tukaj objavili naše projekte. Za informacije nas pokličite na <a href="tel:+386041624728">041 624 728</a>.</p>\n';
  }
  return `\n    <div class="projects-grid">\n${list.map(card).join('\n')}\n    </div>\n`;
}

function replaceBetween(html, name, content) {
  const start = `<!-- CMS:${name}:START -->`;
  const end = `<!-- CMS:${name}:END -->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error(`Manjka oznaka ${name} v HTML`);
  return html.slice(0, a + start.length) + content + html.slice(b);
}

module.exports = {
  esc,
  findElements,
  extractFields,
  applyFields,
  htmlToEdit,
  editToHtml,
  renderHomeSection,
  renderAllGrid,
  replaceBetween,
  sortProjects,
};
