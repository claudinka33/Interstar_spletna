// Cursor follower
const cursor = document.getElementById('cursor');
if (cursor) document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});
document.querySelectorAll('a, button, .service-card, .project-card, .fleet-card').forEach(el => {
  if (!cursor) return;
  el.addEventListener('mouseenter', () => { cursor.style.width = '40px'; cursor.style.height = '40px'; });
  el.addEventListener('mouseleave', () => { cursor.style.width = '12px'; cursor.style.height = '12px'; });
});

// Nav scroll effect
const nav = document.getElementById('nav');
if (nav) window.addEventListener('scroll', () => {
  if (window.scrollY > 50) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

// Mobile menu
const toggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');
if (toggle) toggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  toggle.classList.toggle('active');
  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => {
    if (!toggle) return;
    toggle.classList.remove('active');
    navLinks.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
});

// Reveal on scroll
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Animated counters
function animateCount(el) {
  const target = parseInt(el.dataset.count);
  const duration = 1800;
  const start = performance.now();
  const plusHtml = el.querySelector('.plus') ? el.querySelector('.plus').outerHTML : '';

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * target);
    el.innerHTML = current + plusHtml;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.dataset.counted) {
      entry.target.dataset.counted = 'true';
      animateCount(entry.target);
    }
  });
}, { threshold: 0.4 });
document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));

// Podvojim vsebino marquee track-ov za neskončno animacijo
document.querySelectorAll('.testimonials-track').forEach(track => {
  const cards = track.innerHTML;
  track.innerHTML = cards + cards;
});

// ===== Obrazec za povpraševanje =====
(function () {
  const form = document.getElementById('inquiryForm');
  if (!form) return;
  const box = document.getElementById('povprasevanje');
  const msg = form.querySelector('.f-msg');
  const btn = form.querySelector('button[type=submit]');
  const started = Date.now();

  // ---- priloge ----
  const MAX_FILES = 5, MAX_TOTAL = 3.3 * 1024 * 1024;
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const fileDrop = document.getElementById('fileDrop');
  let files = []; // { name, type, data, size, preview }
  const b64size = (d) => Math.round((d.length - d.indexOf(',') - 1) * 3 / 4);
  const fmt = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const readUrl = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
  function shrink(f) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error('Slike ni mogoče prebrati')); };
      img.src = url;
    });
  }
  function drawFiles() {
    fileList.innerHTML = '';
    files.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = (f.type === 'application/pdf' ? '<span class="pdf">PDF</span>' : '<img alt="">') +
        '<span class="nm"></span><span class="sz"></span><button type="button" aria-label="Odstrani prilogo">×</button>';
      if (f.type !== 'application/pdf') li.querySelector('img').src = f.data;
      li.querySelector('.nm').textContent = f.name;
      li.querySelector('.sz').textContent = fmt(f.size);
      li.querySelector('button').addEventListener('click', () => { files.splice(i, 1); drawFiles(); });
      fileList.appendChild(li);
    });
  }
  async function addFiles(list) {
    msg.className = 'f-msg'; msg.textContent = '';
    for (const f of list) {
      if (files.length >= MAX_FILES) { msg.textContent = 'Največ ' + MAX_FILES + ' datotek.'; msg.classList.add('err'); break; }
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImg = /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);
      if (!isPdf && !isImg) { msg.textContent = '»' + f.name + '« ni PDF, JPG ali PNG.'; msg.classList.add('err'); continue; }
      try {
        let data, type, name = f.name;
        if (isPdf) { data = await readUrl(f); type = 'application/pdf'; }
        else { data = await shrink(f); type = 'image/jpeg'; name = name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'; }
        const size = b64size(data);
        const total = files.reduce((t, x) => t + x.size, 0) + size;
        if (total > MAX_TOTAL) { msg.textContent = '»' + f.name + '« je prevelika (skupaj največ 3 MB). Večje datoteke pošljite na interstar.doo@gmail.com.'; msg.classList.add('err'); continue; }
        files.push({ name, type, data, size });
      } catch (ex) { msg.textContent = ex.message; msg.classList.add('err'); }
    }
    drawFiles();
  }
  if (fileInput) {
    fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.remove('over'); }));
    fileDrop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
  }
  const done = document.createElement('div');
  done.className = 'inquiry-done';
  done.innerHTML = '<strong>Hvala, povpraševanje je poslano.</strong>Odgovorimo v 24 urah. Če je nujno, pokličite <a href="tel:+386041624728" style="color:var(--yellow)">041 624 728</a>.';
  box.appendChild(done);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'f-msg';
    msg.textContent = '';
    form.querySelectorAll('.bad').forEach(el => el.classList.remove('bad'));
    const fd = new FormData(form);
    fd.delete('priloge_input');
    const d = {};
    for (const [k, v] of fd.entries()) if (typeof v === 'string') d[k] = v;
    d.priloge = files.map((f) => ({ name: f.name, type: f.type, data: f.data }));
    d.soglasje = form.soglasje.checked;
    d.t = started;
    d.stran = location.pathname;
    let err = '';
    if (!d.ime.trim()) { err = 'Vpišite ime.'; form.ime.classList.add('bad'); }
    else if (!d.telefon.trim() && !d.email.trim()) { err = 'Vpišite telefon ali e-mail.'; form.telefon.classList.add('bad'); form.email.classList.add('bad'); }
    else if (!d.sporocilo.trim()) { err = 'Na kratko opišite, kaj potrebujete.'; form.sporocilo.classList.add('bad'); }
    else if (!d.soglasje) { err = 'Potrdite strinjanje s politiko zasebnosti.'; }
    if (err) { msg.textContent = err; msg.classList.add('err'); return; }

    btn.disabled = true;
    try {
      const r = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Pošiljanje ni uspelo.');
      box.classList.add('sent');
      if (window.gtag) window.gtag('event', 'generate_lead', { form: 'povprasevanje', storitev: d.storitev || '' });
    } catch (ex) {
      msg.innerHTML = '';
      msg.textContent = ex.message + ' ';
      msg.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  });
})();

// ===== Galerija aktualnih del =====
(function () {
  const cards = document.querySelectorAll('.ak-card');
  if (!cards.length) return;
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = '<div class="lb-top"><div><div class="lb-title"></div><div class="lb-sub"></div></div><button class="lb-close" aria-label="Zapri">×</button></div>' +
    '<div class="lb-stage"><button class="lb-nav lb-prev" aria-label="Prejšnja slika">←</button><img alt=""><button class="lb-nav lb-next" aria-label="Naslednja slika">→</button></div>' +
    '<div class="lb-desc"></div>';
  document.body.appendChild(lb);
  const img = lb.querySelector('.lb-stage img');
  let list = [], i = 0, desc = '', lastFocus = null;

  function show() {
    img.src = list[i] || '';
    lb.querySelectorAll('.lb-nav').forEach(b => b.style.display = list.length > 1 ? '' : 'none');
    lb.querySelector('.lb-desc').innerHTML = (list.length > 1 ? '<span class="lb-idx">' + (i + 1) + ' / ' + list.length + '</span>' : '') + desc;
  }
  function open(card) {
    list = (card.dataset.images || '').split('|').filter(Boolean);
    if (!list.length) return;
    i = 0;
    lb.querySelector('.lb-title').textContent = card.querySelector('h3').textContent;
    const meta = card.querySelector('.ak-meta');
    lb.querySelector('.lb-sub').textContent = meta ? meta.textContent : '';
    img.alt = card.querySelector('h3').textContent;
    desc = card.querySelector('.ak-desc').innerHTML;
    lastFocus = document.activeElement;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    show();
    lb.querySelector('.lb-close').focus();
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  const step = d => { i = (i + d + list.length) % list.length; show(); };
  cards.forEach(c => {
    c.addEventListener('click', () => open(c));
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c); } });
  });
  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', () => step(-1));
  lb.querySelector('.lb-next').addEventListener('click', () => step(1));
  lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  let x0 = null;
  img.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); x0 = null; });
})();
