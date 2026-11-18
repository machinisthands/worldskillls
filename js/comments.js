/* Machinist Hands — comments on project pages (js/comments.js, needs js/app.js first).
 * Stored in Firebase Firestore (collection "comments"); writing needs Google sign-in.
 * Comments appear at once. Bad words (English, Malayalam, Manglish) and links are refused here
 * and, with the same list, by firestore.rules. Writers can edit and delete their own comments;
 * the site owner (the e-mail in firestore.rules) can delete any. Edit / Delete stay hidden until
 * a comment is long-pressed (phone) or double-clicked (computer), and Delete asks once more.
 * The comments load when the card comes near the screen; the sign-in library when the panel opens.
 */
(function () {
  'use strict';
  const sheet = document.getElementById('comments');
  const teaser = document.querySelector('.cmt-teaser');
  if (!sheet || !teaser || !window.MH) return;

  const { FIREBASE, DOCS, API, post } = window.MH;
  const page = sheet.dataset.page;
  const $ = (s) => sheet.querySelector(s);
  const list = $('.cmt-all');
  const form = $('.cmt-form');
  const text = $('#cmt-text');
  const say = (m) => { $('.cmt-status').textContent = m || ''; };
  // Same list as in firestore.rules (generated from one list; keep them in sync)
  const BAD = new RegExp("(f+[\\W_]*u+[\\W_]*c+[\\W_]*k|\\bf+[\\W_]*c+[\\W_]*k|\\bfuk|\\bphuck|motherf|\\bsh[i1!]+t|b[i1!]+tch|bastard|a[s$5]{2}hole|\\bcunt|\\bdick(head)?\\b|\\bpussy|\\bslut|\\bwhore|\\bnigg|\\bfag(got)?s?\\b|\\bretard|\\bporn|\\bwtf\\b|\\bmy[iy]?re?\\b|\\bmyr[eu]|\\bmay[iy]r|\\bpooru|\\bpoorimon|\\bkunna\\b|\\bkunne\\b|tha+yo+l+i|pundach|koothich|kazhuver|p[ou]layaa?di|\\boomb|\\bumbi\\b|n[a]+y[iy]nte\\s*mon|theetam|\\bthendi\\b|\u0d2e\u0d48\u0d30|\u0d2e\u0d2f\u0d3f\u0d30|\u0d2a\u0d42\u0d31|\u0d15\u0d41\u0d23\u0d4d\u0d23|\u0d24\u0d3e\u0d2f\u0d4b\u0d33\u0d3f|\u0d2a\u0d41\u0d23\u0d4d\u0d1f\u0d1a\u0d4d\u0d1a\u0d3f|\u0d15\u0d42\u0d24\u0d4d\u0d24\u0d3f\u0d1a\u0d4d\u0d1a\u0d3f|\u0d15\u0d34\u0d41\u0d35\u0d47\u0d31\u0d3f|\u0d2a\u0d4a\u0d32\u0d2f\u0d3e\u0d1f\u0d3f|\u0d2a\u0d41\u0d32\u0d2f\u0d3e\u0d1f\u0d3f|\u0d0a\u0d2e\u0d4d\u0d2a|\u0d28\u0d3e\u0d2f\u0d3f\u0d28\u0d4d\u0d31\u0d46 \u0d2e\u0d4b|\u0d24\u0d46\u0d23\u0d4d\u0d1f\u0d3f|\u0d24\u0d40\u0d1f\u0d4d\u0d1f\u0d02)", 'u');
  const check = (t) => {
    if (t.length < 2) return 'Please write a little more.';
    if (/https?:|www\./i.test(t)) return 'Please remove the link: comments cannot contain links.';
    if (BAD.test(t.toLowerCase().replace(/[​-‍]/g, ''))) return 'Please keep it friendly: this comment has words that are not allowed.';
    return '';
  };

  let user = null;      // signed-in Firebase user
  let owner = false;    // true when the site owner is signed in
  let fb = null;        // { F, auth } once the sign-in library has loaded
  let comments = [];
  let picked = null;    // id of the comment whose Edit / Delete are showing (kept when the list redraws)
  const mine = (c) => Boolean(user && c.uid === user.uid);

  // ---------- Firestore ----------
  const auth = async () => (user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {});
  const write = async (w) => post('commit', { writes: [w] }, await auth());
  const field = (f, k) => f[k] && (f[k].stringValue ?? f[k].timestampValue);
  const load = () => post('runQuery', { structuredQuery: { from: [{ collectionId: 'comments' }],
    where: { fieldFilter: { field: { fieldPath: 'page' }, op: 'EQUAL', value: { stringValue: page } } } } })
    .then((rows) => {
      comments = rows.filter((r) => r.document).map(({ document: d }) => {
        const f = d.fields || {};
        return { id: d.name.split('/').pop(), text: field(f, 'text') || '', name: field(f, 'name') || 'Visitor',
          photo: field(f, 'photo') || '', uid: field(f, 'uid'), created: field(f, 'created'), edited: field(f, 'edited') };
      }).sort((a, b) => String(b.created).localeCompare(String(a.created))); // newest first
      render();
    })
    .catch(() => { $('.cmt-loading').textContent = 'Comments could not be loaded.'; });

  // ---------- Showing comments ----------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const button = (label, fn, cls = 'cmt-act') => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      const r = fn();
      if (!r || !r.then) return;
      b.disabled = true;
      r.catch(() => { b.disabled = false; say('That did not work. Please try again.'); });
    });
    return b;
  };
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!isFinite(s)) return '';
    for (const [unit, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (s >= n) return rtf.format(-Math.floor(s / n), unit);
    }
    return 'just now';
  };
  const item = (c) => {
    const li = el('li', mine(c) ? 'cmt cmt-mine' : 'cmt');
    li.dataset.id = c.id;
    const avatar = el(c.photo ? 'img' : 'span', 'cmt-avatar', c.photo ? '' : c.name.trim().charAt(0).toUpperCase());
    if (c.photo) Object.assign(avatar, { src: c.photo, alt: '', width: 32, height: 32, referrerPolicy: 'no-referrer', loading: 'lazy' });
    const meta = el('p', 'cmt-meta');
    meta.append(el('b', '', c.name));
    if (mine(c)) meta.append(el('span', 'cmt-you', 'You'));
    const when = el('time', '', c.created ? ago(c.created) : '');
    if (c.created) when.dateTime = c.created;
    meta.append(' ', when, c.edited ? ' · edited' : '');
    const body = el('div', 'cmt-body');
    body.append(meta, el('p', 'cmt-text', c.text)); // plain text only, never HTML
    if (owner || mine(c)) {
      const box = actions(c);
      if (c.id === picked) { box.hidden = false; li.classList.add('cmt-picked'); }
      body.append(box);
      li.tabIndex = 0;
      li.setAttribute('aria-label', `${c.name}: ${c.text}. Press Enter to edit or delete.`);
    }
    li.append(avatar, body);
    return li;
  };
  const render = () => {
    list.replaceChildren(...comments.map(item));
    $('.cmt-empty').hidden = comments.length > 0;
    $('.cmt-loading').hidden = true;
    document.querySelectorAll('.cmt-count').forEach((e) => { e.textContent = comments.length || ''; });
    const c = comments[0];
    teaser.querySelector('.cmt-teaser-text').textContent = c
      ? `${c.name}: ${c.text.length > 90 ? `${c.text.slice(0, 90)}…` : c.text}`
      : 'Ask about setups, tools or the drawing';
  };

  // ---------- Edit / Delete (hidden until long-press or double-click) ----------
  const remove = (c) => write({ delete: `${DOCS}/comments/${c.id}` })
    .then(() => { comments = comments.filter((x) => x.id !== c.id); picked = null; render(); });
  const actions = (c) => {
    const box = el('div', 'cmt-actions');
    box.hidden = true;
    const main = [];
    if (mine(c)) main.push(button('Edit', () => edit(c, box.closest('.cmt'))));
    main.push(button('Delete', () => {
      const ask = [el('span', 'cmt-ask', 'Delete this comment?'), button('Yes, delete', () => remove(c), 'cmt-act cmt-danger'),
        button('Cancel', () => { ask.forEach((a) => a.remove()); main.forEach((m) => { m.hidden = false; }); })];
      main.forEach((m) => { m.hidden = true; });
      box.append(...ask);
      ask[1].focus();
    }));
    box.append(...main);
    return box;
  };
  const reveal = (li) => {
    const box = li.querySelector('.cmt-actions');
    if (!box || li.querySelector('.cmt-edit')) return;
    const show = box.hidden;
    list.querySelectorAll('.cmt-actions').forEach((a) => { a.hidden = true; });
    list.querySelectorAll('.cmt-picked').forEach((x) => x.classList.remove('cmt-picked'));
    box.hidden = !show;
    li.classList.toggle('cmt-picked', show);
    picked = show ? li.dataset.id : null;
    if (show) box.querySelector('button').focus({ preventScroll: true });
  };
  const target = (e) => (e.target.closest('button, textarea') ? null : e.target.closest('.cmt'));
  let press = null;
  list.addEventListener('dblclick', (e) => { const li = target(e); if (li) reveal(li); });
  list.addEventListener('touchstart', (e) => {
    const li = target(e);
    if (li) press = setTimeout(() => { press = null; if (navigator.vibrate) navigator.vibrate(15); reveal(li); }, 500);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => list.addEventListener(ev, () => clearTimeout(press), { passive: true }));
  list.addEventListener('contextmenu', (e) => { if (target(e)) e.preventDefault(); });
  list.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('cmt') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reveal(e.target); }
  });

  const edit = (c, li) => {
    const body = li.querySelector('.cmt-body');
    const shown = [body.querySelector('.cmt-text'), body.querySelector('.cmt-actions')];
    const ta = Object.assign(el('textarea', 'cmt-edit'), { maxLength: 1000, value: c.text, rows: 3 });
    ta.setAttribute('aria-label', 'Edit your comment');
    const row = el('div', 'cmt-actions');
    const done = () => { ta.remove(); row.remove(); shown[0].hidden = false; li.classList.remove('cmt-picked'); picked = null; };
    row.append(
      button('Save', () => {
        const t = ta.value.trim();
        const problem = check(t);
        if (problem) { say(problem); return null; }
        if (t === c.text) { done(); return null; }
        return write({
          update: { name: `${DOCS}/comments/${c.id}`, fields: { text: { stringValue: t } } },
          updateMask: { fieldPaths: ['text'] },
          updateTransforms: [{ fieldPath: 'edited', setToServerValue: 'REQUEST_TIME' }],
        }).then(() => { say(''); picked = null; return load(); });
      }, 'cmt-act cmt-save'),
      button('Cancel', done));
    shown.forEach((s) => { s.hidden = true; });
    body.append(ta, row);
    ta.focus();
  };

  // ---------- Sign-in (library loaded when the panel first opens) ----------
  const showUser = () => {
    $('.cmt-signin').hidden = Boolean(user);
    form.hidden = !user;
    $('.cmt-signout').hidden = !user;
    $('.cmt-hint').hidden = !user;
    const me = $('.cmt-me');
    me.hidden = !(user && user.photoURL);
    if (!me.hidden) Object.assign(me, { src: user.photoURL, referrerPolicy: 'no-referrer' });
  };
  // Only the owner may read meta/owner: "not found" (404) means allowed, 403 means a visitor.
  const checkOwner = async () => {
    if (!user) return;
    const r = await fetch(`${API}/meta/owner?key=${FIREBASE.apiKey}`, { headers: await auth() }).catch(() => null);
    owner = Boolean(r && (r.ok || r.status === 404));
    if (owner) render();
  };
  const loadFirebase = () => (fb ? Promise.resolve(fb) : new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/firebase-auth.min.js';
    s.onload = () => {
      const F = window.MH_FB;
      const a = F.initializeAuth(F.initializeApp(FIREBASE), { persistence: F.browserLocalPersistence, popupRedirectResolver: F.browserPopupRedirectResolver });
      fb = { F, auth: a };
      F.onAuthStateChanged(a, (u) => { user = u; owner = false; showUser(); render(); checkOwner(); });
      resolve(fb);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  }));
  $('.cmt-signin').addEventListener('click', () => {
    say('');
    loadFirebase()
      .then(({ F, auth: a }) => F.signInWithPopup(a, new F.GoogleAuthProvider()))
      .catch((e) => {
        const code = (e && e.code) || '';
        if (/popup-closed|cancelled-popup/.test(code)) return;
        say(code === 'auth/popup-blocked' ? 'Your browser blocked the sign-in window. Please allow pop-ups and try again.' : 'Sign-in did not work. Please try again.');
      });
  });
  $('.cmt-signout').addEventListener('click', () => { if (fb) fb.F.signOut(fb.auth); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = text.value.trim();
    const problem = check(t);
    if (problem) { say(problem); return; }
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const btn = $('.cmt-post');
    btn.disabled = true;
    say('Posting…');
    write({
      update: { name: `${DOCS}/comments/${id}`, fields: {
        page: { stringValue: page }, text: { stringValue: t }, name: { stringValue: user.displayName || 'Visitor' },
        photo: { stringValue: user.photoURL || '' }, uid: { stringValue: user.uid } } },
      updateTransforms: [{ fieldPath: 'created', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    })
      .then(() => { text.value = ''; say(''); return load(); })
      .catch(() => say('Your comment could not be posted. Please try again.'))
      .finally(() => { btn.disabled = false; });
  });

  // ---------- Opening and closing the panel ----------
  // Like YouTube on a phone: the 3D model stays at the top (and can still be turned),
  // and the panel fills the screen below it.
  const viewer = document.getElementById('viewer');
  const header = document.querySelector('.site-header');
  const place = () => {
    const free = window.innerHeight - header.offsetHeight - viewer.offsetHeight - 8;
    sheet.style.height = `${Math.round(Math.min(Math.max(free, window.innerHeight * 0.55), 680))}px`;
  };
  const open = () => {
    window.scrollTo({ top: viewer.getBoundingClientRect().top + window.scrollY - header.offsetHeight - 8 });
    place();
    sheet.show();
    document.documentElement.classList.add('sheet-open');
    $('.sheet-close').focus({ preventScroll: true });
    loadFirebase().catch(() => say('Sign-in is not available right now.'));
  };
  const close = () => { if (sheet.open) sheet.close(); };
  teaser.addEventListener('click', open);
  $('.sheet-close').addEventListener('click', close);
  sheet.addEventListener('close', () => { document.documentElement.classList.remove('sheet-open'); teaser.focus({ preventScroll: true }); });
  window.addEventListener('resize', () => { if (sheet.open) place(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.open) close(); });
  let y0 = null; // swipe the grip down to close
  $('.sheet-grip').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  $('.sheet-grip').addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 60) close(); y0 = null; });

  // Load the comments only when the card comes near the screen (saves a request for quick visits)
  new IntersectionObserver((entries, io) => {
    if (entries.some((x) => x.isIntersecting)) { io.disconnect(); load(); }
  }, { rootMargin: '400px' }).observe(teaser);
})();
