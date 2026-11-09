// Holy Hornet course platform: catalogue, course page, lesson player, account and admin
(function () {
  var cfg = window.HH_LMS || {};
  var app = document.getElementById('app');
  var page = document.body.dataset.page;
  var ready = !!(cfg.url && cfg.anonKey && window.supabase);
  var recovering = location.hash.indexOf('type=recovery') !== -1;
  var db = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;
  var params = new URLSearchParams(location.search);
  var BUCKET = 'course-files';
  var MAX_FILE = 50 * 1024 * 1024;

  // ---------- small helpers ----------
  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
      else node.setAttribute(k === 'cls' ? 'class' : k, v === true ? '' : v);
    });
    [].slice.call(arguments, 2).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(function (k) { if (k) node.appendChild(k); });
      else node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return node;
  }
  function show() { app.textContent = ''; [].slice.call(arguments).forEach(function (n) { if (n) app.appendChild(n); }); }
  function notice(text, kind) { return el('p', { cls: 'lms-note ' + (kind || ''), role: kind === 'bad' ? 'alert' : 'status', text: text }); }
  function must(res) { if (res.error) throw res.error; return res.data; }
  function byPos(a, b) { return a.position - b.position; }
  function money(c) {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency: c.currency.toUpperCase() }).format(c.price_cents / 100);
  }
  function safeNext(v) { return /^[a-z]+(\.html)?(\?[\w=&%.-]*)?$/.test(v || '') ? v : 'account.html'; }
  function signInLink() { return 'account.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); }
  function fail(err) {
    console.error(err);
    show(el('div', { cls: 'wrap lms-page' }, notice('Something went wrong loading this page. Please refresh, or email info@holyhornet.com if it keeps happening.', 'bad')));
  }
  function session() { return db ? db.auth.getSession().then(function (r) { return r.data.session; }) : Promise.resolve(null); }
  function isAdmin(user) {
    return db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle().then(function (r) { return !!(r.data && r.data.is_admin); });
  }

  // ---------- course data ----------
  function loadCourse(id) {
    if (!db) {
      return fetch('assets/courses.json').then(function (r) { return r.json(); }).then(function (all) {
        return all.filter(function (c) { return c.id === id; })[0] || null;
      });
    }
    return db.from('courses').select('*,modules(id,title,position,lessons(id,title,position,duration_min,is_preview,published))')
      .eq('id', id).maybeSingle().then(must).then(function (c) {
        if (!c) return null;
        c.modules.sort(byPos).forEach(function (m) { m.lessons.sort(byPos); });
        return c;
      });
  }
  function lessonsOf(course) { return course.modules.reduce(function (all, m) { return all.concat(m.lessons); }, []); }
  function courseAccess(user, id) {
    if (!db || !user) return Promise.resolve({ owned: false, admin: false, done: {} });
    return Promise.all([
      isAdmin(user),
      db.from('enrollments').select('course_id').eq('user_id', user.id).eq('course_id', id).then(must),
      db.from('progress').select('lesson_id').eq('user_id', user.id).then(must)
    ]).then(function (r) {
      var done = {};
      r[2].forEach(function (p) { done[p.lesson_id] = true; });
      return { admin: r[0], owned: r[0] || r[1].length > 0, done: done };
    });
  }
  function percent(course, done) {
    var all = lessonsOf(course);
    return all.length ? Math.round(100 * all.filter(function (l) { return done[l.id]; }).length / all.length) : 0;
  }
  function bar(pct) {
    return el('div', { cls: 'lms-bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Course progress' },
      el('i', { style: 'width:' + pct + '%' }));
  }

  // ---------- catalogue (education page) ----------
  function catalogue() {
    if (!db) return;
    Promise.all([session(), db.from('courses').select('id,price_cents,currency').then(must)]).then(function (r) {
      var user = r[0] && r[0].user;
      return (user ? db.from('enrollments').select('course_id').eq('user_id', user.id).then(must) : Promise.resolve([])).then(function (owned) {
        var mine = owned.map(function (e) { return e.course_id; });
        r[1].forEach(function (c) {
          var card = document.querySelector('[data-course="' + c.id + '"]');
          if (!card) return;
          var meta = card.querySelector('.meta');
          var has = mine.indexOf(c.id) !== -1;
          if (has) meta.appendChild(el('span', { cls: 'price', text: 'Enrolled' }));
          else if (c.price_cents) meta.appendChild(el('span', { cls: 'price', text: money(c) }));
          if (has) card.querySelector('.more').textContent = 'Continue learning →';
        });
      });
    }).catch(console.error);
  }

  // ---------- course page ----------
  function buy(course, button, msg) {
    button.disabled = true;
    button.textContent = 'Opening secure payment…';
    db.functions.invoke('create-checkout', { body: { course_id: course.id } }).then(function (res) {
      if (res.error) {
        var body = res.error.context && res.error.context.json ? res.error.context.json() : Promise.resolve({});
        return body.catch(function () { return {}; }).then(function (b) { throw new Error(b.error || 'The payment page could not be opened. Please try again.'); });
      }
      location.href = res.data.url;
    }).catch(function (err) {
      button.disabled = false;
      button.textContent = 'Buy this course';
      msg.textContent = '';
      msg.appendChild(notice(err.message, 'bad'));
    });
  }
  function firstOpenLesson(course, done) {
    var all = lessonsOf(course);
    return all.filter(function (l) { return !done[l.id]; })[0] || all[0];
  }
  function learnLink(course, lesson) { return 'learn.html?c=' + course.id + (lesson ? '&l=' + lesson.id : ''); }

  function courseAction(course, user, access) {
    var msg = el('div');
    var box = el('aside', { cls: 'lms-buy' });
    if (access.owned) {
      var pct = percent(course, access.done);
      box.appendChild(el('b', { cls: 'lms-price', text: pct + '% complete' }));
      box.appendChild(bar(pct));
      box.appendChild(el('a', { cls: 'btn main', href: learnLink(course, firstOpenLesson(course, access.done)), text: pct ? 'Continue learning' : 'Start learning' }));
      return box;
    }
    if (!db || !course.price_cents) {
      box.appendChild(el('b', { cls: 'lms-price', text: 'Enrolment opens soon' }));
      box.appendChild(el('p', { text: 'Leave your details and we will tell you when this course is available.' }));
      box.appendChild(el('a', { cls: 'btn main', href: 'contact.html?course=' + encodeURIComponent(course.title), text: 'Register interest' }));
      return box;
    }
    box.appendChild(el('b', { cls: 'lms-price', text: money(course) }));
    box.appendChild(el('p', { text: 'One payment. Every lesson and PDF in this course.' }));
    if (user) {
      var button = el('button', { cls: 'btn main', type: 'button', text: 'Buy this course' });
      button.addEventListener('click', function () { buy(course, button, msg); });
      box.appendChild(button);
    } else {
      box.appendChild(el('a', { cls: 'btn main', href: signInLink(), text: 'Sign in to buy' }));
    }
    box.appendChild(msg);
    return box;
  }

  function syllabus(course, access) {
    return el('div', { cls: 'lms-syllabus' }, course.modules.map(function (m, i) {
      return el('details', { open: i === 0 },
        el('summary', {}, el('span', { text: 'Module ' + (i + 1) }), el('b', { text: m.title }), el('small', { text: m.lessons.length + (m.lessons.length === 1 ? ' lesson' : ' lessons') })),
        el('ol', {}, m.lessons.map(function (l) {
          var open = db && (access.owned || l.is_preview);
          return el('li', { cls: access.done[l.id] ? 'done' : '' },
            open ? el('a', { href: learnLink(course, l), text: l.title }) : el('span', { text: l.title }),
            l.is_preview && !access.owned ? el('em', { text: 'Free preview' }) : null,
            access.done[l.id] ? el('em', { text: 'Done' }) : null);
        })));
    }));
  }

  function waitForPayment(course, user, tries) {
    return courseAccess(user, course.id).then(function (a) {
      if (a.owned || tries <= 0) return a;
      return new Promise(function (ok) { setTimeout(ok, 2000); }).then(function () { return waitForPayment(course, user, tries - 1); });
    });
  }

  function coursePage() {
    var id = params.get('c');
    Promise.all([loadCourse(id), session()]).then(function (r) {
      var course = r[0], user = r[1] && r[1].user;
      if (!course) { show(el('div', { cls: 'wrap lms-page' }, el('h1', { text: 'Course not found' }), el('p', {}, el('a', { href: 'education.html', text: 'Back to all courses' })))); return; }
      document.title = course.title + ' | Holy Hornet';
      var paid = params.get('paid') && user;
      if (paid) show(el('div', { cls: 'wrap lms-page' }, notice('Payment received. Unlocking your course…')));
      return (paid ? waitForPayment(course, user, 10) : courseAccess(user, id)).then(function (access) {
        var count = lessonsOf(course).length;
        show(
          el('section', { cls: 'intro' }, el('div', { cls: 'wrap lms-hero' },
            el('div', {},
              el('a', { cls: 'lms-back', href: 'education.html', text: '← All courses' }),
              el('span', { cls: 'kicker', text: course.category }),
              el('h1', { text: course.title }),
              el('p', { cls: 'lead', text: course.summary }),
              course.description ? el('p', { text: course.description }) : null,
              el('div', { cls: 'stats' },
                el('span', {}, el('b', { text: String(course.modules.length) }), 'modules'),
                el('span', {}, el('b', { text: String(count) }), 'lessons'),
                el('span', {}, el('b', { text: course.level }), 'level'))),
            courseAction(course, user, access))),
          el('section', { cls: 'sec' }, el('div', { cls: 'wrap' },
            paid && !access.owned ? notice('Your payment is still being confirmed. Refresh in a minute; if the course stays locked, email info@holyhornet.com.', 'bad') : null,
            paid && access.owned ? notice('You now have full access to this course.', 'good') : null,
            el('h2', { cls: 'lms-h2', text: 'Course outline' }),
            syllabus(course, access))));
      });
    }).catch(fail);
  }

  // ---------- lesson player ----------
  function videoEmbed(url) {
    var m = /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,20})/.exec(url);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    m = /^https:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(url);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    return null;
  }
  function richText(body) {
    return el('div', { cls: 'lms-text' }, body.split(/\n\s*\n/).filter(function (b) { return b.trim(); }).map(function (b) {
      b = b.trim();
      if (b.slice(0, 3) === '## ') return el('h2', { text: b.slice(3) });
      var lines = b.split('\n');
      if (lines.every(function (l) { return l.trim().slice(0, 2) === '- '; })) return el('ul', {}, lines.map(function (l) { return el('li', { text: l.trim().slice(2) }); }));
      return el('p', { text: b });
    }));
  }
  function sizeText(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  function fileRow(file, viewer) {
    var signed = function (opts) { return db.storage.from(BUCKET).createSignedUrl(file.storage_path, 3600, opts).then(must).then(function (d) { return d.signedUrl; }); };
    var isPdf = file.mime_type === 'application/pdf';
    var isVideo = file.mime_type.indexOf('video/') === 0;
    function view() {
      signed().then(function (url) {
        viewer.textContent = '';
        viewer.appendChild(isVideo ? el('video', { controls: true, src: url }) : el('iframe', { src: url, title: file.title }));
        viewer.scrollIntoView({ block: 'nearest' });
      }).catch(fail);
    }
    return { view: (isPdf || isVideo) ? view : null, row: el('li', {},
      el('span', {}, el('b', { text: file.title }), el('small', { text: sizeText(file.size_bytes) })),
      (isPdf || isVideo) ? el('button', { cls: 'btn quiet', type: 'button', text: isPdf ? 'Read' : 'Watch', onclick: view }) : null,
      el('button', { cls: 'btn quiet', type: 'button', text: 'Download', onclick: function () { signed({ download: file.title }).then(function (u) { location.href = u; }).catch(fail); } })) };
  }

  function learnPage() {
    if (!db) { location.replace('course.html?c=' + encodeURIComponent(params.get('c') || '')); return; }
    var id = params.get('c');
    Promise.all([loadCourse(id), session()]).then(function (r) {
      var course = r[0], user = r[1] && r[1].user;
      if (!user) { location.replace(signInLink()); return; }
      if (!course) { location.replace('education.html'); return; }
      return courseAccess(user, id).then(function (access) {
        var all = lessonsOf(course);
        var lesson = all.filter(function (l) { return l.id === params.get('l'); })[0] || firstOpenLesson(course, access.done);
        if (!lesson || !(access.owned || lesson.is_preview)) { location.replace('course.html?c=' + id); return; }
        return Promise.all([
          db.from('lesson_content').select('*').eq('lesson_id', lesson.id).maybeSingle().then(must),
          db.from('lesson_files').select('*').eq('lesson_id', lesson.id).order('position').then(must)
        ]).then(function (c) { renderLesson(course, lesson, access, user, c[0], c[1]); });
      });
    }).catch(fail);
  }

  function renderLesson(course, lesson, access, user, content, files) {
    document.title = lesson.title + ' | ' + course.title;
    var all = lessonsOf(course);
    var at = all.indexOf(lesson);
    var next = all[at + 1], prev = all[at - 1];
    var canOpen = function (l) { return access.owned || l.is_preview; };
    var viewer = el('div', { cls: 'lms-viewer' });
    var rows = files.map(function (f) { return fileRow(f, viewer); });
    var embed = content && content.video_url ? videoEmbed(content.video_url) : null;
    var empty = !embed && !(content && content.body.trim()) && !files.length;

    var side = el('nav', { cls: 'lms-side', 'aria-label': 'Course lessons' },
      el('a', { cls: 'lms-back', href: 'course.html?c=' + course.id, text: '← Course overview' }),
      el('b', { cls: 'lms-side-title', text: course.title }),
      el('div', { cls: 'lms-side-pct' }, bar(percent(course, access.done)), el('small', { text: percent(course, access.done) + '% complete' })),
      course.modules.map(function (m, i) {
        var here = m.lessons.indexOf(lesson) !== -1;
        return el('details', { open: here },
          el('summary', { text: (i + 1) + '. ' + m.title }),
          el('ol', {}, m.lessons.map(function (l) {
            var cls = (access.done[l.id] ? 'done ' : '') + (l === lesson ? 'here' : '');
            return el('li', { cls: cls }, canOpen(l)
              ? el('a', { href: learnLink(course, l), 'aria-current': l === lesson ? 'page' : null, text: l.title })
              : el('span', { text: l.title + ' (locked)' }));
          })));
      }));

    var doneBtn = el('button', { cls: 'btn ' + (access.done[lesson.id] ? 'quiet' : 'main'), type: 'button', text: access.done[lesson.id] ? 'Completed ✓' : 'Mark complete' });
    doneBtn.addEventListener('click', function () {
      doneBtn.disabled = true;
      var was = access.done[lesson.id];
      var op = was
        ? db.from('progress').delete().eq('user_id', user.id).eq('lesson_id', lesson.id)
        : db.from('progress').insert({ user_id: user.id, lesson_id: lesson.id });
      op.then(must).then(function () {
        if (!was && next && canOpen(next)) { location.href = learnLink(course, next); return; }
        location.reload();
      }).catch(fail);
    });

    show(el('div', { cls: 'lms-learn' }, side, el('article', { cls: 'lms-lesson' },
      el('span', { cls: 'kicker', text: 'Lesson ' + (at + 1) + ' of ' + all.length }),
      el('h1', { text: lesson.title }),
      embed ? el('div', { cls: 'lms-video' }, el('iframe', { src: embed, title: lesson.title, allow: 'fullscreen; picture-in-picture', allowfullscreen: true })) : null,
      viewer,
      content && content.body.trim() ? richText(content.body) : null,
      files.length ? el('section', { cls: 'lms-files' }, el('h2', { text: 'Lesson files' }), el('ul', {}, rows.map(function (r) { return r.row; }))) : null,
      empty ? notice('This lesson is being prepared. Its material will appear here as soon as it is ready.') : null,
      el('div', { cls: 'lms-pager' },
        prev && canOpen(prev) ? el('a', { cls: 'btn quiet', href: learnLink(course, prev), text: '← Previous' }) : el('span'),
        doneBtn,
        next && canOpen(next) ? el('a', { cls: 'btn quiet', href: learnLink(course, next), text: 'Next →' }) : el('span')))));
    var firstViewable = rows.filter(function (r) { return r.view; })[0];
    if (firstViewable && !embed) firstViewable.view();
  }

  // ---------- account ----------
  function field(label, props) { return el('label', { cls: 'lms-field' }, el('span', { text: label }), el(props.rows ? 'textarea' : 'input', props)); }

  function newPasswordForm() {
    var pw = field('New password', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
    var msg = el('div');
    show(el('div', { cls: 'wrap lms-page lms-narrow' }, el('h1', { text: 'Choose a new password' }), el('form', { onsubmit: function (e) {
      e.preventDefault();
      db.auth.updateUser({ password: pw.querySelector('input').value }).then(must).then(function () {
        location.replace('account.html');
      }).catch(function (err) { msg.textContent = ''; msg.appendChild(notice(err.message, 'bad')); });
    } }, pw, msg, el('button', { cls: 'btn main', type: 'submit', text: 'Save password' }))));
  }

  function authForm(mode) {
    var next = safeNext(params.get('next'));
    var name = field('Full name', { type: 'text', required: true, autocomplete: 'name', maxlength: 120 });
    var mail = field('Email', { type: 'email', required: true, autocomplete: 'email' });
    var pw = field('Password', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'up' ? 'new-password' : 'current-password' });
    var msg = el('div');
    var v = function (f) { return f.querySelector('input').value.trim(); };
    var titles = { in: 'Sign in', up: 'Create your account', reset: 'Reset your password' };
    function say(t, k) { msg.textContent = ''; msg.appendChild(notice(t, k)); }
    function submit(e) {
      e.preventDefault();
      var back = location.origin + location.pathname.replace(/[^/]*$/, '') + 'account.html';
      var job;
      if (mode === 'in') job = db.auth.signInWithPassword({ email: v(mail), password: pw.querySelector('input').value }).then(must).then(function () { location.replace(next); });
      else if (mode === 'up') job = db.auth.signUp({ email: v(mail), password: pw.querySelector('input').value, options: { data: { full_name: v(name) }, emailRedirectTo: back } }).then(must).then(function (d) {
        if (d.session) location.replace(next); else say('Check your email and click the link to confirm your account.', 'good');
      });
      else job = db.auth.resetPasswordForEmail(v(mail), { redirectTo: back }).then(must).then(function () { say('If that address has an account, a reset link is on its way.', 'good'); });
      job.catch(function (err) { say(err.message, 'bad'); });
    }
    function swap(m, text) { return el('button', { cls: 'lms-link', type: 'button', text: text, onclick: function () { authForm(m); } }); }
    show(el('div', { cls: 'wrap lms-page lms-narrow' },
      el('span', { cls: 'kicker', text: 'My learning' }), el('h1', { text: titles[mode] }),
      el('form', { onsubmit: submit }, mode === 'up' ? name : null, mail, mode !== 'reset' ? pw : null, msg,
        el('button', { cls: 'btn main', type: 'submit', text: mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link' })),
      el('p', { cls: 'lms-swap' }, mode !== 'in' ? swap('in', 'I already have an account') : null, mode !== 'up' ? swap('up', 'Create an account') : null, mode === 'in' ? swap('reset', 'Forgot password?') : null)));
  }

  function accountPage() {
    if (!db) { show(el('div', { cls: 'wrap lms-page lms-narrow' }, el('h1', { text: 'Student accounts open soon' }), el('p', {}, el('a', { href: 'education.html', text: 'See the courses' })))); return; }
    session().then(function (s) {
      if (s && recovering) { newPasswordForm(); return; }
      if (!s) { authForm('in'); return; }
      var user = s.user;
      if (params.get('next')) { location.replace(safeNext(params.get('next'))); return; }
      return Promise.all([
        isAdmin(user),
        db.from('enrollments').select('course_id').eq('user_id', user.id).then(must),
        db.from('progress').select('lesson_id').eq('user_id', user.id).then(must)
      ]).then(function (r) {
        var done = {};
        r[2].forEach(function (p) { done[p.lesson_id] = true; });
        return Promise.all(r[1].map(function (e) { return loadCourse(e.course_id); })).then(function (courses) {
          var cards = courses.filter(Boolean).map(function (c) {
            var pct = percent(c, done);
            return el('a', { cls: 'lms-mine', href: learnLink(c, firstOpenLesson(c, done)) }, el('small', { text: c.category }), el('h3', { text: c.title }), bar(pct), el('span', { text: pct + '% complete' }));
          });
          show(el('section', { cls: 'wrap lms-page' },
            el('span', { cls: 'kicker', text: user.email }), el('h1', { text: 'My learning' }),
            cards.length ? el('div', { cls: 'lms-grid' }, cards) : el('p', {}, 'You have no courses yet. ', el('a', { href: 'education.html', text: 'Browse the courses' }), '.'),
            el('div', { cls: 'actions lms-gap' },
              r[0] ? el('a', { cls: 'btn main', href: 'admin.html', text: 'Manage courses' }) : null,
              el('button', { cls: 'btn quiet', type: 'button', text: 'Sign out', onclick: function () { db.auth.signOut().then(function () { location.replace('education.html'); }); } }))));
        });
      });
    }).catch(fail);
  }

  // ---------- admin ----------
  function adminPage() {
    if (!db) { show(el('div', { cls: 'wrap lms-page' }, notice('Connect Supabase first: see supabase/README.md.', 'bad'))); return; }
    session().then(function (s) {
      if (!s) { location.replace(signInLink()); return; }
      return isAdmin(s.user).then(function (ok) {
        if (!ok) { location.replace('account.html'); return; }
        return db.from('courses').select('id,title').order('position').then(must).then(function (list) { adminCourse(list, params.get('c') || list[0].id, null); });
      });
    }).catch(fail);
  }

  function adminCourse(list, id, openLesson) {
    loadCourse(id).then(function (course) {
      var v = function (f, tag) { return f.querySelector(tag || 'input').value; };
      var reload = function (l) { adminCourse(list, id, l === undefined ? openLesson : l); };
      var run = function (p, l) { return p.then(must).then(function () { reload(l); }).catch(adminError); };
      var title = field('Title', { value: course.title, required: true });
      var summary = field('Short summary', { value: course.summary });
      var desc = field('Full description', { rows: 4, value: course.description });
      var price = field('Price in euros (empty = not on sale)', { type: 'number', min: '0.5', step: '0.01', value: course.price_cents ? (course.price_cents / 100).toFixed(2) : '' });
      var pub = el('input', { type: 'checkbox', checked: course.published });
      var courseForm = el('form', { cls: 'lms-admin-card', onsubmit: function (e) {
        e.preventDefault();
        var p = v(price);
        run(db.from('courses').update({ title: v(title), summary: v(summary), description: v(desc, 'textarea'), price_cents: p ? Math.round(parseFloat(p) * 100) : null, published: pub.checked }).eq('id', id));
      } }, title, summary, desc, price, el('label', { cls: 'lms-check' }, pub, el('span', { text: 'Published (visible on the site)' })), el('button', { cls: 'btn main', type: 'submit', text: 'Save course' }));

      function swap(table, items, i, dir) {
        var a = items[i], b = items[i + dir];
        if (!b) return;
        var pa = a.position, pb = b.position === a.position ? a.position + dir : b.position;
        run(Promise.all([db.from(table).update({ position: pb }).eq('id', a.id).then(must), db.from(table).update({ position: pa }).eq('id', b.id).then(must)]).then(function () { return { data: 1 }; }));
      }
      var tools = function (table, items, i, name) {
        return el('span', { cls: 'lms-tools' },
          el('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, text: '↑', onclick: function () { swap(table, items, i, -1); } }),
          el('button', { type: 'button', 'aria-label': 'Move down', disabled: i === items.length - 1, text: '↓', onclick: function () { swap(table, items, i, 1); } }),
          el('button', { type: 'button', 'aria-label': 'Delete', text: '✕', onclick: function () {
            if (confirm('Delete "' + name + '"' + (table === 'modules' ? ' and all its lessons' : '') + '? Students lose access to it. This cannot be undone.')) run(db.from(table).delete().eq('id', items[i].id));
          } }));
      };
      var nextPos = function (items) { return items.reduce(function (m, x) { return Math.max(m, x.position); }, 0) + 1; };
      var addForm = function (label, add) {
        var input = el('input', { type: 'text', required: true, placeholder: label, 'aria-label': label });
        return el('form', { cls: 'lms-add', onsubmit: function (e) { e.preventDefault(); add(input.value.trim()); } }, input, el('button', { cls: 'btn quiet', type: 'submit', text: 'Add' }));
      };

      var outline = el('div', { cls: 'lms-admin-card' }, el('h2', { text: 'Modules and lessons' }), course.modules.map(function (m, i) {
        return el('details', { open: m.lessons.some(function (l) { return l.id === openLesson; }) || i === 0 },
          el('summary', {}, el('b', { text: m.title }), tools('modules', course.modules, i, m.title)),
          el('ol', {}, m.lessons.map(function (l, j) {
            return el('li', { cls: l.id === openLesson ? 'here' : '' },
              el('button', { cls: 'lms-link', type: 'button', text: l.title, onclick: function () { reload(l.id); } }),
              tools('lessons', m.lessons, j, l.title));
          })),
          addForm('New lesson title', function (t) { run(db.from('lessons').insert({ module_id: m.id, title: t, position: nextPos(m.lessons) })); }));
      }), addForm('New module title', function (t) { run(db.from('modules').insert({ course_id: id, title: t, position: nextPos(course.modules) })); }));

      var editor = el('div', { cls: 'lms-admin-edit' }, el('p', { cls: 'lms-note', text: 'Choose a lesson to add its video, text and PDFs.' }));
      var msg = el('div', { id: 'admin-msg' });
      function adminError(err) { console.error(err); msg.textContent = ''; msg.appendChild(notice(err.message || 'That did not work.', 'bad')); }

      show(el('div', { cls: 'wrap lms-page' },
        el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Manage courses' }),
        el('label', { cls: 'lms-field lms-pick' }, el('span', { text: 'Course' }), el('select', { onchange: function (e) { adminCourse(list, e.target.value, null); } },
          list.map(function (c) { var o = el('option', { value: c.id, text: c.title }); o.selected = c.id === id; return o; }))),
        msg,
        el('div', { cls: 'lms-admin' }, el('div', {}, courseForm, outline), editor)));

      var lesson = lessonsOf(course).filter(function (l) { return l.id === openLesson; })[0];
      if (lesson) adminLesson(course, lesson, editor, reload, adminError);
    }).catch(fail);
  }

  function adminLesson(course, lesson, box, reload, adminError) {
    Promise.all([
      db.from('lesson_content').select('*').eq('lesson_id', lesson.id).maybeSingle().then(must),
      db.from('lesson_files').select('*').eq('lesson_id', lesson.id).order('position').then(must)
    ]).then(function (r) {
      var c = r[0] || { body: '', video_url: '' }, files = r[1];
      var title = field('Lesson title', { value: lesson.title, required: true });
      var mins = field('Minutes (optional)', { type: 'number', min: '1', value: lesson.duration_min || '' });
      var video = field('YouTube or Vimeo link (optional)', { type: 'url', value: c.video_url, placeholder: 'https://vimeo.com/…' });
      var body = field('Lesson text: blank line = new paragraph, "## " = heading, "- " = bullet', { rows: 10, value: c.body });
      var preview = el('input', { type: 'checkbox', checked: lesson.is_preview });
      var published = el('input', { type: 'checkbox', checked: lesson.published });
      var status = el('div');
      var say = function (t, k) { status.textContent = ''; status.appendChild(notice(t, k)); };
      var form = el('form', { cls: 'lms-admin-card', onsubmit: function (e) {
        e.preventDefault();
        var url = video.querySelector('input').value.trim();
        if (url && !videoEmbed(url)) { say('Use a normal YouTube or Vimeo video link.', 'bad'); return; }
        var mv = mins.querySelector('input').value;
        Promise.all([
          db.from('lessons').update({ title: title.querySelector('input').value, duration_min: mv ? parseInt(mv, 10) : null, is_preview: preview.checked, published: published.checked }).eq('id', lesson.id).then(must),
          db.from('lesson_content').upsert({ lesson_id: lesson.id, body: body.querySelector('textarea').value, video_url: url }).then(must)
        ]).then(function () { reload(lesson.id); }).catch(adminError);
      } }, el('h2', { text: 'Edit lesson' }), title, mins, video, body,
        el('label', { cls: 'lms-check' }, preview, el('span', { text: 'Free preview (open without buying)' })),
        el('label', { cls: 'lms-check' }, published, el('span', { text: 'Published' })),
        status, el('button', { cls: 'btn main', type: 'submit', text: 'Save lesson' }));

      var picker = el('input', { type: 'file', multiple: true, accept: '.pdf,.mp4,.webm,.ppt,.pptx,.zip,.doc,.docx', 'aria-label': 'Choose files to upload' });
      var upStatus = el('div');
      picker.addEventListener('change', function () {
        var chosen = [].slice.call(picker.files);
        var big = chosen.filter(function (f) { return f.size > MAX_FILE; });
        upStatus.textContent = '';
        if (big.length) { upStatus.appendChild(notice(big[0].name + ' is over 50 MB. Put long videos on Vimeo or YouTube and paste the link instead.', 'bad')); return; }
        picker.disabled = true;
        upStatus.appendChild(notice('Uploading ' + chosen.length + ' file(s)…'));
        var start = files.reduce(function (m, f) { return Math.max(m, f.position); }, 0) + 1;
        Promise.all(chosen.map(function (f, i) {
          var safe = f.name.replace(/[^\w.-]+/g, '-').slice(-80);
          var path = course.id + '/' + lesson.id + '/' + Date.now() + '-' + safe;
          return db.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined }).then(must).then(function () {
            return db.from('lesson_files').insert({ lesson_id: lesson.id, title: f.name, storage_path: path, mime_type: f.type || '', size_bytes: f.size, position: start + i }).then(must);
          });
        })).then(function () { reload(lesson.id); }).catch(function (err) { picker.disabled = false; adminError(err); });
      });

      box.textContent = '';
      box.appendChild(form);
      box.appendChild(el('div', { cls: 'lms-admin-card' }, el('h2', { text: 'Lesson files' }),
        el('ul', { cls: 'lms-filelist' }, files.map(function (f) {
          return el('li', {}, el('span', {}, el('b', { text: f.title }), el('small', { text: sizeText(f.size_bytes) })),
            el('button', { cls: 'btn quiet', type: 'button', text: 'Remove', onclick: function () {
              if (!confirm('Remove "' + f.title + '"? This cannot be undone.')) return;
              db.storage.from(BUCKET).remove([f.storage_path]).then(must).then(function () {
                return db.from('lesson_files').delete().eq('id', f.id).then(must);
              }).then(function () { reload(lesson.id); }).catch(adminError);
            } }));
        })),
        el('label', { cls: 'lms-field' }, el('span', { text: 'Upload PDFs, slides or short videos (50 MB each)' }), picker), upStatus));
    }).catch(adminError);
  }

  ({ catalog: catalogue, course: coursePage, learn: learnPage, account: accountPage, admin: adminPage }[page] || function () {})();
})();
