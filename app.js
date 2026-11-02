// Wichteln – Familienversion
// Anmeldung über Firebase Authentication, Daten in Firestore.
// Bilder werden im Browser verkleinert und direkt im Wunsch gespeichert (kein Firebase Storage nötig).

'use strict';

/* ---------- Einstellungen ---------- */

// Anmeldenamen werden intern zu einer E-Mail-Adresse: "Oma Gerda" -> oma-gerda@wichteln.example
// Diese Domain gibt es nicht; es werden nie E-Mails verschickt.
const EMAIL_DOMAIN = 'wichteln.example';
const ADMIN_NAME = 'Toni';

// Codenamen: zuerst die Hauptliste, bei mehr Personen die Reserve.
// Icons: Dateipfad eintragen, z. B. icon: 'icons/vanillekipferl.svg'
const CODENAMEN = [
  { name: 'Vanillekipferl', icon: '' },
  { name: 'Tannenbaum', icon: '' },
  { name: 'Schneemann', icon: '' },
  { name: 'Schneepflugfahrer', icon: '' },
  { name: 'Maroni', icon: '' },
  { name: 'Liftinger', icon: '' },
  { name: 'Hüttenzauber', icon: '' },
  { name: 'Lebkuchen', icon: '' },
  { name: 'Profi-Schlittenfahrer', icon: '' },
  { name: 'Eierlikör', icon: '' }
];
const CODENAMEN_RESERVE = [
  { name: 'Christkind', icon: '' },
  { name: 'Zimtstern', icon: '' },
  { name: 'Nussknacker', icon: '' },
  { name: 'Krampus', icon: '' },
  { name: 'Nikolaus', icon: '' },
  { name: 'Spekulatius', icon: '' },
  { name: 'Mistelzweig', icon: '' },
  { name: 'Schneeflocke', icon: '' },
  { name: 'Rentier', icon: '' },
  { name: 'Apfelstrudel', icon: '' }
];

const PASSWORT_WOERTER = ['Tanne', 'Keks', 'Stern', 'Schnee', 'Glocke', 'Zimt', 'Kerze', 'Schlitten', 'Mandel', 'Punsch', 'Engel', 'Kipferl'];

/* ---------- Hilfsfunktionen ---------- */

const $ = id => document.getElementById(id);

function el(tag, attrs, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'svg') e.innerHTML = v; // nur für feste Icons aus ICON
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kinder.flat().forEach(c => { if (c != null) e.append(c); });
  return e;
}

const pfad = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  stern: pfad('M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.3 6.6 19.2l1.3-6-4.5-4 6-.6z'),
  stift: pfad('M4 20h4L19 9l-4-4L4 16z'),
  kreuz: pfad('M6 6l12 12M18 6L6 18'),
  extern: pfad('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
  flocke: pfad('M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5')
};

function loginName(name) {
  return String(name).trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const emailFuer = name => `${loginName(name)}@${EMAIL_DOMAIN}`;
const ADMIN_EMAIL = emailFuer(ADMIN_NAME);

function zeigeMeldung(elem, text) { elem.textContent = text || ''; elem.hidden = !text; }

function datumAnzeigen(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '–';
}

function sichererLink(text) {
  if (!text) return '';
  let t = text.trim();
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try {
    const u = new URL(t);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (e) { return ''; }
}
const istBild = s => typeof s === 'string' && s.startsWith('data:image/');

function mischen(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sattolo(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function neuesPasswort() {
  const w = mischen(PASSWORT_WOERTER);
  return `${w[0]}-${w[1]}-${10 + Math.floor(Math.random() * 90)}`;
}

function codenameInfo(name) {
  return CODENAMEN.concat(CODENAMEN_RESERVE).find(c => c.name === name) || { name: name || '', icon: '' };
}
function codenameElement(name) {
  const info = codenameInfo(name);
  const span = el('span', {}, info.name);
  if (info.icon) span.append(el('img', { src: info.icon, alt: '', class: 'codename-icon' }));
  return span;
}

function wunschlisteTitel(person) {
  if (!person) return 'Wunschliste';
  if (person.anrede === 'seine') return 'Seine Wunschliste';
  if (person.anrede === 'name') return `Wunschliste von ${person.name}`;
  return 'Ihre Wunschliste';
}

const zeit = w => (w.erstellt && w.erstellt.toMillis) ? w.erstellt.toMillis() : Number.MAX_SAFE_INTEGER;

/* ---------- Schnee ---------- */

(function schneeErzeugen() {
  const links = [[4,14,11,-1,2.4,.9],[18,9,14,-6,3.1,.6],[8,18,9,-3.5,2.8,.95],[22,11,13,-9,2.2,.7],[2,8,16,-12,3.4,.5],[14,15,12,-4.5,2.6,.85],[10,10,15,-10.5,3,.6]];
  const rechts = [[4,13,10,-2,2.5,.9],[20,9,15,-7,3.2,.55],[10,17,12,-5,2.7,.95],[24,10,13,-11,2.3,.7],[2,8,17,-14,3.5,.5],[16,14,11,-8,2.9,.85],[6,11,14,-.5,2.4,.65]];
  const box = $('schnee');
  const mach = (a, seite) => {
    const f = el('div', { class: 'flocke' }, el('span', { svg: ICON.flocke }));
    Object.assign(f.style, { [seite]: a[0] + 'px', width: a[1] + 'px', height: a[1] + 'px', animationDuration: a[2] + 's', animationDelay: a[3] + 's', opacity: a[5] });
    Object.assign(f.firstChild.style, { animationDuration: a[4] + 's', animationDelay: (a[3] / 3) + 's' });
    box.append(f);
  };
  links.forEach(a => mach(a, 'left'));
  rechts.forEach(a => mach(a, 'right'));
})();

/* ---------- Firebase ---------- */

if (!window.firebaseConfig) {
  $('ansichtLaden').querySelector('p').textContent = 'firebase-config.js fehlt oder ist leer.';
  throw new Error('firebaseConfig fehlt');
}
firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const FV = firebase.firestore.FieldValue;

// Zweite App-Instanz, damit das Anlegen eines Kontos die Organisatorin nicht abmeldet.
let sekundaerApp = null;
function sekundaerAuth() {
  if (!sekundaerApp) sekundaerApp = firebase.initializeApp(window.firebaseConfig, 'sekundaer');
  return sekundaerApp.auth();
}

/* ---------- Zustand ---------- */

const S = {
  user: null,
  istAdmin: false,
  personen: {},          // uid -> {name, anrede, login}
  einstellungen: { datum: '', budget: '', gezogen: false, ausnahmen: [] },
  zuteilung: null,       // {empfaenger, codename, schenkerCodename}
  meineWuensche: [],
  empfaengerWuensche: [],
  empfaengerId: null,
  sterne: new Set(),
  alleWuensche: [],      // nur für die Organisation (Zählen)
  ansicht: 'start'
};
let abmelder = [];
let empfaengerAbmelder = null;

function listenerStoppen() {
  abmelder.forEach(f => f());
  abmelder = [];
  if (empfaengerAbmelder) { empfaengerAbmelder(); empfaengerAbmelder = null; }
  S.empfaengerId = null;
}

function zeige(ansicht) {
  ['Laden', 'Login', 'Start', 'Orga'].forEach(n => { $('ansicht' + n).hidden = (n !== ansicht); });
  window.scrollTo(0, 0);
}

/* ---------- Anmeldung ---------- */

auth.onAuthStateChanged(async u => {
  listenerStoppen();
  S.user = u;
  if (!u) { zeige('Login'); return; }
  S.istAdmin = (u.email === ADMIN_EMAIL);
  zeige('Laden');
  if (S.istAdmin) {
    try { await adminEinrichten(); } catch (e) { console.warn('Einrichtung fehlgeschlagen', e); }
  }
  listenerStarten();
  S.ansicht = 'start';
  zeige('Start');
});

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('loginName').value;
  const pw = $('loginPw').value;
  zeigeMeldung($('loginFehler'), '');
  const knopf = e.submitter; if (knopf) knopf.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(emailFuer(name), pw);
    $('loginPw').value = '';
  } catch (err) {
    zeigeMeldung($('loginFehler'), err.code === 'auth/too-many-requests'
      ? 'Zu viele Versuche. Bitte warte kurz.'
      : 'Name oder Passwort stimmt nicht.');
  } finally { if (knopf) knopf.disabled = false; }
});

$('abmelden').addEventListener('click', () => auth.signOut());
$('zurOrga').addEventListener('click', () => { S.ansicht = 'orga'; renderOrga(); zeige('Orga'); });
$('zurStart').addEventListener('click', () => { S.ansicht = 'start'; zeige('Start'); });

// Beim ersten Login der Organisatorin: eigenes Profil und Einstellungen anlegen, alte Daten löschen.
async function adminEinrichten() {
  const uid = S.user.uid;
  const ich = await db.collection('personen').doc(uid).get();
  if (!ich.exists) {
    await db.collection('personen').doc(uid).set({ name: ADMIN_NAME, anrede: 'ihre', login: loginName(ADMIN_NAME), erstellt: FV.serverTimestamp() });
  }
  const einst = await db.collection('einstellungen').doc('allgemein').get();
  if (!einst.exists) {
    await db.collection('einstellungen').doc('allgemein').set({ datum: '', budget: '', gezogen: false, ausnahmen: [] });
  }
  // Alte Version (alles in einem Dokument, Passwörter im Klartext) entfernen.
  try { await db.collection('shared').doc('wichteln').delete(); } catch (e) { /* schon weg */ }
}

/* ---------- Live-Daten ---------- */

function listenerStarten() {
  const uid = S.user.uid;
  const warn = name => err => console.warn('Listener ' + name, err);

  abmelder.push(db.collection('personen').onSnapshot(snap => {
    S.personen = {};
    snap.forEach(d => { S.personen[d.id] = d.data(); });
    allesRendern();
  }, warn('personen')));

  abmelder.push(db.collection('einstellungen').doc('allgemein').onSnapshot(d => {
    S.einstellungen = Object.assign({ datum: '', budget: '', gezogen: false, ausnahmen: [] }, d.exists ? d.data() : {});
    allesRendern();
  }, warn('einstellungen')));

  abmelder.push(db.collection('zuteilung').doc(uid).onSnapshot(d => {
    S.zuteilung = d.exists ? d.data() : null;
    empfaengerBeobachten();
    allesRendern();
  }, warn('zuteilung')));

  abmelder.push(db.collection('wuensche').where('owner', '==', uid).onSnapshot(snap => {
    S.meineWuensche = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => zeit(a) - zeit(b));
    renderMeineListe();
  }, warn('meine wuensche')));

  abmelder.push(db.collection('privat').doc(uid).onSnapshot(d => {
    S.sterne = new Set(d.exists && Array.isArray(d.data().sterne) ? d.data().sterne : []);
    renderEmpfaengerListe();
  }, warn('privat')));

  if (S.istAdmin) {
    abmelder.push(db.collection('wuensche').onSnapshot(snap => {
      S.alleWuensche = snap.docs.map(d => ({ id: d.id, owner: d.data().owner }));
      if (S.ansicht === 'orga') renderOrga();
    }, warn('alle wuensche')));
  }
}

function empfaengerBeobachten() {
  const neu = S.zuteilung ? S.zuteilung.empfaenger : null;
  if (neu === S.empfaengerId) return;
  if (empfaengerAbmelder) { empfaengerAbmelder(); empfaengerAbmelder = null; }
  S.empfaengerId = neu;
  S.empfaengerWuensche = [];
  if (!neu) { renderEmpfaengerListe(); return; }
  empfaengerAbmelder = db.collection('wuensche').where('owner', '==', neu).onSnapshot(snap => {
    S.empfaengerWuensche = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => zeit(a) - zeit(b));
    renderEmpfaengerListe();
  }, err => console.warn('Listener empfaenger', err));
}

/* ---------- Startseite ---------- */

function allesRendern() {
  renderStart();
  if (S.istAdmin && S.ansicht === 'orga') renderOrga();
}

function renderStart() {
  const ich = S.personen[S.user.uid];
  $('begruessung').textContent = `Hallo ${ich ? ich.name : ''}!`.replace(' !', '!');
  $('zurOrga').hidden = !S.istAdmin;

  const mc = $('meinCodename');
  if (S.zuteilung && S.zuteilung.codename) {
    mc.replaceChildren('Dein geheimer Codename ist ', el('strong', {}, codenameElement(S.zuteilung.codename)), '.');
    mc.hidden = false;
  } else mc.hidden = true;

  $('anzeigeDatum').textContent = datumAnzeigen(S.einstellungen.datum);
  $('anzeigeBudget').textContent = S.einstellungen.budget || '–';

  const gezogen = !!(S.einstellungen.gezogen && S.zuteilung);
  $('nochNichtGezogen').hidden = gezogen;
  $('duBeschenkst').hidden = !gezogen;
  $('dichBeschenkt').hidden = !gezogen;

  const hinweis = $('nochNichtGezogen');
  if (S.einstellungen.gezogen && !S.zuteilung) {
    hinweis.querySelector('h2').textContent = 'Du bist noch nicht ausgelost';
    hinweis.querySelector('p').textContent = 'Die Ziehung lief schon, bevor dein Konto da war. Sag Toni Bescheid.';
  } else {
    hinweis.querySelector('h2').textContent = 'Die Ziehung kommt bald';
    hinweis.querySelector('p').textContent = 'Sobald gelost wurde, siehst du hier, wen du beschenkst. Deine Wunschliste kannst du schon jetzt schreiben.';
  }

  if (gezogen) {
    const empf = S.personen[S.zuteilung.empfaenger];
    $('empfaengerName').textContent = empf ? empf.name : 'Unbekannt';
    $('empfaengerListeTitel').textContent = wunschlisteTitel(empf);
    $('schenkerCodename').replaceChildren(codenameElement(S.zuteilung.schenkerCodename));
    $('meineListeHinweis').replaceChildren(codenameElement(S.zuteilung.schenkerCodename), ' sieht diese Liste.');
  } else {
    $('meineListeHinweis').textContent = 'Deine Wichtelperson sieht diese Liste.';
  }
}

function bildKnopf(w) {
  if (!istBild(w.bild)) return null;
  return el('button', { type: 'button', class: 'vorschau', 'aria-label': 'Bild vergrößern', onclick: () => bildZeigen(w) },
    el('img', { src: w.bild, alt: '' }));
}

function renderEmpfaengerListe() {
  const ul = $('empfaengerListe');
  ul.replaceChildren(...S.empfaengerWuensche.map(w => {
    const gemerkt = S.sterne.has(w.id);
    const link = sichererLink(w.link);
    return el('li', { class: 'wunsch' },
      el('button', { type: 'button', class: 'icon-knopf stern', 'aria-pressed': String(gemerkt), 'aria-label': 'Für mich merken', svg: ICON.stern, onclick: () => sternUmschalten(w.id, !gemerkt) }),
      el('span', { class: 'wunsch-text', text: w.text }),
      link ? el('a', { class: 'link', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Link', el('span', { svg: ICON.extern })) : null,
      bildKnopf(w)
    );
  }));
  $('empfaengerLeer').hidden = S.empfaengerWuensche.length > 0;
}

function renderMeineListe() {
  const ul = $('meineListe');
  ul.replaceChildren(...S.meineWuensche.map(w => {
    const link = sichererLink(w.link);
    return el('li', { class: 'wunsch eigen' },
      bildKnopf(w),
      el('div', { class: 'wunsch-text' },
        el('div', { text: w.text }),
        link ? el('a', { class: 'wunsch-unter', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Link öffnen') : null),
      el('button', { type: 'button', class: 'icon-knopf', 'aria-label': 'Wunsch bearbeiten', svg: ICON.stift, onclick: () => wunschBearbeiten(w) }),
      el('button', { type: 'button', class: 'icon-knopf', 'aria-label': 'Wunsch löschen', svg: ICON.kreuz, onclick: () => wunschLoeschen(w) })
    );
  }));
  $('meineListeLeer').hidden = S.meineWuensche.length > 0;
}

async function sternUmschalten(id, an) {
  try {
    await db.collection('privat').doc(S.user.uid).set({ sterne: an ? FV.arrayUnion(id) : FV.arrayRemove(id) }, { merge: true });
  } catch (e) { console.warn(e); }
}

function bildZeigen(w) {
  $('bildGross').src = w.bild;
  $('bildGross').alt = w.text;
  $('bildTitel').textContent = w.text;
  $('bildDialog').showModal();
}
$('bildDialog').addEventListener('click', e => { if (e.target === $('bildDialog')) $('bildDialog').close(); });

/* ---------- Wunsch-Formular ---------- */

let bearbeiteId = null;
let bildDaten = null;

function bildAnzeigen() {
  $('bildWaehlen').hidden = !!bildDaten;
  $('bildGewaehlt').hidden = !bildDaten;
  if (bildDaten) $('bildVorschau').src = bildDaten;
}

function formularLeeren() {
  bearbeiteId = null;
  bildDaten = null;
  $('wunschForm').reset();
  $('wunschFormTitel').textContent = 'Neuer Wunsch';
  $('wunschSpeichern').textContent = 'Hinzufügen';
  $('wunschAbbrechen').hidden = true;
  zeigeMeldung($('wunschFehler'), '');
  bildAnzeigen();
}

function wunschBearbeiten(w) {
  bearbeiteId = w.id;
  bildDaten = istBild(w.bild) ? w.bild : null;
  $('wunschText').value = w.text || '';
  $('wunschLink').value = w.link || '';
  $('wunschFormTitel').textContent = 'Wunsch bearbeiten';
  $('wunschSpeichern').textContent = 'Speichern';
  $('wunschAbbrechen').hidden = false;
  bildAnzeigen();
  $('wunschForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('wunschText').focus({ preventScroll: true });
}

async function wunschLoeschen(w) {
  if (!confirm(`„${w.text}“ löschen?`)) return;
  try {
    await db.collection('wuensche').doc(w.id).delete();
    if (bearbeiteId === w.id) formularLeeren();
  } catch (e) { alert('Löschen hat nicht geklappt.'); }
}

$('wunschAbbrechen').addEventListener('click', formularLeeren);
$('bildEntfernen').addEventListener('click', () => { bildDaten = null; $('wunschBild').value = ''; bildAnzeigen(); });

$('wunschBild').addEventListener('change', async () => {
  const datei = $('wunschBild').files[0];
  if (!datei) return;
  zeigeMeldung($('wunschFehler'), '');
  try {
    bildDaten = await bildVerkleinern(datei);
    bildAnzeigen();
  } catch (e) {
    zeigeMeldung($('wunschFehler'), 'Dieses Bild konnte nicht geladen werden. Probier ein anderes.');
  }
});

// Verkleinert ein Bild auf höchstens ~700 KB, damit es in ein Firestore-Dokument passt.
function bildVerkleinern(datei) {
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 1200, qualitaet = 0.82;
      for (let versuch = 0; versuch < 8; versuch++) {
        const faktor = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * faktor);
        c.height = Math.round(img.height * faktor);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const daten = c.toDataURL('image/jpeg', qualitaet);
        if (daten.length < 700000) { ok(daten); return; }
        max *= 0.8; qualitaet = Math.max(0.5, qualitaet - 0.08);
      }
      fehler(new Error('zu groß'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('kein Bild')); };
    img.src = url;
  });
}

$('wunschForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('wunschText').value.trim();
  const linkRoh = $('wunschLink').value.trim();
  const link = sichererLink(linkRoh);
  zeigeMeldung($('wunschFehler'), '');
  if (!text) return;
  if (linkRoh && !link) { zeigeMeldung($('wunschFehler'), 'Der Link sieht nicht richtig aus.'); return; }
  const knopf = $('wunschSpeichern');
  knopf.disabled = true;
  try {
    const daten = { text, link, bild: bildDaten || null };
    if (bearbeiteId) {
      await db.collection('wuensche').doc(bearbeiteId).update(daten);
    } else {
      await db.collection('wuensche').add(Object.assign({ owner: S.user.uid, erstellt: FV.serverTimestamp() }, daten));
    }
    formularLeeren();
  } catch (err) {
    console.warn(err);
    zeigeMeldung($('wunschFehler'), 'Speichern hat nicht geklappt. Ist das Bild vielleicht zu groß?');
  } finally { knopf.disabled = false; }
});

/* ---------- Organisation ---------- */

let bearbeitePerson = null;

function personenSortiert() {
  return Object.entries(S.personen)
    .map(([id, p]) => Object.assign({ id }, p))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function renderOrga() {
  if (!S.istAdmin) return;
  const liste = personenSortiert();
  const anzahl = {};
  S.alleWuensche.forEach(w => { anzahl[w.owner] = (anzahl[w.owner] || 0) + 1; });
  const fertig = liste.filter(p => anzahl[p.id]).length;

  $('anzahlKonten').textContent = `${liste.length} ${liste.length === 1 ? 'Konto' : 'Konten'}`;
  $('wunschStatus').textContent = `Wunschlisten: ${fertig} von ${liste.length} ausgefüllt`;
  $('wunschBalken').style.width = liste.length ? `${Math.round(fertig / liste.length * 100)}%` : '0';

  $('personenListe').replaceChildren(...liste.map(p => {
    const n = anzahl[p.id] || 0;
    const istIch = p.id === S.user.uid;
    return el('li', { class: 'person' },
      el('div', { class: 'person-info' },
        el('div', { class: 'person-name', text: p.name }),
        el('div', { class: 'person-status' + (n ? '' : ' leer'), text: n ? `${n} ${n === 1 ? 'Wunsch' : 'Wünsche'}` : 'Wunschliste noch leer' }),
        el('div', { class: 'person-login', text: `Anmeldename: ${p.name}` })),
      el('button', { type: 'button', class: 'icon-knopf', 'aria-label': `${p.name} bearbeiten`, svg: ICON.stift, onclick: () => personBearbeiten(p) }),
      istIch ? null : el('button', { type: 'button', class: 'icon-knopf', 'aria-label': `${p.name} löschen`, svg: ICON.kreuz, onclick: () => personLoeschen(p) })
    );
  }));

  // Ausnahmen
  const ausn = Array.isArray(S.einstellungen.ausnahmen) ? S.einstellungen.ausnahmen : [];
  const nameVon = id => (S.personen[id] ? S.personen[id].name : '?');
  $('ausnahmenListe').replaceChildren(...ausn.map((a, i) =>
    el('span', { class: 'chip' }, `${nameVon(a.a)} & ${nameVon(a.b)}`,
      el('button', { type: 'button', class: 'icon-knopf', 'aria-label': 'Ausnahme entfernen', svg: ICON.kreuz, onclick: () => ausnahmeEntfernen(i) }))));
  ['ausnahmeA', 'ausnahmeB'].forEach(id => {
    const sel = $(id); const alt = sel.value;
    sel.replaceChildren(...liste.map(p => el('option', { value: p.id, text: p.name })));
    if (alt && S.personen[alt]) sel.value = alt;
  });

  // Rahmen (nicht überschreiben, während getippt wird)
  if (!$('rahmenForm').contains(document.activeElement)) {
    $('rahmenDatum').value = S.einstellungen.datum || '';
    $('rahmenBudget').value = S.einstellungen.budget || '';
  }

  // Ziehung
  const gezogen = !!S.einstellungen.gezogen;
  $('ziehungStatus').textContent = gezogen
    ? `Die Ziehung ist gelaufen (${S.einstellungen.anzahl || liste.length} Personen). Wunschlisten bleiben offen.`
    : 'Wunschlisten bleiben nach der Ziehung offen.';
  $('auslosen').hidden = gezogen;
  $('ziehungZuruecksetzen').hidden = !gezogen;
  $('paareBox').hidden = !gezogen;
  if (!gezogen) { $('paareBox').open = false; paareDaten = null; aufgedeckt.clear(); }
  else if ($('paareBox').open) renderPaare();
}

/* ---------- Paare (zum Testen, standardmäßig eingeklappt) ---------- */

let paareDaten = null;
const aufgedeckt = new Set();

async function paareLaden() {
  $('paareListe').replaceChildren(el('li', { class: 'paar', text: 'Lädt …' }));
  try {
    const snap = await db.collection('zuteilung').get();
    paareDaten = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderPaare();
  } catch (e) {
    console.warn(e);
    $('paareListe').replaceChildren(el('li', { class: 'paar', text: 'Konnte nicht geladen werden. Sind die neuen Sicherheitsregeln veröffentlicht?' }));
  }
}

function renderPaare() {
  if (!paareDaten) return;
  const codeVon = {};
  paareDaten.forEach(z => { codeVon[z.id] = z.codename; });
  const knopf = id => {
    const offen = aufgedeckt.has(id);
    const name = S.personen[id] ? S.personen[id].name : 'Gelöschte Person';
    return el('button', {
      type: 'button', class: 'paar-name', 'aria-pressed': String(offen),
      onclick: () => { offen ? aufgedeckt.delete(id) : aufgedeckt.add(id); renderPaare(); }
    }, offen ? name : codenameElement(codeVon[id] || '?'));
  };
  const sortiert = paareDaten.slice().sort((a, b) => (a.codename || '').localeCompare(b.codename || '', 'de'));
  $('paareListe').replaceChildren(...sortiert.map(z =>
    el('li', { class: 'paar' }, knopf(z.id), el('span', { class: 'paar-pfeil', 'aria-label': 'beschenkt', text: '→' }), knopf(z.empfaenger))));
}

$('paareBox').addEventListener('toggle', () => {
  if ($('paareBox').open) paareLaden();
  else aufgedeckt.clear();
});

function kontoFormLeeren() {
  bearbeitePerson = null;
  $('kontoForm').reset();
  $('kontoName').disabled = false;
  $('kontoFormTitel').textContent = 'Konto anlegen';
  $('kontoSpeichern').textContent = 'Konto anlegen';
  $('kontoPwFeld').hidden = false;
  $('kontoPw').required = true;
  $('kontoPw').value = neuesPasswort();
  $('kontoAbbrechen').hidden = true;
  zeigeMeldung($('kontoFehler'), '');
}

function personBearbeiten(p) {
  bearbeitePerson = p;
  $('kontoName').value = p.name;
  $('kontoName').disabled = true; // der Name ist zugleich der Anmeldename
  $('kontoAnrede').value = p.anrede || 'ihre';
  $('kontoFormTitel').textContent = `${p.name} bearbeiten`;
  $('kontoSpeichern').textContent = 'Speichern';
  $('kontoPwFeld').hidden = true;
  $('kontoPw').required = false;
  $('kontoAbbrechen').hidden = false;
  zeigeMeldung($('kontoFehler'), '');
  zeigeMeldung($('kontoErfolg'), '');
  $('kontoForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('pwWuerfeln').addEventListener('click', () => { $('kontoPw').value = neuesPasswort(); });
$('kontoAbbrechen').addEventListener('click', kontoFormLeeren);

$('kontoForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('kontoName').value.trim().replace(/\s+/g, ' ');
  const anrede = $('kontoAnrede').value;
  const pw = $('kontoPw').value.trim();
  zeigeMeldung($('kontoFehler'), '');
  zeigeMeldung($('kontoErfolg'), '');
  if (!name || !loginName(name)) { zeigeMeldung($('kontoFehler'), 'Bitte einen Namen eingeben.'); return; }
  const knopf = $('kontoSpeichern');
  knopf.disabled = true;
  try {
    if (bearbeitePerson) {
      // Der Anmeldename bleibt der ursprüngliche; nur Anzeige und Anrede ändern sich.
      await db.collection('personen').doc(bearbeitePerson.id).update({ anrede });
      const altName = bearbeitePerson.name;
      kontoFormLeeren();
      zeigeMeldung($('kontoErfolg'), `${altName} gespeichert.`);
      return;
    }
    const login = loginName(name);
    if (Object.values(S.personen).some(p => p.login === login)) {
      zeigeMeldung($('kontoFehler'), 'Diesen Namen gibt es schon.');
      return;
    }
    if (pw.length < 6) { zeigeMeldung($('kontoFehler'), 'Das Passwort braucht mindestens 6 Zeichen.'); return; }
    const sa = sekundaerAuth();
    const cred = await sa.createUserWithEmailAndPassword(emailFuer(name), pw);
    await db.collection('personen').doc(cred.user.uid).set({ name, anrede, login, erstellt: FV.serverTimestamp() });
    await sa.signOut();
    kontoFormLeeren();
    let text = `Konto angelegt. Name: ${name} · Passwort: ${pw}`;
    if (S.einstellungen.gezogen) text += ' – Die Ziehung lief schon: Setze sie zurück und lose neu, damit die Person dabei ist.';
    zeigeMeldung($('kontoErfolg'), text);
  } catch (err) {
    console.warn(err);
    const meldung = {
      'auth/email-already-in-use': 'Für diesen Namen gibt es schon ein Login (evtl. von einem gelöschten Konto). Entferne es in der Firebase-Konsole unter Authentication.',
      'auth/weak-password': 'Das Passwort ist zu schwach.',
      'auth/operation-not-allowed': 'In Firebase ist die Anmeldung mit E-Mail/Passwort noch nicht aktiviert.'
    }[err.code] || 'Das hat nicht geklappt. Versuch es nochmal.';
    zeigeMeldung($('kontoFehler'), meldung);
  } finally { knopf.disabled = false; }
});

async function personLoeschen(p) {
  if (!confirm(`${p.name} wirklich löschen? Die Wunschliste wird mitgelöscht.`)) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('personen').doc(p.id));
    batch.delete(db.collection('zuteilung').doc(p.id));
    S.alleWuensche.filter(w => w.owner === p.id).forEach(w => batch.delete(db.collection('wuensche').doc(w.id)));
    const ausn = (S.einstellungen.ausnahmen || []).filter(a => a.a !== p.id && a.b !== p.id);
    batch.update(db.collection('einstellungen').doc('allgemein'), { ausnahmen: ausn });
    await batch.commit();
    alert(`${p.name} wurde gelöscht. Das Login selbst entfernst du in der Firebase-Konsole unter Authentication.` +
      (S.einstellungen.gezogen ? ' Die Ziehung ist jetzt unvollständig – bitte zurücksetzen und neu losen.' : ''));
  } catch (e) { console.warn(e); alert('Löschen hat nicht geklappt.'); }
}

$('ausnahmeHinzu').addEventListener('click', async () => {
  const a = $('ausnahmeA').value, b = $('ausnahmeB').value;
  if (!a || !b || a === b) return;
  const ausn = (S.einstellungen.ausnahmen || []).slice();
  if (ausn.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return;
  ausn.push({ a, b });
  try { await db.collection('einstellungen').doc('allgemein').update({ ausnahmen: ausn }); } catch (e) { alert('Speichern hat nicht geklappt.'); }
});

async function ausnahmeEntfernen(i) {
  const ausn = (S.einstellungen.ausnahmen || []).slice();
  ausn.splice(i, 1);
  try { await db.collection('einstellungen').doc('allgemein').update({ ausnahmen: ausn }); } catch (e) { alert('Speichern hat nicht geklappt.'); }
}

$('rahmenForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await db.collection('einstellungen').doc('allgemein').update({
      datum: $('rahmenDatum').value || '',
      budget: $('rahmenBudget').value.trim()
    });
    document.activeElement.blur();
    zeigeMeldung($('rahmenErfolg'), 'Gespeichert.');
    setTimeout(() => zeigeMeldung($('rahmenErfolg'), ''), 2500);
  } catch (err) { alert('Speichern hat nicht geklappt.'); }
});

/* ---------- Ziehung ---------- */

// Gibt {schenker: empfänger} zurück oder null, wenn die Ausnahmen keine Ziehung erlauben.
function ziehungBerechnen(ids, ausnahmen) {
  const verboten = new Set();
  (ausnahmen || []).forEach(x => { verboten.add(x.a + '|' + x.b); verboten.add(x.b + '|' + x.a); });
  const erlaubt = (g, e) => g !== e && !verboten.has(g + '|' + e);
  // Bevorzugt ein einziger Kreis (A→B→C→…→A), sonst eine beliebige gültige Zuordnung.
  for (let i = 0; i < 20000; i++) {
    const kreis = sattolo(ids);
    if (kreis.every((g, k) => erlaubt(g, kreis[(k + 1) % kreis.length]))) {
      const z = {};
      kreis.forEach((g, k) => { z[g] = kreis[(k + 1) % kreis.length]; });
      return z;
    }
  }
  for (let i = 0; i < 20000; i++) {
    const empf = mischen(ids);
    if (ids.every((g, k) => erlaubt(g, empf[k]))) {
      const z = {};
      ids.forEach((g, k) => { z[g] = empf[k]; });
      return z;
    }
  }
  return null;
}

$('auslosen').addEventListener('click', async () => {
  const ids = Object.keys(S.personen);
  zeigeMeldung($('ziehungFehler'), '');
  if (ids.length < 3) { zeigeMeldung($('ziehungFehler'), 'Für eine Ziehung braucht es mindestens 3 Personen.'); return; }
  const pool = mischen(CODENAMEN).concat(mischen(CODENAMEN_RESERVE));
  if (ids.length > pool.length) { zeigeMeldung($('ziehungFehler'), 'Es gibt zu wenige Codenamen. Bitte die Liste in app.js erweitern.'); return; }
  if (!confirm(`Jetzt für ${ids.length} Personen auslosen?`)) return;

  const z = ziehungBerechnen(ids, S.einstellungen.ausnahmen);
  if (!z) { zeigeMeldung($('ziehungFehler'), 'Mit diesen Ausnahmen ist keine Ziehung möglich. Entferne eine Ausnahme und versuch es nochmal.'); return; }

  const codename = {};
  ids.forEach((id, i) => { codename[id] = pool[i].name; });
  const schenkerVon = {};
  Object.entries(z).forEach(([g, e]) => { schenkerVon[e] = g; });

  const knopf = $('auslosen');
  knopf.disabled = true;
  try {
    const batch = db.batch();
    ids.forEach(id => {
      batch.set(db.collection('zuteilung').doc(id), {
        empfaenger: z[id],
        codename: codename[id],
        schenkerCodename: codename[schenkerVon[id]],
        gezogenAm: FV.serverTimestamp()
      });
    });
    batch.update(db.collection('einstellungen').doc('allgemein'), { gezogen: true, anzahl: ids.length });
    await batch.commit();
    aufgedeckt.clear();
    if ($('paareBox').open) paareLaden();
  } catch (e) {
    console.warn(e);
    zeigeMeldung($('ziehungFehler'), 'Die Ziehung konnte nicht gespeichert werden.');
  } finally {
    knopf.disabled = false;
  }
});

$('ziehungZuruecksetzen').addEventListener('click', async () => {
  if (!confirm('Ziehung wirklich zurücksetzen? Alle Zuordnungen und Codenamen gehen verloren.')) return;
  try {
    const batch = db.batch();
    Object.keys(S.personen).forEach(id => batch.delete(db.collection('zuteilung').doc(id)));
    batch.update(db.collection('einstellungen').doc('allgemein'), { gezogen: false, anzahl: 0 });
    await batch.commit();
  } catch (e) { console.warn(e); alert('Zurücksetzen hat nicht geklappt.'); }
});

kontoFormLeeren();
bildAnzeigen();
