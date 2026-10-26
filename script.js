// HolyHornet UAV Systems — shared behaviour for every page

// Light / dark switch. Dark by default; remembers the visitor's choice.
(function () {
  var root = document.documentElement, btn = document.querySelector('.theme');
  if (!btn) return;
  function current() { return root.dataset.theme || 'dark'; }
  function label() {
    btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('hh-theme', next); } catch (e) {}
    label();
  });
  label();
})();

// Mobile menu
(function () {
  var t = document.querySelector('.toggle'), n = document.getElementById('nav');
  if (!t || !n) return;
  t.addEventListener('click', function () {
    var open = n.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
    t.textContent = open ? 'Close' : 'Menu';
  });
})();

// UTC clock in the status strip
(function () {
  var u = document.getElementById('utc');
  if (!u) return;
  function tick() { u.textContent = new Date().toISOString().substr(11, 8) + ' UTC'; }
  tick(); setInterval(tick, 1000);
})();

// Live camera-feed numbers on the homepage
(function () {
  var alt = document.getElementById('alt'), spd = document.getElementById('spd'), hdg = document.getElementById('hdg');
  if (!alt || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var k = 0;
  setInterval(function () {
    k += .15;
    alt.textContent = (120 + Math.sin(k) * 2.3).toFixed(1) + ' m';
    spd.textContent = (14 + Math.sin(k * 1.7) * .8).toFixed(1) + ' m/s';
    hdg.textContent = Math.round(274 + Math.sin(k * .6) * 4) + '°';
  }, 500);
})();

// Category filter chips (fleet page)
(function () {
  var chips = document.querySelectorAll('.chip[data-f]'), groups = document.querySelectorAll('.group');
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.dataset.f;
      chips.forEach(function (x) { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); });
      groups.forEach(function (g) { g.hidden = f !== 'all' && g.dataset.g !== f; });
      var bar = document.querySelector('.filters');
      if (bar) window.scrollTo({ top: bar.offsetTop - 76 });
    });
  });
})();

// Course search and filter (education page)
(function () {
  var search = document.querySelector('#courseSearch');
  var cards = [].slice.call(document.querySelectorAll('.course-card'));
  var filters = [].slice.call(document.querySelectorAll('.course-filter'));
  if (!cards.length) return;
  var active = 'all';
  function apply() {
    var q = search ? search.value.trim().toLowerCase() : '', visible = 0;
    cards.forEach(function (card) {
      var cat = active === 'all' || card.dataset.category === active;
      var hit = !q || (card.textContent + ' ' + (card.dataset.search || '')).toLowerCase().indexOf(q) > -1;
      card.hidden = !(cat && hit);
      if (!card.hidden) visible++;
    });
    var empty = document.querySelector('#noCourses');
    if (empty) empty.hidden = visible > 0;
  }
  if (search) search.addEventListener('input', apply);
  filters.forEach(function (b) {
    b.addEventListener('click', function () {
      active = b.dataset.filter || 'all';
      filters.forEach(function (f) { f.classList.toggle('on', f === b); f.setAttribute('aria-pressed', String(f === b)); });
      apply();
    });
  });
})();

// Contact form: prefill from links like contact.html?course=... or ?need=..., then send to Formspree
(function () {
  var form = document.getElementById('enquiry');
  if (!form) return;
  var p = new URLSearchParams(location.search), details = form.elements.message, need = form.elements.need;
  var needs = { Education: 'Training & courses', Fleet: 'Fleet & aircraft', Consultancy: 'UAV consultancy' };
  if (needs[p.get('need')]) need.value = needs[p.get('need')];
  if (p.get('course')) { need.value = 'Training & courses'; details.value = 'I would like to know more about the course: ' + p.get('course') + '.'; }

  var btn = form.querySelector('button[type=submit]'), error = document.getElementById('form-error'), sent = document.getElementById('sent');
  function fail(text) {
    error.innerHTML = '';
    error.append(text + ' You can also email us at ');
    var a = document.createElement('a'); a.href = 'mailto:info@holyhornet.com'; a.textContent = 'info@holyhornet.com';
    error.append(a, '.');
    error.hidden = false;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    error.hidden = true;
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.ok) {
          form.reset(); form.hidden = true; sent.hidden = false; sent.focus();
          return;
        }
        return res.json().catch(function () { return {}; }).then(function (data) {
          var msg = data && data.errors ? data.errors.map(function (x) { return x.message.replace(/[.!?]?$/, '.'); }).join(' ') : '';
          fail(msg ? 'Sorry, that didn’t send: ' + msg : 'Sorry, something went wrong sending your message.');
        });
      })
      .catch(function () { fail('Sorry, we couldn’t reach the server. Please check your connection and try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Send enquiry'; });
  });
})();
