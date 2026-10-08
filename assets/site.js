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
  const done = document.createElement('div');
  done.className = 'inquiry-done';
  done.innerHTML = '<strong>Hvala, povpraševanje je poslano.</strong>Odgovorimo v 24 urah. Če je nujno, pokličite <a href="tel:+386041624728" style="color:var(--yellow)">041 624 728</a>.';
  box.appendChild(done);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'f-msg';
    msg.textContent = '';
    form.querySelectorAll('.bad').forEach(el => el.classList.remove('bad'));
    const d = Object.fromEntries(new FormData(form).entries());
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
