// Pasica za piškotke + Google Analytics (naloži se šele po privolitvi).
(function () {
  var GA_ID = 'G-BGMT1XYS2K';
  var KEY = 'interstar_piskotki'; // 'da' | 'ne'

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.__interstarGA) return;
    window.__interstarGA = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function clearGA() {
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^_ga/.test(name)) {
        var host = location.hostname.replace(/^www\./, '');
        ['', '; domain=.' + host, '; domain=' + location.hostname].forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      }
    });
  }

  var bar;
  function hide() { if (bar) bar.classList.remove('show'); }
  function show() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'cookie-bar';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-label', 'Nastavitve piškotkov');
      bar.innerHTML =
        '<div class="cookie-in">' +
        '<p><strong>Piškotki</strong> Z vašim dovoljenjem uporabljamo Google Analytics, da vidimo, kako obiskovalci uporabljajo stran, in jo izboljšamo. ' +
        '<a href="/zasebnost#piskotki">Več o tem</a></p>' +
        '<div class="cookie-btns"><button type="button" class="cookie-no">Zavrni</button><button type="button" class="cookie-yes">Sprejmi</button></div>' +
        '</div>';
      document.body.appendChild(bar);
      bar.querySelector('.cookie-yes').addEventListener('click', function () { save('da'); hide(); loadGA(); });
      bar.querySelector('.cookie-no').addEventListener('click', function () { save('ne'); hide(); clearGA(); });
    }
    requestAnimationFrame(function () { bar.classList.add('show'); });
  }

  function init() {
    var v = read();
    if (v === 'da') loadGA();
    else if (v !== 'ne') show();

    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-cookie-settings]');
      if (t) { e.preventDefault(); show(); return; }
      var a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"]');
      if (a && window.gtag) {
        var tel = a.getAttribute('href').indexOf('tel:') === 0;
        window.gtag('event', tel ? 'klik_telefon' : 'klik_email', {
          kontakt: a.getAttribute('href').replace(/^(tel|mailto):/, ''),
          mesto: (a.closest('section, footer, nav') || {}).id || (a.classList.contains('float-call') ? 'plavajoci-gumb' : '')
        });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
