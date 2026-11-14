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
    Promise.all([session(), db.from('courses').select('id,price_cents,currency,modules(lessons(is_preview))').then(must)]).then(function (r) {
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
          else if (isFree(c)) meta.appendChild(el('span', { cls: 'price', text: 'Free' }));
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
  // a course is free when every lesson is open (is_preview) and it has no price
  function isFree(course) {
    var all = lessonsOf(course);
    return !course.price_cents && all.length > 0 && all.every(function (l) { return l.is_preview; });
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
    if (db && isFree(course)) {
      box.appendChild(el('b', { cls: 'lms-price', text: 'Free' }));
      box.appendChild(el('p', { text: 'Every lesson in this course is free. Sign in to start and keep track of your progress.' }));
      box.appendChild(user
        ? el('a', { cls: 'btn main', href: learnLink(course, firstOpenLesson(course, access.done || {})), text: percent(course, access.done || {}) ? 'Continue learning' : 'Start learning' })
        : el('a', { cls: 'btn main', href: signInLink(), text: 'Sign in to start' }));
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

  function syllabus(course, access, user) {
    var free = isFree(course);
    // Before buying, only the first two modules are readable; the rest of the outline is blurred.
    var hide = !access.owned && !(free && user) && course.modules.length > 2;
    return el('div', { cls: 'lms-syllabus' }, course.modules.map(function (m, i) {
      if (hide && i >= 2) {
        return el('div', { cls: 'lms-blurred', 'aria-hidden': 'true' },
          el('div', { cls: 'lms-blurred-row' }, el('span', { text: 'Module ' + (i + 1) }), el('b', { text: m.title }), el('small', { text: m.lessons.length + (m.lessons.length === 1 ? ' lesson' : ' lessons') })),
          el('ol', {}, m.lessons.slice(0, 3).map(function (l) { return el('li', { text: l.title }); })));
      }
      return el('details', { open: i === 0 },
        el('summary', {}, el('span', { text: 'Module ' + (i + 1) }), el('b', { text: m.title }), el('small', { text: m.lessons.length + (m.lessons.length === 1 ? ' lesson' : ' lessons') })),
        el('ol', {}, m.lessons.map(function (l) {
          var open = db && (access.owned || l.is_preview);
          return el('li', { cls: access.done[l.id] ? 'done' : '' },
            open ? el('a', { href: learnLink(course, l), text: l.title }) : el('span', { text: l.title }),
            l.is_preview && !access.owned && !free ? el('em', { text: 'Free preview' }) : null,
            access.done[l.id] ? el('em', { text: 'Done' }) : null);
        })));
    }).concat(hide ? [el('p', { cls: 'lms-blur-note', text: (free ? 'Sign in' : 'Enrol') + ' to see the full outline: ' + (course.modules.length - 2) + ' more modules.' })] : []));
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
      if (paid) show(el('div', { cls: 'wrap lms-page' }, notice('Checking your payment…')));
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
            paid && !access.owned ? notice('We have not received this payment yet. If you completed it, refresh in a minute; if the course stays locked, email info@holyhornet.com. If the payment failed, you can try again above.', 'bad') : null,
            paid && access.owned ? notice('You now have full access to this course.', 'good') : null,
            el('h2', { cls: 'lms-h2', text: 'Course outline' }),
            syllabus(course, access, user))));
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
      if (b.slice(0, 2) === '::') {
        // ::figure and ::quiz blocks are drawn by lms-figures.js; ::video is taken out before this runs
        if (b.slice(0, 7) === '::quiz ' && window.HHFig && window.HHFig.quiz) return window.HHFig.quiz(b.slice(7));
        if (b.slice(0, 9) !== '::figure ' || !window.HHFig) return null;
        var fl = b.split('\n');
        return window.HHFig.figure(fl[0].slice(9), fl.slice(1).join(' ').trim());
      }
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
    var parts = window.HHFig ? window.HHFig.splitBody(content ? content.body : '') : { video: null, body: content ? content.body : '' };
    var lessonVideo = parts.video && parts.video.length ? window.HHFig.video(parts.video, lesson.title) : null;
    var empty = !embed && !lessonVideo && !parts.body.trim() && !files.length;

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
      lessonVideo,
      viewer,
      parts.body.trim() ? richText(parts.body) : null,
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
    var afterSignIn = next === 'account.html' ? 'account.html?welcome=1' : 'account.html?next=' + encodeURIComponent(next);
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
      if (mode === 'in') job = db.auth.signInWithPassword({ email: v(mail), password: pw.querySelector('input').value }).then(must).then(function () { location.replace(afterSignIn); });
      else if (mode === 'up') job = db.auth.signUp({ email: v(mail), password: pw.querySelector('input').value, options: { data: { full_name: v(name) }, emailRedirectTo: back } }).then(must).then(function (d) {
        if (d.session) location.replace(afterSignIn); else say('Check your email and click the link to confirm your account.', 'good');
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

  // ---------- "About you" details (supabase/student_details.sql) ----------
  var ABOUT = {
    experience: [['new', 'New to aviation and drones'], ['drone-hobby', 'I fly drones as a hobby'], ['drone-pro', 'I fly drones for work or hold a drone certificate'],
      ['student-pilot', 'Student pilot'], ['pilot', 'Licensed pilot'], ['engineer', 'Engineer or technician'], ['other', 'Something else']],
    goal: [['licence', 'Pass a licence or theory exam'], ['career', 'Start or grow a career'], ['business', 'Use drones in my business'], ['hobby', 'Personal interest'], ['other', 'Something else']],
    heard_from: [['search', 'Google or another search engine'], ['social', 'Social media'], ['friend', 'A friend or colleague'], ['work', 'My school or employer'], ['event', 'An event or fair'], ['other', 'Somewhere else']]
  };
  function aboutLabel(key, v) { var m = (ABOUT[key] || []).filter(function (o) { return o[0] === v; })[0]; return m ? m[1] : (v || ''); }
  function skipKey(user) { return 'hh-about-skip-' + user.id; }
  function skippedRecently(user) { try { return Date.now() - (+localStorage.getItem(skipKey(user)) || 0) < 14 * 864e5; } catch (e) { return false; } }

  function detailsOf(user) {
    return Promise.all([
      db.from('student_details').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    ]).then(function (r) {
      return { ready: !r[0].error, row: r[0].data || null, name: (r[1].data && r[1].data.full_name) || '' };
    });
  }

  function aboutForm(user, info, next, editing) {
    var d = info.row || {};
    var go = function () { location.replace(next ? safeNext(next) : 'account.html'); };
    var text = function (label, key, props) {
      props = props || {};
      props.value = key === 'full_name' ? info.name : (d[key] || '');
      props.name = key;
      return field(label, props);
    };
    var choose = function (label, key, required) {
      return el('label', { cls: 'lms-field' }, el('span', { text: label }),
        el('select', { name: key, required: required || null },
          el('option', { value: '', text: required ? 'Choose one' : 'Choose one (optional)' }),
          ABOUT[key].map(function (o) { return el('option', { value: o[0], text: o[1], selected: d[key] === o[0] || null }); })));
    };
    var msg = el('div');
    var news = el('input', { type: 'checkbox', name: 'news_ok', checked: !!d.news_ok });
    var form = el('form', { cls: 'lms-about', onsubmit: function (e) {
      e.preventDefault();
      var f = function (k) { var x = form.elements[k]; return x ? String(x.value).trim() : ''; };
      var row = { user_id: user.id, country: f('country'), city: f('city'), phone: f('phone'), occupation: f('occupation'), organisation: f('organisation'),
        experience: f('experience'), goal: f('goal'), heard_from: f('heard_from'), notes: f('notes'), news_ok: news.checked, updated_at: new Date().toISOString() };
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      var jobs = [db.from('student_details').upsert(row).then(must)];
      if (f('full_name') && f('full_name') !== info.name) jobs.push(db.from('profiles').update({ full_name: f('full_name') }).eq('id', user.id).then(must));
      Promise.all(jobs).then(go).catch(function (err) { btn.disabled = false; msg.textContent = ''; msg.appendChild(notice(err.message, 'bad')); });
    } },
      el('fieldset', {}, el('legend', { text: 'You' }),
        text('Full name', 'full_name', { type: 'text', required: true, autocomplete: 'name', maxlength: 120 }),
        el('div', { cls: 'lms-pair' },
          text('Country', 'country', { type: 'text', required: true, autocomplete: 'country-name', maxlength: 80 }),
          text('City (optional)', 'city', { type: 'text', autocomplete: 'address-level2', maxlength: 80 })),
        text('Phone (optional)', 'phone', { type: 'tel', autocomplete: 'tel', maxlength: 40 })),
      el('fieldset', {}, el('legend', { text: 'Your background' }),
        choose('Your experience', 'experience', true),
        el('div', { cls: 'lms-pair' },
          text('Job or studies (optional)', 'occupation', { type: 'text', maxlength: 120, autocomplete: 'organization-title' }),
          text('Company or school (optional)', 'organisation', { type: 'text', maxlength: 120, autocomplete: 'organization' }))),
      el('fieldset', {}, el('legend', { text: 'Your goals' }),
        choose('What do you want to achieve?', 'goal', true),
        choose('How did you hear about Holy Hornet?', 'heard_from', false),
        field('Anything we should know? (optional)', { rows: 3, name: 'notes', maxlength: 1000, value: d.notes || '' }),
        el('label', { cls: 'lms-check' }, news, el('span', { text: 'Email me when new courses open. You can stop this at any time.' }))),
      msg,
      el('div', { cls: 'actions' },
        el('button', { cls: 'btn main', type: 'submit', text: editing ? 'Save changes' : 'Save and continue' }),
        editing ? el('a', { cls: 'btn quiet', href: 'account.html', text: 'Cancel' })
          : el('button', { cls: 'btn quiet', type: 'button', text: 'Skip for now', onclick: function () { try { localStorage.setItem(skipKey(user), String(Date.now())); } catch (e) { /* storage blocked */ } go(); } })));
    document.title = 'About you | Holy Hornet';
    show(el('div', { cls: 'wrap lms-page lms-about-page' },
      el('span', { cls: 'kicker', text: editing ? 'My details' : 'Welcome to Holy Hornet' }),
      el('h1', { text: editing ? 'Your details' : 'Tell us about you' }),
      el('p', { cls: 'lms-lead', text: 'It takes a minute and helps us support your training. Only you and the Holy Hornet team can see these details.' }),
      form));
    if (!editing) (info.name ? form.elements.country : form.elements.full_name).focus();
  }

  function aboutSummary(info) {
    var d = info.row;
    if (!info.ready) return null;
    if (!d) return el('div', { cls: 'lms-about-card' }, el('div', {}, el('b', { text: 'Tell us about you' }), el('span', { text: 'Add your background and goals so we can support your training.' })),
      el('a', { cls: 'btn main', href: 'account.html?step=about', text: 'Add my details' }));
    var bits = [[d.city, d.country].filter(Boolean).join(', '), aboutLabel('experience', d.experience), aboutLabel('goal', d.goal)].filter(Boolean);
    return el('div', { cls: 'lms-about-card' }, el('div', {}, el('b', { text: info.name || 'My details' }), el('span', { text: bits.join(' · ') })),
      el('a', { cls: 'btn quiet', href: 'account.html?step=about', text: 'Edit my details' }));
  }

  function accountPage() {
    if (!db) { show(el('div', { cls: 'wrap lms-page lms-narrow' }, el('h1', { text: 'Student accounts open soon' }), el('p', {}, el('a', { href: 'education.html', text: 'See the courses' })))); return; }
    session().then(function (s) {
      if (s && recovering) { newPasswordForm(); return; }
      if (!s) { authForm('in'); return; }
      var user = s.user;
      return detailsOf(user).then(function (info) {
        var next = params.get('next');
        if (info.ready && (params.get('step') === 'about' || (!info.row && !skippedRecently(user)))) { aboutForm(user, info, next, !!info.row || params.get('step') === 'about'); return; }
        if (next) { location.replace(safeNext(next)); return; }
        return myLearning(user, info);
      });
    }).catch(fail);
  }

  function myLearning(user, info) {
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
            aboutSummary(info),
            cards.length ? el('div', { cls: 'lms-grid' }, cards) : el('p', {}, 'You have no courses yet. ', el('a', { href: 'education.html', text: 'Browse the courses' }), '.'),
            el('div', { cls: 'actions lms-gap' },
              r[0] ? el('a', { cls: 'btn main', href: 'admin.html', text: 'Admin dashboard' }) : null,
              el('button', { cls: 'btn quiet', type: 'button', text: 'Sign out', onclick: function () { db.auth.signOut().then(function () { location.replace('education.html'); }); } }))));
        });
      });
  }

  // ---------- admin ----------
  function adminPage() {
    if (!db) { show(el('div', { cls: 'wrap lms-page' }, notice('Connect Supabase first: see supabase/README.md.', 'bad'))); return; }
    session().then(function (s) {
      if (!s) { location.replace(signInLink()); return; }
      return isAdmin(s.user).then(function (ok) {
        if (!ok) { location.replace('account.html'); return; }
        if (params.get('view') === 'students') return adminStudents();
        if (params.get('view') !== 'courses' && !params.get('c')) return adminDashboard();
        return db.from('courses').select('id,title').order('position').then(must).then(function (list) { adminCourse(list, params.get('c') || list[0].id, null); });
      });
    }).catch(fail);
  }

  function adminTabs(current) {
    var tab = function (key, href, text) { return el('a', { href: href, text: text, 'aria-current': current === key ? 'page' : null }); };
    return el('nav', { cls: 'lms-tabs', 'aria-label': 'Admin sections' },
      tab('dashboard', 'admin.html', 'Dashboard'), tab('courses', 'admin.html?view=courses', 'Courses'), tab('students', 'admin.html?view=students', 'Students'));
  }

  // ---------- admin: students ----------
  function day(iso) { return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
  function paid(x) { return x.amount_cents ? money({ currency: x.currency || 'eur', price_cents: x.amount_cents }) : 'No charge'; }

  function adminStudents() {
    return db.rpc('admin_students').then(function (res) {
      if (res.error && /admin_students/.test(res.error.message || '')) {
        show(el('div', { cls: 'wrap lms-page' }, el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Students' }), adminTabs('students'),
          notice('The students list is not switched on yet. In Supabase, open SQL Editor and run supabase/admin_students.sql once.', 'bad')));
        return;
      }
      var rows = must(res);
      var bought = [].concat.apply([], rows.map(function (r) { return r.courses; }));
      var totals = {};
      bought.forEach(function (x) { if (x.amount_cents) totals[x.currency || 'eur'] = (totals[x.currency || 'eur'] || 0) + x.amount_cents; });
      var revenue = Object.keys(totals).map(function (c) { return money({ currency: c, price_cents: totals[c] }); }).join(' + ') || money({ currency: 'usd', price_cents: 0 });
      var titles = {};
      bought.forEach(function (x) { titles[x.course_id] = x.title; });

      var search = el('input', { type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search students' });
      var pick = el('select', { 'aria-label': 'Filter by course' }, el('option', { value: '', text: 'All students' }), el('option', { value: '*', text: 'Bought any course' }),
        Object.keys(titles).map(function (id) { return el('option', { value: id, text: titles[id] }); }));
      var body = el('tbody');
      var count = el('p', { cls: 'lms-count', role: 'status' });

      function visible() {
        var q = search.value.trim().toLowerCase(), c = pick.value;
        return rows.filter(function (r) {
          if (q && (r.full_name + ' ' + r.email).toLowerCase().indexOf(q) === -1) return false;
          if (c === '*') return r.courses.length > 0;
          return !c || r.courses.some(function (x) { return x.course_id === c; });
        });
      }
      function draw() {
        var list = visible();
        body.textContent = '';
        count.textContent = list.length + ' of ' + rows.length + ' students';
        list.forEach(function (r) {
          body.appendChild(el('tr', {},
            el('td', { 'data-label': 'Student' }, el('b', { text: r.full_name || '(no name)' }), el('a', { href: 'mailto:' + r.email, text: r.email }),
              r.is_admin ? el('small', { cls: 'lms-tag', text: 'Admin' }) : null),
            el('td', { 'data-label': 'Signed up', text: day(r.signed_up) }),
            el('td', { 'data-label': 'Last sign-in', text: day(r.last_sign_in) }),
            el('td', { 'data-label': 'Courses' }, r.courses.length ? r.courses.map(function (x) {
              var pct = x.total ? Math.round(100 * x.done / x.total) : 0;
              return el('div', { cls: 'lms-owned' },
                el('b', { text: x.title }),
                el('span', { text: paid(x) + ' · ' + day(x.enrolled_at) + (x.payment_id ? ' · ' + x.payment_id : '') }),
                el('span', { text: x.done + ' of ' + x.total + ' lessons done' }), bar(pct));
            }) : el('span', { cls: 'lms-soft', text: 'No courses yet' }))));
        });
      }
      function csvCell(v) {
        v = String(v === null || v === undefined ? '' : v);
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
        return '"' + v.replace(/"/g, '""') + '"';
      }
      function exportCsv() {
        var lines = [['Name', 'Email', 'Signed up', 'Last sign-in', 'Country', 'City', 'Phone', 'Experience', 'Goal', 'Job or studies', 'Company or school', 'Heard about us', 'Course news', 'Note', 'Course', 'Paid', 'Bought on', 'Mollie payment', 'Lessons done', 'Lessons total']];
        visible().forEach(function (r) {
          var d = r.details || {};
          var base = [r.full_name, r.email, day(r.signed_up), day(r.last_sign_in), d.country, d.city, d.phone, aboutLabel('experience', d.experience), aboutLabel('goal', d.goal),
            d.occupation, d.organisation, aboutLabel('heard_from', d.heard_from), r.details ? (d.news_ok ? 'Yes' : 'No') : '', d.notes];
          if (!r.courses.length) lines.push(base.concat(['', '', '', '', '', '']));
          r.courses.forEach(function (x) { lines.push(base.concat([x.title, paid(x), day(x.enrolled_at), x.payment_id || '', x.done, x.total])); });
        });
        var blob = new Blob(['﻿' + lines.map(function (l) { return l.map(csvCell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = el('a', { href: URL.createObjectURL(blob), download: 'holy-hornet-students.csv' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      }
      search.addEventListener('input', draw);
      pick.addEventListener('change', draw);

      var stat = function (n, label) { return el('div', { cls: 'lms-stat' }, el('b', { text: n }), el('span', { text: label })); };
      show(el('div', { cls: 'wrap lms-page' },
        el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Students' }), adminTabs('students'),
        el('div', { cls: 'lms-stats' },
          stat(String(rows.length), 'accounts'),
          stat(String(rows.filter(function (r) { return r.courses.length; }).length), 'paying students'),
          stat(String(bought.length), 'courses sold'),
          stat(revenue, 'paid in total')),
        el('div', { cls: 'lms-filters' }, search, pick, el('button', { cls: 'btn quiet', type: 'button', text: 'Download CSV', onclick: exportCsv })),
        count,
        el('div', { cls: 'lms-table-wrap' }, el('table', { cls: 'lms-table' },
          el('thead', {}, el('tr', {}, ['Student', 'Signed up', 'Last sign-in', 'Courses'].map(function (h) { return el('th', { scope: 'col', text: h }); }))),
          body)),
        el('p', { cls: 'lms-soft', text: 'Refunds remove a course here automatically. Full payment details are in your Mollie dashboard.' })));
      draw();
    });
  }

  // ---------- admin: dashboard ----------
  var DAY = 864e5;
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function startOf(d, unit) {
    d = new Date(d);
    d.setHours(0, 0, 0, 0);
    if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (unit === 'month') d.setDate(1);
    return d;
  }
  function nextOf(d, unit) {
    d = new Date(d);
    if (unit === 'day') d.setDate(d.getDate() + 1);
    else if (unit === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }
  function bucketLabel(d, unit) {
    return unit === 'month' ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function ago(iso) {
    if (!iso) return 'Never';
    var d = Math.floor((Date.now() - new Date(iso)) / DAY);
    return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? d + ' days ago' : day(iso);
  }

  // Column chart in plain HTML: crisp at any width, hover or focus a column for its value.
  function colChart(title, points, fmt, emptyText, whole) {
    var top = Math.max.apply(null, points.map(function (p) { return p.value; }).concat([0]));
    var max = whole && top <= 10 ? Math.max(2, Math.ceil(top / 2) * 2) : niceMax(top);
    var every = Math.ceil(points.length / 8);
    var plot = el('div', { cls: 'hhd-plot' },
      [1, 0.5, 0].map(function (f) { return el('i', { cls: 'hhd-grid', style: 'bottom:' + (f * 100) + '%' }, el('span', { text: fmt(max * f) })); }),
      el('div', { cls: 'hhd-cols' }, points.map(function (p, i) {
        var h = p.value ? Math.max(1.5, p.value / max * 100) : 0;
        return el('div', { cls: 'hhd-col', tabindex: 0, 'aria-label': p.label + ': ' + fmt(p.value) },
          el('i', { style: 'height:' + h + '%' }),
          el('span', { cls: 'hhd-tip' }, el('b', { text: fmt(p.value) }), el('small', { text: p.label + (p.note ? ' · ' + p.note : '') })),
          el('small', { cls: 'hhd-x', text: i % every === 0 ? p.label : '' }));
      })));
    var empty = !points.some(function (p) { return p.value; });
    return el('section', { cls: 'hhd-card' },
      el('h2', { text: title }),
      empty ? el('p', { cls: 'hhd-empty', text: emptyText }) : plot,
      el('table', { cls: 'sr-only' }, el('caption', { text: title }), el('tbody', {}, points.map(function (p) { return el('tr', {}, el('th', { text: p.label }), el('td', { text: fmt(p.value) })); }))));
  }

  function adminDashboard() {
    return Promise.all([
      db.rpc('admin_students'),
      db.from('courses').select('id,title,price_cents,currency,published').order('position').then(must)
    ]).then(function (r) {
      if (r[0].error && /admin_students/.test(r[0].error.message || '')) {
        show(el('div', { cls: 'wrap lms-page' }, el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Dashboard' }), adminTabs('dashboard'),
          notice('The student data is not switched on yet. In Supabase, open SQL Editor and run supabase/admin_students.sql once.', 'bad')));
        return;
      }
      var allRows = must(r[0]), courses = r[1];
      var state = { range: '90', staff: false, q: '', filter: '', sort: 'signed_up', dir: -1 };
      try { var saved = JSON.parse(localStorage.getItem('hh-dash') || '{}'); if (saved.range) state.range = saved.range; } catch (e) { /* storage blocked */ }
      var root = el('div', { cls: 'wrap lms-page hhd' });
      var dialog = el('dialog', { cls: 'hhd-dialog' });
      var loadedAt = new Date();

      function rowsNow() { return allRows.filter(function (s) { return state.staff || !s.is_admin; }); }
      function enrolsOf(rows) {
        return [].concat.apply([], rows.map(function (s) { return s.courses.map(function (c) { c.student = s; return c; }); }));
      }
      function pctOf(c) { return c.total ? Math.round(100 * c.done / c.total) : 0; }
      function cur(list) {
        var t = {};
        list.forEach(function (e) { if (e.amount_cents) t[e.currency || 'usd'] = (t[e.currency || 'usd'] || 0) + e.amount_cents; });
        return t;
      }
      function moneyOf(t) {
        var keys = Object.keys(t);
        return keys.length ? keys.map(function (c) { return money({ currency: c, price_cents: t[c] }); }).join(' + ') : money({ currency: mainCur, price_cents: 0 });
      }
      var mainCur = (function () {
        var t = cur(enrolsOf(allRows)), best = (courses[0] && courses[0].currency) || 'usd';
        Object.keys(t).forEach(function (c) { if (!t[best] || t[c] > t[best]) best = c; });
        return best;
      })();
      function fmtMoney(v) { return money({ currency: mainCur, price_cents: Math.round(v) }).replace(/\.00$/, ''); }
      function inWin(iso, from, to) { if (!iso) return false; var t = new Date(iso).getTime(); return t >= from && t < to; }

      function window_() {
        var now = Date.now();
        if (state.range === 'all') {
          var first = now;
          allRows.forEach(function (s) { first = Math.min(first, new Date(s.signed_up).getTime()); });
          return { from: first, to: now + 1, prev: null };
        }
        var days = +state.range;
        return { from: now - days * DAY, to: now + 1, prev: now - 2 * days * DAY };
      }

      function kpi(label, value, sub, cur_, prev, fmt) {
        var delta = null;
        if (prev !== null && prev !== undefined) {
          if (prev === 0 && cur_ === 0) delta = el('span', { cls: 'hhd-delta flat', text: 'No change' });
          else if (prev === 0) delta = el('span', { cls: 'hhd-delta up', text: '▲ New' });
          else {
            var ch = Math.round((cur_ - prev) / prev * 100);
            delta = el('span', { cls: 'hhd-delta ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat'), text: (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '') + Math.abs(ch) + '%' });
          }
          delta.title = 'Previous period: ' + (fmt ? fmt(prev) : prev);
        }
        return el('div', { cls: 'hhd-kpi' }, el('span', { text: label }), el('b', { text: value }), el('small', {}, delta, sub ? el('em', { text: sub }) : null));
      }

      function buckets(w) {
        var span = (w.to - w.from) / DAY, unit = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month';
        var list = [], d = startOf(w.from, unit);
        while (d.getTime() < w.to) { var n = nextOf(d, unit); list.push({ from: d.getTime(), to: n.getTime(), label: bucketLabel(d, unit), value: 0 }); d = n; }
        return { unit: unit, list: list };
      }
      function fill(b, items, dateKey, valueFn) {
        items.forEach(function (it) {
          var t = new Date(it[dateKey]).getTime();
          b.list.forEach(function (x) { if (t >= x.from && t < x.to) x.value += valueFn(it); });
        });
        return b.list;
      }

      function studentDialog(s) {
        var spent = cur(s.courses);
        dialog.textContent = '';
        dialog.appendChild(el('div', { cls: 'hhd-dialog-head' },
          el('div', {}, el('h2', { text: s.full_name || '(no name)' }), el('a', { href: 'mailto:' + s.email, text: s.email })),
          el('button', { cls: 'btn quiet', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })));
        dialog.appendChild(el('dl', { cls: 'hhd-facts' },
          el('div', {}, el('dt', { text: 'Signed up' }), el('dd', { text: day(s.signed_up) })),
          el('div', {}, el('dt', { text: 'Last sign-in' }), el('dd', { text: ago(s.last_sign_in) })),
          el('div', {}, el('dt', { text: 'Spent' }), el('dd', { text: moneyOf(spent) })),
          el('div', {}, el('dt', { text: 'Courses' }), el('dd', { text: String(s.courses.length) }))));
        var dt = s.details;
        if (dt) {
          var line = function (k, v) { return v ? el('div', {}, el('dt', { text: k }), el('dd', { text: v })) : null; };
          dialog.appendChild(el('dl', { cls: 'hhd-about' },
            line('From', [dt.city, dt.country].filter(Boolean).join(', ')), line('Phone', dt.phone),
            line('Experience', aboutLabel('experience', dt.experience)), line('Goal', aboutLabel('goal', dt.goal)),
            line('Job or studies', [dt.occupation, dt.organisation].filter(Boolean).join(' · ')), line('Heard about us', aboutLabel('heard_from', dt.heard_from)),
            line('Course news', dt.news_ok ? 'Yes, by email' : 'No'), line('Note', dt.notes)));
        } else dialog.appendChild(el('p', { cls: 'lms-soft', text: 'This student has not filled in their details yet.' }));
        dialog.appendChild(s.courses.length ? el('div', { cls: 'hhd-owned' }, s.courses.map(function (c) {
          return el('div', { cls: 'hhd-owned-row' },
            el('div', {}, el('b', { text: c.title }), el('small', { text: paid(c) + ' · bought ' + day(c.enrolled_at) + (c.payment_id ? ' · ' + c.payment_id : '') })),
            el('div', { cls: 'hhd-prog' }, bar(pctOf(c)), el('small', { text: c.done + ' of ' + c.total + ' lessons · ' + pctOf(c) + '%' })));
        })) : el('p', { cls: 'lms-soft', text: 'This student has not bought or started a course yet.' }));
        dialog.showModal();
      }

      function render() {
        try { localStorage.setItem('hh-dash', JSON.stringify({ range: state.range })); } catch (e) { /* storage blocked */ }
        var rows = rowsNow(), enrols = enrolsOf(rows), w = window_();
        var inNow = function (iso) { return inWin(iso, w.from, w.to); }, inPrev = function (iso) { return w.prev !== null && inWin(iso, w.prev, w.from); };
        var sum = function (list) { return list.reduce(function (a, e) { return a + (e.amount_cents || 0); }, 0); };
        var salesNow = enrols.filter(function (e) { return inNow(e.enrolled_at); }), salesPrev = enrols.filter(function (e) { return inPrev(e.enrolled_at); });
        var paidNow = salesNow.filter(function (e) { return e.amount_cents; }), paidPrev = salesPrev.filter(function (e) { return e.amount_cents; });
        var newNow = rows.filter(function (s) { return inNow(s.signed_up); }).length, newPrev = rows.filter(function (s) { return inPrev(s.signed_up); }).length;
        var activeNow = rows.filter(function (s) { return inNow(s.last_sign_in); }).length;
        var avgProg = enrols.length ? Math.round(enrols.reduce(function (a, e) { return a + pctOf(e); }, 0) / enrols.length) : 0;
        var finished = enrols.filter(function (e) { return e.total && e.done >= e.total; }).length;
        var learners = rows.filter(function (s) { return s.courses.length; }).length;
        var rangeName = { '30': 'last 30 days', '90': 'last 90 days', '365': 'last 12 months', all: 'all time' }[state.range];

        var seg = el('div', { cls: 'hhd-seg', role: 'group', 'aria-label': 'Time range' }, [['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']].map(function (o) {
          return el('button', { type: 'button', 'aria-pressed': String(state.range === o[0]), text: o[1], onclick: function () { state.range = o[0]; render(); } });
        }));
        var staff = el('label', { cls: 'hhd-check' }, el('input', { type: 'checkbox', checked: state.staff, onchange: function (e) { state.staff = e.target.checked; render(); } }), ' Include admin accounts');
        var refresh = el('button', { cls: 'btn quiet', type: 'button', text: 'Refresh', onclick: function () { adminDashboard(); } });

        var revB = buckets(w), sigB = buckets(w);
        var revPts = fill(revB, salesNow.filter(function (e) { return (e.currency || mainCur) === mainCur; }), 'enrolled_at', function (e) { return e.amount_cents || 0; });
        var salesCount = buckets(w); fill(salesCount, salesNow, 'enrolled_at', function () { return 1; });
        revPts.forEach(function (p, i) { var n = salesCount.list[i].value; p.note = n + (n === 1 ? ' sale' : ' sales'); });
        var sigPts = fill(sigB, rows.filter(function (s) { return inNow(s.signed_up); }), 'signed_up', function () { return 1; });
        var per = { day: 'day', week: 'week', month: 'month' }[revB.unit];

        // course performance
        var perf = courses.map(function (c) {
          var list = enrols.filter(function (e) { return e.course_id === c.id; });
          return { c: c, sold: list.length, paidCount: list.filter(function (e) { return e.amount_cents; }).length, rev: cur(list), revMain: sum(list.filter(function (e) { return (e.currency || mainCur) === mainCur; })),
            avg: list.length ? Math.round(list.reduce(function (a, e) { return a + pctOf(e); }, 0) / list.length) : 0,
            done: list.filter(function (e) { return e.total && e.done >= e.total; }).length };
        });
        var topRev = Math.max.apply(null, perf.map(function (p) { return p.revMain; }).concat([1]));

        // lists
        var recent = enrols.slice().sort(function (a, b) { return new Date(b.enrolled_at) - new Date(a.enrolled_at); }).slice(0, 6);
        var stuck = enrols.filter(function (e) { return e.done === 0 && Date.now() - new Date(e.enrolled_at) > 7 * DAY; })
          .sort(function (a, b) { return new Date(a.enrolled_at) - new Date(b.enrolled_at); }).slice(0, 6);
        var quiet = rows.filter(function (s) { return s.courses.length && s.courses.some(function (c) { return c.done < c.total; }) && (!s.last_sign_in || Date.now() - new Date(s.last_sign_in) > 30 * DAY); });

        var person = function (s, extra) {
          return el('li', {}, el('button', { type: 'button', cls: 'hhd-person', onclick: function () { studentDialog(s); } },
            el('span', { cls: 'hhd-avatar', text: ((s.full_name || s.email || '?').trim()[0] || '?').toUpperCase() }),
            el('span', {}, el('b', { text: s.full_name || s.email }), el('small', { text: extra }))));
        };

        // students table
        var search = el('input', { type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search students', value: state.q });
        var filterSel = el('select', { 'aria-label': 'Show' }, [['', 'All students'], ['paying', 'Bought a course'], ['none', 'No course yet'], ['stuck', 'Bought, not started'], ['quiet', 'Inactive 30+ days']].map(function (o) {
          return el('option', { value: o[0], text: o[1] });
        }));
        filterSel.value = state.filter;
        var tbody = el('tbody'), count = el('p', { cls: 'lms-count', role: 'status' });
        var spentMain = function (s) { return s.courses.reduce(function (a, c) { return a + ((c.currency || mainCur) === mainCur ? (c.amount_cents || 0) : 0); }, 0); };
        var progOf = function (s) { return s.courses.length ? Math.round(s.courses.reduce(function (a, c) { return a + pctOf(c); }, 0) / s.courses.length) : -1; };
        var keyFns = { name: function (s) { return (s.full_name || s.email).toLowerCase(); }, signed_up: function (s) { return new Date(s.signed_up).getTime(); },
          last: function (s) { return s.last_sign_in ? new Date(s.last_sign_in).getTime() : 0; }, spent: spentMain, progress: progOf };
        function tableRows() {
          var q = state.q.trim().toLowerCase();
          return rows.filter(function (s) {
            if (q && ((s.full_name || '') + ' ' + s.email).toLowerCase().indexOf(q) === -1) return false;
            if (state.filter === 'paying') return s.courses.length > 0;
            if (state.filter === 'none') return !s.courses.length;
            if (state.filter === 'stuck') return s.courses.some(function (c) { return c.done === 0; });
            if (state.filter === 'quiet') return !s.last_sign_in || Date.now() - new Date(s.last_sign_in) > 30 * DAY;
            return true;
          }).sort(function (a, b) { var ka = keyFns[state.sort](a), kb = keyFns[state.sort](b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * state.dir; });
        }
        function drawTable() {
          var list = tableRows();
          tbody.textContent = '';
          count.textContent = list.length + ' of ' + rows.length + ' students';
          list.forEach(function (s) {
            var p = progOf(s);
            tbody.appendChild(el('tr', { tabindex: 0, onclick: function () { studentDialog(s); }, onkeydown: function (e) { if (e.key === 'Enter') studentDialog(s); } },
              el('td', { 'data-label': 'Student' }, el('b', { text: s.full_name || '(no name)' }), el('span', { cls: 'lms-soft', text: s.email + (s.details && s.details.country ? ' · ' + s.details.country : '') }), s.is_admin ? el('small', { cls: 'lms-tag', text: 'Admin' }) : null),
              el('td', { 'data-label': 'Signed up', text: day(s.signed_up) }),
              el('td', { 'data-label': 'Last active', text: ago(s.last_sign_in) }),
              el('td', { 'data-label': 'Courses', text: s.courses.length ? s.courses.map(function (c) { return c.title; }).join(', ') : '—' }),
              el('td', { 'data-label': 'Spent', cls: 'num', text: moneyOf(cur(s.courses)) }),
              el('td', { 'data-label': 'Progress' }, p < 0 ? el('span', { cls: 'lms-soft', text: '—' }) : el('div', { cls: 'hhd-prog' }, bar(p), el('small', { text: p + '%' })))));
          });
          [].forEach.call(thead.querySelectorAll('button'), function (b) {
            var on = b.dataset.k === state.sort;
            b.parentNode.setAttribute('aria-sort', on ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
            b.lastChild.textContent = on ? (state.dir > 0 ? ' ▲' : ' ▼') : '';
          });
        }
        var thead = el('thead', {}, el('tr', {}, [['name', 'Student'], ['signed_up', 'Signed up'], ['last', 'Last active'], [null, 'Courses'], ['spent', 'Spent'], ['progress', 'Progress']].map(function (h) {
          return el('th', { scope: 'col', cls: h[0] === 'spent' ? 'num' : null }, h[0] ? el('button', { type: 'button', 'data-k': h[0], onclick: function () {
            if (state.sort === h[0]) state.dir = -state.dir; else { state.sort = h[0]; state.dir = h[0] === 'name' ? 1 : -1; }
            drawTable();
          } }, h[1], el('span')) : h[1]);
        })));
        search.addEventListener('input', function () { state.q = search.value; drawTable(); });
        filterSel.addEventListener('change', function () { state.filter = filterSel.value; drawTable(); });

        document.title = 'Dashboard | Holy Hornet';
        root.textContent = '';
        root.appendChild(el('div', { cls: 'hhd-head' },
          el('div', {}, el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Dashboard' })),
          el('div', { cls: 'hhd-tools' }, seg, refresh)));
        root.appendChild(adminTabs('dashboard'));
        root.appendChild(el('p', { cls: 'hhd-sub' }, 'Showing the ' + rangeName + '. Updated ' + loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '. ', staff));

        var cmp = w.prev !== null;
        root.appendChild(el('div', { cls: 'hhd-kpis' },
          kpi('Revenue', moneyOf(cur(paidNow)), moneyOf(cur(enrolsOf(rows))) + ' all time', sum(paidNow), cmp ? sum(paidPrev) : null, fmtMoney),
          kpi('Courses sold', String(salesNow.length), paidNow.length + ' paid', salesNow.length, cmp ? salesPrev.length : null),
          kpi('New students', String(newNow), rows.length + ' accounts in total', newNow, cmp ? newPrev : null),
          kpi('Active students', String(activeNow), 'signed in during this period', activeNow, null),
          kpi('Average progress', avgProg + '%', learners + ' learners with a course', avgProg, null),
          kpi('Courses finished', String(finished), enrols.length ? Math.round(finished / enrols.length * 100) + '% of enrolments' : 'no enrolments yet', finished, null)));

        root.appendChild(el('div', { cls: 'hhd-two' },
          colChart('Revenue per ' + per + (Object.keys(cur(paidNow)).length > 1 ? ' (' + mainCur.toUpperCase() + ' only)' : ''), revPts, fmtMoney, 'No sales in this period yet.'),
          colChart('New students per ' + per, sigPts, function (v) { return String(Math.round(v)); }, 'No sign-ups in this period.', true)));

        root.appendChild(el('section', { cls: 'hhd-card' }, el('h2', { text: 'Courses (all time)' }),
          el('div', { cls: 'lms-table-wrap' }, el('table', { cls: 'lms-table hhd-courses' },
            el('thead', {}, el('tr', {}, ['Course', 'Price', 'Students', 'Revenue', 'Avg progress', 'Finished'].map(function (h, i) { return el('th', { scope: 'col', cls: i && i !== 4 ? 'num' : null, text: h }); }))),
            el('tbody', {}, perf.map(function (p) {
              return el('tr', {},
                el('td', { 'data-label': 'Course' }, el('b', { text: p.c.title }), p.c.published ? null : el('small', { cls: 'lms-tag', text: 'Hidden' })),
                el('td', { 'data-label': 'Price', cls: 'num', text: p.c.price_cents ? money(p.c) : 'Free' }),
                el('td', { 'data-label': 'Students', cls: 'num', text: String(p.sold) }),
                el('td', { 'data-label': 'Revenue', cls: 'num' }, el('span', { text: moneyOf(p.rev) }), el('i', { cls: 'hhd-share', style: 'width:' + Math.round(p.revMain / topRev * 100) + '%' })),
                el('td', { 'data-label': 'Avg progress' }, p.sold ? el('div', { cls: 'hhd-prog' }, bar(p.avg), el('small', { text: p.avg + '%' })) : el('span', { cls: 'lms-soft', text: '—' })),
                el('td', { 'data-label': 'Finished', cls: 'num', text: String(p.done) }));
            }))))));

        root.appendChild(el('div', { cls: 'hhd-three' },
          el('section', { cls: 'hhd-card' }, el('h2', { text: 'Latest purchases' }),
            recent.length ? el('ul', { cls: 'hhd-people' }, recent.map(function (e) { return person(e.student, e.title + ' · ' + paid(e) + ' · ' + ago(e.enrolled_at)); })) : el('p', { cls: 'hhd-empty', text: 'No purchases yet.' })),
          el('section', { cls: 'hhd-card' }, el('h2', { text: 'Bought but not started' }),
            stuck.length ? el('ul', { cls: 'hhd-people' }, stuck.map(function (e) { return person(e.student, e.title + ' · bought ' + ago(e.enrolled_at)); })) : el('p', { cls: 'hhd-empty', text: 'Everyone who bought a course has started it.' })),
          el('section', { cls: 'hhd-card' }, el('h2', { text: 'Gone quiet (30+ days)' }),
            quiet.length ? el('ul', { cls: 'hhd-people' }, quiet.slice(0, 6).map(function (s) { var a = ago(s.last_sign_in); return person(s, 'Last sign-in ' + (/^\d/.test(a) ? a : a.toLowerCase())); })) : el('p', { cls: 'hhd-empty', text: 'No learners have gone quiet.' }))));

        var withD = rows.filter(function (s) { return s.details; });
        var tally = function (fn) {
          var t = {};
          withD.forEach(function (s) { var k = fn(s.details); if (k) t[k] = (t[k] || 0) + 1; });
          return Object.keys(t).map(function (k) { return [k, t[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
        };
        var hbars = function (title, list) {
          var top = list.length ? list[0][1] : 1;
          return el('div', { cls: 'hhd-hbars' }, el('h3', { text: title }), list.length ? el('ul', {}, list.map(function (x) {
            return el('li', {}, el('span', { text: x[0] }), el('i', {}, el('b', { style: 'width:' + Math.round(x[1] / top * 100) + '%' })), el('small', { text: String(x[1]) }));
          })) : el('p', { cls: 'hhd-empty', text: 'No answers yet.' }));
        };
        root.appendChild(el('section', { cls: 'hhd-card' },
          el('div', { cls: 'hhd-card-head' }, el('h2', { text: 'About your students' }), el('span', { cls: 'lms-soft', text: withD.length + ' of ' + rows.length + ' filled in their details' })),
          el('div', { cls: 'hhd-about-grid' },
            hbars('Country', tally(function (d) { var c = (d.country || '').trim(); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ''; })),
            hbars('Experience', tally(function (d) { return aboutLabel('experience', d.experience); })),
            hbars('Goal', tally(function (d) { return aboutLabel('goal', d.goal); })),
            hbars('Heard about us', tally(function (d) { return aboutLabel('heard_from', d.heard_from); })))));

        root.appendChild(el('section', { cls: 'hhd-card' },
          el('div', { cls: 'hhd-card-head' }, el('h2', { text: 'Students' }), el('a', { cls: 'btn quiet', href: 'admin.html?view=students', text: 'Full list and CSV' })),
          el('div', { cls: 'lms-filters' }, search, filterSel), count,
          el('div', { cls: 'lms-table-wrap' }, el('table', { cls: 'lms-table hhd-students' }, thead, tbody)),
          el('p', { cls: 'lms-soft', text: 'Click a student for their courses, payments and progress. Refunds remove a course automatically.' })));
        root.appendChild(dialog);
        drawTable();
      }

      dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
      show(root);
      render();
    });
  }

  function adminCourse(list, id, openLesson) {
    loadCourse(id).then(function (course) {
      var v = function (f, tag) { return f.querySelector(tag || 'input').value; };
      var reload = function (l) { adminCourse(list, id, l === undefined ? openLesson : l); };
      var run = function (p, l) { return p.then(must).then(function () { reload(l); }).catch(adminError); };
      var title = field('Title', { value: course.title, required: true });
      var summary = field('Short summary', { value: course.summary });
      var desc = field('Full description', { rows: 4, value: course.description });
      var price = field('Price in ' + (course.currency || 'eur').toUpperCase() + ' (empty = not on sale)', { type: 'number', min: '0.5', step: '0.01', value: course.price_cents ? (course.price_cents / 100).toFixed(2) : '' });
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
        el('span', { cls: 'kicker', text: 'Admin' }), el('h1', { text: 'Manage courses' }), adminTabs('courses'),
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
