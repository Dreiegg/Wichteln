// Simple client-side Secret Santa (Wichteln) app
// Stores users, wishlists and pairs in localStorage. Single-file app logic.

const LS_KEY = 'wichteln_data_v1';

// Admin defaults (keeps a stable admin & codename)
const ADMIN_USERNAME = 'Toni';
const ADMIN_CODENAME = 'Claus 🎅';

function uid(){ return 'u_' + Math.random().toString(36).slice(2,9); }

// Local state; will be synced with Firestore if configured
let state = {users: [], pairs: {}, codenames: {}};
let session = {userId: null};
// transient in-memory drafts per user to avoid clobbering in-progress edits
const wishlistDrafts = {};
// remember last pairs timestamp we rendered to avoid UI jumps when remote syncs repeatedly
let lastPairsRenderedAt = 0;

// Firestore setup (optional)
let useFirestore = false;
let firestoreDb = null;
if(window && window.firebaseConfig){
  try{
    const app = firebase.initializeApp(window.firebaseConfig);
    firestoreDb = firebase.firestore();
    useFirestore = true;
    console.log('Firestore enabled');
  }catch(e){ console.warn('Firestore init failed', e); }
}

function loadData(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return {users: [], pairs: {}, codenames: {}};
  try{
    const parsed = JSON.parse(raw) || {};
    // ensure shape compatibility for older data
    parsed.users = parsed.users || [];
    parsed.pairs = parsed.pairs || {};
    parsed.codenames = parsed.codenames || {};
    return parsed;
  }catch(e){return {users:[], pairs:{}, codenames:{}}}
}

function saveDataLocal(d){ localStorage.setItem(LS_KEY, JSON.stringify(d)); }

async function loadSharedData(){
  if(!useFirestore) return loadData();
  // read from Firestore doc 'shared/wichteln'
  try{
    const doc = await firestoreDb.collection('shared').doc('wichteln').get();
    if(!doc.exists) return loadData();
    const d = doc.data() || {};
    // normalize shape and remove any legacy displayName fields
    d.users = d.users || [];
    d.pairs = d.pairs || {};
    d.codenames = d.codenames || {};
    d.users.forEach(u => { if(u && u.displayName) delete u.displayName; });
    return d;
  }catch(e){ console.warn('loadSharedData failed', e); return loadData(); }
}

// Merge remote shared state into a local state snapshot while preserving
// ephemeral local drafts (wishlistDrafts) and the current session where possible.
function mergeSharedState(localState, remote, opts){
  if(!remote) return localState;
  opts = opts || {};
  const merged = { users: [], pairs: {}, codenames: {} };
  // By default accept remote pairs/codenames, but allow preserving local pairs when the
  // current user has unsaved edits to avoid distracting jumps while they type.
  const preservePairsIfEditing = !!opts.preservePairsIfEditing;
  const currentUserId = opts.currentUserId;
  // Determine authoritative pairs using timestamps when available, unless we're preserving
  // local pairs because the current user is actively editing a wishlist.
  const localUpdated = (localState && localState.meta && localState.meta.pairsUpdatedAt) ? localState.meta.pairsUpdatedAt : 0;
  const remoteUpdated = (remote && remote.meta && remote.meta.pairsUpdatedAt) ? remote.meta.pairsUpdatedAt : 0;
  if(preservePairsIfEditing && currentUserId && wishlistDrafts[currentUserId]){
    merged.pairs = (localState && localState.pairs) ? localState.pairs : (remote.pairs || {});
  } else if(remoteUpdated || localUpdated){
    // choose the most recent update
    if(remoteUpdated > localUpdated){
      merged.pairs = remote.pairs || {};
    } else {
      merged.pairs = localState.pairs || {};
    }
  } else {
    // fallback: prefer remote if present
    merged.pairs = remote.pairs || localState.pairs || {};
  }
  merged.codenames = remote.codenames || {};
  // carry over any configured exclusions (admin-managed)
  merged.exclusions = remote.exclusions || localState.exclusions || {};

  // Build user maps by id for local and remote
  const localById = {};
  (localState.users || []).forEach(u => { if(u && u.id) localById[u.id] = u; });
  const remoteById = {};
  (remote.users || []).forEach(u => { if(u && u.id) remoteById[u.id] = u; });

  // Start from remote users (authoritative list), but preserve local wishlist drafts
  (remote.users || []).forEach(u => {
    const copy = Object.assign({}, u);
    // If we have a transient draft for this user, keep it out of the persisted wishlist
    if(localById[u.id] && wishlistDrafts[u.id]){
      // keep copy.wishlist as remote.wishlist (persisted), drafts are kept separately
    }
    merged.users.push(copy);
  });

  // If there are local-only users not present in remote (rare), append them
  (localState.users || []).forEach(u => {
    if(!remoteById[u.id]) merged.users.push(Object.assign({}, u));
  });

  return merged;
}

async function saveSharedData(d){
  if(!useFirestore){ saveDataLocal(d); return; }
  try{
    // Persist the full state (including codenames) to Firestore so codenames remain stable across devices.
    // But remove any legacy `displayName` fields from users before writing to the DB.
    const toSave = JSON.parse(JSON.stringify(d || {}));
    toSave.users = toSave.users || [];
    toSave.pairs = toSave.pairs || {};
    toSave.codenames = toSave.codenames || {};
    toSave.users.forEach(u => { if(u && u.displayName) delete u.displayName; });
    await firestoreDb.collection('shared').doc('wichteln').set(toSave);
    // also keep local copy (use the sanitized version so localStorage and Firestore stay consistent)
    saveDataLocal(toSave);
  }catch(e){ console.warn('saveSharedData failed', e); saveDataLocal(d);}  
}

// init demo admin if no users
async function ensureInitialData(){
  const loaded = await loadSharedData();
  state = loaded || {users: [], pairs: {}, codenames: {}};
  // Ensure a stable admin account exists with username 'Toni' and codename 'Claus 🎅'
  const ADMIN_USERNAME = 'Toni';
  const ADMIN_CODENAME = 'Claus 🎅';
  let admin = state.users.find(u => u.username === ADMIN_USERNAME);
  if(!admin){
    admin = { id: uid(), username: ADMIN_USERNAME, pwd: 'admin', isAdmin: true, wishlist: '' };
    state.users.push(admin);
  } else {
    admin.isAdmin = true; // ensure admin flag
  }
  // ensure codenames map exists
  state.codenames = state.codenames || {};
  // ensure exclusions mapping exists
  state.exclusions = state.exclusions || {};
  // Remove ADMIN_CODENAME from any other user that might have it (keep it unique)
  Object.keys(state.codenames).forEach(k => {
    if(state.codenames[k] === ADMIN_CODENAME && k !== admin.id) delete state.codenames[k];
  });
  // Assign admin's codename
  state.codenames[admin.id] = ADMIN_CODENAME;
  await saveSharedData(state);
}

// initialize
ensureInitialData();

// --- DOM ---
const nav = document.getElementById('nav');
const auth = document.getElementById('auth');
const dashboard = document.getElementById('dashboard');
const welcome = document.getElementById('welcome');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const registerBox = document.getElementById('registerBox');
const loginBox = document.getElementById('loginBox');
const wishlistForm = document.getElementById('wishlistForm');
const wishlistInput = document.getElementById('wishlistInput');
const assignedInfo = document.getElementById('assignedInfo');
const assignedHeader = document.getElementById('assignedHeader');
const logoutBtn = document.getElementById('logoutBtn');
const adminArea = document.getElementById('adminArea');
const usersList = document.getElementById('usersList');
const pairsView = document.getElementById('pairsView');
const drawBtn = document.getElementById('drawBtn');
const exportPairs = document.getElementById('exportPairs');
const resetPairs = document.getElementById('resetPairs');
const isAdminCheckbox = document.getElementById('isAdminCheckbox');
const adminKeyInput = document.getElementById('adminKeyInput');
const adminKeyLabel = document.getElementById('adminKeyLabel');
const exclusionGiver = document.getElementById('exclusionGiver');
const exclusionList = document.getElementById('exclusionList');
const saveExclusionsBtn = document.getElementById('saveExclusions');
const clearExclusionsBtn = document.getElementById('clearExclusions');
const deleteAllExceptAdminBtn = document.getElementById('deleteAllExceptAdmin');
// User management is handled in Firebase Console; remove client-side management UI elements.

showRegister.addEventListener('click', ()=>{ registerBox.classList.remove('hidden'); loginBox.classList.add('hidden'); });
showLogin.addEventListener('click', ()=>{ registerBox.classList.add('hidden'); loginBox.classList.remove('hidden'); });

// show admin key input only when admin checkbox is checked
if(isAdminCheckbox){
  isAdminCheckbox.addEventListener('change', ()=>{
    if(isAdminCheckbox.checked) adminKeyLabel.classList.remove('hidden'); else adminKeyLabel.classList.add('hidden');
  });
}

loginForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(loginForm);
  const username = f.get('username').trim();
  const password = f.get('password');
  state = await loadSharedData();
  const user = state.users.find(u=>u.username === username && u.pwd === password);
  if(!user){ alert('Ungültige Anmeldedaten'); return; }
  session.userId = user.id; render();
});

registerForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(registerForm);
  const username = f.get('username').trim();
  const password = f.get('password');
  const isAdmin = !!f.get('isAdmin');
  const adminKey = f.get('adminKey');
  state = await loadSharedData();
  // Prevent new registrations after pairs have been drawn to avoid duplicate/overlapping codename assignments
  if(state.pairs && Object.keys(state.pairs).length > 0){
    alert('Registrierung deaktiviert: Die Ziehung wurde bereits durchgeführt. Bitte setze die Pairs zurück, um neue Nutzer hinzuzufügen.');
    return;
  }
  if(state.users.find(u=>u.username===username)){ alert('Benutzername bereits vergeben'); return; }
  // If an organizer secret is configured, require it for admin creation
  if(isAdmin && window.organizerSecret){
    if(!adminKey || adminKey !== window.organizerSecret){ alert('Falsches Organisator-Passwort, Admin-Erstellung nicht erlaubt'); return; }
  }
  const user = {id: uid(), username, pwd: password, isAdmin, wishlist: ''};
  state.users.push(user); await saveSharedData(state);
  // Auto-login the newly registered user so they can immediately edit their wishlist
  session.userId = user.id;
  // ensure UI updates to the dashboard
  render();
});

logoutBtn.addEventListener('click', ()=>{ session.userId = null; render(); });

wishlistForm.addEventListener('submit', async e=>{
  e.preventDefault();
  // Try to persist the wishlist. Prefer the shared (remote) state when possible,
  // but fall back to the local cache if the remote state doesn't yet include this user
  // (this can happen when local registration created a user that hasn't been pushed to the shared doc).
  state = await loadSharedData();
  let user = state.users.find(u=>u.id === session.userId);
  if(!user){
    // remote didn't have the user yet — try local cache
    const local = loadData();
    const localUser = (local.users || []).find(u => u.id === session.userId);
    if(localUser){
      // merge the local user into the state we'll save
      state.users = state.users || [];
      // remove any existing entry with same id to avoid duplicates
      state.users = state.users.filter(u => u.id !== localUser.id);
      state.users.push(localUser);
      user = localUser;
    }
  }
  if(!user){ alert('Benutzer nicht gefunden — bitte melde dich erneut an.'); return; }

  user.wishlist = wishlistInput.value.trim();
  // Persist; saveSharedData will fall back to localStorage if Firestore write fails
  await saveSharedData(state);
  // clear transient draft after successful save
  try{ delete wishlistDrafts[session.userId]; }catch(e){}
  // refresh UI to reflect the persisted wishlist immediately
  try{ render(); }catch(e){/* ignore */}
  alert('Wunschliste gespeichert');
});

// keep a transient draft of the wishlist while the user types so re-renders don't erase it
if(wishlistInput){
  wishlistInput.addEventListener('input', ()=>{
    if(session.userId) wishlistDrafts[session.userId] = wishlistInput.value;
  });
}

// Credential-change UI removed; user management is done through Firebase Console.

if(drawBtn){
  drawBtn.addEventListener('click', async ()=>{
    state = await loadSharedData();
    if(state.users.length < 2){ alert('Mindestens 2 Nutzer nötig'); return; }
      // Ensure we have enough unique codenames to assign one per user
      if(state.users.length > CODENAMES.length){
        alert('Es sind nicht genug eindeutige Codenamen definiert, um jedem Nutzer einen einmaligen Codename zu geben. Bitte erweitere die CODENAMES-Liste in app.js.');
        return;
      }

      // Preserve existing codenames and only assign missing ones.
      state.codenames = state.codenames || {};

      // Ensure admin user exists and has the reserved codename
      let adminUser = state.users.find(u => u.username === ADMIN_USERNAME);
      if(adminUser){
        // Remove ADMIN_CODENAME from others if present
        Object.keys(state.codenames).forEach(k => {
          if(state.codenames[k] === ADMIN_CODENAME && k !== adminUser.id) delete state.codenames[k];
        });
        // Assign to admin
        state.codenames[adminUser.id] = ADMIN_CODENAME;
      }

      // Build list of users who still need a codename
      const needCode = state.users.filter(u => !state.codenames[u.id]);

      // Available codes are those not yet assigned
      const assigned = new Set(Object.values(state.codenames || {}));
      const availableCodes = CODENAMES.filter(c => !assigned.has(c));
      if(availableCodes.length < needCode.length){
        alert('Nicht genügend unbenutzte Codenamen verfügbar. Bitte erweitere die CODENAMES-Liste.');
        return;
      }

      // Shuffle available codes and assign to users who need one
      const shuffledAvail = shuffle(availableCodes).slice(0, needCode.length);
      for(let i=0;i<needCode.length;i++){
        state.codenames[needCode[i].id] = shuffledAvail[i];
      }

    // Now compute pairs honoring any admin-configured exclusions.
    state.exclusions = state.exclusions || {};
    const pairs = computePairsWithExclusions(state.users, state.exclusions);
    if(!pairs){
      alert('Es konnte keine gültige Zuordnung gefunden werden, die alle Ausschlüsse einhält. Bitte überprüfe die Ausnahmen im Admin-Panel.');
      return;
    }
    state.pairs = pairs;
    // mark when pairs were last updated so clients can resolve sync conflicts deterministically
    state.meta = state.meta || {};
    state.meta.pairsUpdatedAt = Date.now();
    await saveSharedData(state);
    render();
  });
}

if(exportPairs){
  exportPairs.addEventListener('click', async ()=>{
    state = await loadSharedData();
    const dataStr = JSON.stringify({users: state.users, pairs: state.pairs}, null, 2);
    downloadText('wichteln_pairs.json', dataStr);
  });
}

if(resetPairs){
  resetPairs.addEventListener('click', async ()=>{ 
    if(!confirm('Pairs wirklich zurücksetzen?')) return;
    state = await loadSharedData();
    state.pairs = {};
    state.meta = state.meta || {};
    state.meta.pairsUpdatedAt = Date.now();
    await saveSharedData(state);
    render(); 
  });
}

// --- Admin: exclusions UI handlers ---
function populateExclusionGiverSelect(){
  if(!exclusionGiver) return;
  exclusionGiver.innerHTML = '';
  (state.users || []).forEach(u => {
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; exclusionGiver.appendChild(opt);
  });
}

function populateExclusionListFor(giverId){
  if(!exclusionList) return;
  exclusionList.innerHTML = '';
  if(!giverId) return;
  const exclusionsFor = (state.exclusions && state.exclusions[giverId]) ? state.exclusions[giverId] : [];
  (state.users || []).forEach(u => {
    if(u.id === giverId) return; // cannot exclude self
    const id = u.id;
    const label = document.createElement('label');
    label.style.display = 'block';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.id = id; cb.checked = exclusionsFor.includes(id);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + u.username));
    exclusionList.appendChild(label);
  });
}

if(exclusionGiver){
  exclusionGiver.addEventListener('change', ()=>{
    populateExclusionListFor(exclusionGiver.value);
  });
}

if(saveExclusionsBtn){
  saveExclusionsBtn.addEventListener('click', async ()=>{
    const giver = exclusionGiver && exclusionGiver.value;
    if(!giver){ alert('Bitte zuerst einen Schenkenden wählen'); return; }
    const checks = Array.from((exclusionList||document).querySelectorAll('input[type=checkbox]'));
    const forbidden = checks.filter(c=>c.checked).map(c=>c.dataset.id);
    state = await loadSharedData();
    state.exclusions = state.exclusions || {};
    if(forbidden.length) state.exclusions[giver] = forbidden; else delete state.exclusions[giver];
    await saveSharedData(state);
    alert('Ausnahmen gespeichert');
    render();
  });
}

if(clearExclusionsBtn){
  clearExclusionsBtn.addEventListener('click', async ()=>{
    const giver = exclusionGiver && exclusionGiver.value; if(!giver) return;
    if(!confirm('Ausnahmen für diesen Nutzer wirklich löschen?')) return;
    state = await loadSharedData();
    if(state.exclusions) delete state.exclusions[giver];
    await saveSharedData(state);
    render();
  });
}

if(deleteAllExceptAdminBtn){
  deleteAllExceptAdminBtn.addEventListener('click', async ()=>{
    if(!confirm('Alle Nutzer ausser dem Admin wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    state = await loadSharedData();
    const adminUser = state.users.find(u => u.username === ADMIN_USERNAME);
    if(!adminUser){ alert('Admin nicht gefunden — Abbruch'); return; }
    // keep only admin
    state.users = [adminUser];
    state.pairs = {};
    state.codenames = {};
    state.codenames[adminUser.id] = ADMIN_CODENAME;
    state.exclusions = {};
    state.meta = state.meta || {};
    state.meta.pairsUpdatedAt = Date.now();
    await saveSharedData(state);
    alert('Alle anderen Nutzer gelöscht');
    // if current session was not admin, log out
    if(session.userId && session.userId !== adminUser.id) session.userId = null;
    render();
  });
}

// User management (delete/reset) removed — manage users via Firebase Console directly.

function downloadText(filename, text){
  const blob = new Blob([text], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function sattolo(array){
  // in-place
  let i = array.length;
  while(i>1){
    i--;
    const j = Math.floor(Math.random() * i);
    const tmp = array[j]; array[j] = array[i]; array[i] = tmp;
  }
  return array;
}

function shuffle(array){
  // returns a new shuffled copy (Fisher-Yates)
  const a = array.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}


// Compute a valid assignment (pairs) honoring per-giver exclusions.
// users: array of user objects with .id
// exclusions: object mapping giverId -> array of forbidden receiverIds
// Returns a mapping giverId -> receiverId or null if impossible
function computePairsWithExclusions(users, exclusions){
  const ids = users.map(u => u.id);
  const excl = exclusions || {};
  const allowed = {};
  for(const g of ids){
    allowed[g] = ids.filter(r => r !== g && !(excl[g] && excl[g].includes(r)));
    if(allowed[g].length === 0) return null; // impossible for this giver
  }

  // Backtracking with heuristic: assign givers with fewest options first
  const givers = ids.slice().sort((a,b) => allowed[a].length - allowed[b].length);
  const used = new Set();
  const assignment = {};

  function dfs(i){
    if(i === givers.length) return true;
    const g = givers[i];
    // try receivers in random order to avoid pathological deterministic failures
    const options = shuffle(allowed[g].slice());
    for(const r of options){
      if(used.has(r)) continue;
      used.add(r); assignment[g] = r;
      if(dfs(i+1)) return true;
      used.delete(r); delete assignment[g];
    }
    return false;
  }

  if(dfs(0)) return assignment;
  return null;
}

// List of christmassy codenames (at least 10)
const CODENAMES = [
  'Claus 🎅', 'Rudolph 🦌', 'MrsSanta 🎀', 'Mistletoe 🌿', 'Krampus 👹', 'Frosty ⛄', 'Holly 🌿', 'Jingle 🔔', 'Tinsel 🎗️', 'Sleigh 🛷', 'Donner ⚡', 'Blitzen ✨',
  'CandyCane 🍭', 'Eggnog 🥛', 'YuleBeary 🐻', 'SparkleElf ✨', 'GingerSnap 🍪', 'SleighCat 🐱', 'Snowflake ❄️', 'MerryMittens 🧤', 'Pudding 🍮', 'TwinkleToes ⭐️'
];

// Deterministic codename mapping using salted djb2 -> index into CODENAMES
function codenameForId(id){
  // Prefer an explicitly assigned codename persisted in state.codenames
  try{
    if(state && state.codenames && state.codenames[id]) return state.codenames[id];
  }catch(e){ /* ignore; fall back to deterministic mapping */ }
  // Fallback deterministic obfuscation using salted djb2 -> index into CODENAMES
  const salt = (window.organizerSecret || '');
  const s = id + '::' + salt;
  let h = 5381;
  for(let i=0;i<s.length;i++) h = ((h<<5) + h) + s.charCodeAt(i);
  h = Math.abs(h);
  const idx = h % CODENAMES.length;
  return CODENAMES[idx];
}

// Robust renderer helper: always return a printable codename for an id.
// Prefer persisted mapping, then deterministic fallback, then ADMIN_CODENAME for admin id.
function displayCodename(id){
  try{
    if(state && state.codenames && state.codenames[id]) return state.codenames[id];
  }catch(e){}
  // if id belongs to an admin user, prefer ADMIN_CODENAME
  try{
    const u = (state && state.users) ? state.users.find(x => x.id === id) : null;
    if(u && u.username === ADMIN_USERNAME) return ADMIN_CODENAME;
  }catch(e){}
  // fallback to deterministic mapping
  const c = codenameForId(id);
  if(c) return c;
  // last resort: render a short placeholder (avoid showing raw id)
  return 'Unbekannt';
}

function render(){
  // Start from the local copy so UI is responsive, then try to sync with Firestore
  const localState = loadData();
  state = localState;

  // If Firestore is enabled, fetch remote state and replace local if different
  if(useFirestore){
    loadSharedData().then(remote => {
      try{
            // Determine whether to preserve local pairs while the current user is editing
            const preservePairs = (session && session.userId && wishlistDrafts[session.userId] &&
              wishlistDrafts[session.userId] !== (localState.users.find(u=>u.id===session.userId)||{}).wishlist);
            // Merge remote into local, preserving any in-progress local drafts and optionally pairs.
            const merged = mergeSharedState(localState, remote || {users:[], pairs:{}, codenames:{}}, { preservePairsIfEditing: preservePairs, currentUserId: session.userId });
            if(JSON.stringify(merged) !== JSON.stringify(localState)){
              state = merged;
              // update local cache with merged authoritative data
              saveDataLocal(state);
              // re-render once with the merged data
              render();
            }
      }catch(e){ console.warn('render: sync compare failed', e); }
    }).catch(e=>{ console.warn('render: loadSharedData failed', e); });
  }
  // nav
  nav.innerHTML = '';
  const l = document.createElement('div');
  l.textContent = `Nutzer: ${state.users.length}`;
  nav.appendChild(l);

  if(!session.userId){ auth.classList.remove('hidden'); dashboard.classList.add('hidden'); return; }

  auth.classList.add('hidden'); dashboard.classList.remove('hidden');
  const me = state.users.find(u=>u.id === session.userId);
  // Use robust display helper so admin always sees their reserved codename and we avoid raw ids.
  const myCode = displayCodename(me.id);
  // Show username with codename in the welcome line (admins should also see their codename)
  welcome.textContent = `Willkommen, ${me.username} (${myCode})`;
  // Avoid overwriting the textarea while the user is actively typing.
  try{
    if(document.activeElement !== wishlistInput){
      // prefer an in-progress draft if present; fall back to saved wishlist
      const draft = wishlistDrafts[me.id];
      if(typeof draft !== 'undefined' && draft !== null){
        wishlistInput.value = draft;
      } else {
        wishlistInput.value = me.wishlist || '';
      }
    }
  }catch(e){ wishlistInput.value = me.wishlist || ''; }

  // assigned: who you gift (receiver) and who gives you (giver)
  if(state.pairs){
    // receiver: whom I should gift
    if(state.pairs[me.id]){
      const assignedId = state.pairs[me.id];
      const assignedUser = state.users.find(u=>u.id === assignedId);
      // Show only the username (no codename) when displaying who you gift
      const displayName = assignedUser.username;
      if(assignedHeader) assignedHeader.textContent = `Person, die du beschenkst: ${displayName}`;
      // render only the wishlist here (we moved the label into the header to avoid duplication)
      assignedInfo.innerHTML = `<div class="assigned-wishlist"><pre>${(assignedUser.wishlist||'(keine)')}</pre></div>`;
    } else {
      if(assignedHeader) assignedHeader.textContent = 'Person, die du beschenkst';
      assignedInfo.innerHTML = 'Du beschenkst im Moment niemanden.';
    }

    // giver: who gives me a present
    const giverId = Object.keys(state.pairs || {}).find(g => state.pairs[g] === me.id);
    if(giverId){
  const giverUser = state.users.find(u=>u.id === giverId);
  const giverCode = displayCodename(giverUser.id);
      assignedInfo.innerHTML += `<div class="giver" style="margin-top:8px"><strong>Du bekommst dein Geschenk von:</strong> ${giverCode}</div>`;
    } else {
      assignedInfo.innerHTML += `<div style="margin-top:8px"><em>Wer dir schenkt ist noch nicht gezogen.</em></div>`;
    }
  } else {
    assignedInfo.textContent = 'Noch keine Zuordnung vorhanden.';
  }

  // admin
  adminArea.classList.toggle('hidden', !me.isAdmin);
  if(usersList){
    usersList.innerHTML = '';
    state.users.forEach(u=>{
      const li = document.createElement('li');
      // Admins requested: list should show usernames only (no codenames)
      li.innerHTML = `${u.username} ${u.isAdmin?'<em>admin</em>':''}`;
      usersList.appendChild(li);
    });
  }

  // populate exclusions UI for admins
  if(me.isAdmin && exclusionGiver){
    // Avoid overwriting the admin controls while the admin is actively interacting with them
    // (e.g. changing the select or checking boxes). If the activeElement is inside the
    // exclusions UI, skip repopulation so user interactions don't get immediately reset
    // by background syncs / re-renders.
    let activeInsideExclusions = false;
    try{
      activeInsideExclusions = (document.activeElement === exclusionGiver) || (exclusionList && exclusionList.contains && exclusionList.contains(document.activeElement));
    }catch(e){ activeInsideExclusions = false; }

    if(!activeInsideExclusions){
      // Only repopulate the select when the number of options doesn't match users (cheap change-detection)
      const needRepop = exclusionGiver.options.length !== (state.users || []).length;
      if(needRepop) populateExclusionGiverSelect();
      // pick previously selected giver if it exists in the select, otherwise choose first
      const cur = exclusionGiver.value || (exclusionGiver.options.length? exclusionGiver.options[0].value : null);
      if(cur) exclusionGiver.value = cur;
      populateExclusionListFor(cur);
    }
  }

  // For admins: show pairs as codenames so names are not plainly visible, but patterns can be checked
  if(me.isAdmin){
    const pairs = state.pairs || {};
    const pairsTs = (state.meta && state.meta.pairsUpdatedAt) ? state.meta.pairsUpdatedAt : 0;
    // Only update the pairs view when the authoritative pairs timestamp changed.
    // Build the text for the pairs view (codename mapping)
    const lines = [];
    const codeMap = {};
    state.users.forEach(u => codeMap[u.id] = displayCodename(u.id));
    // Iterate giver ids in a stable, sorted order to avoid view jitter caused by
    // non-deterministic object key ordering between syncs.
    const giverIds = Object.keys(pairs || {}).slice().sort();
    for(const giverId of giverIds){
      const recvId = pairs[giverId];
      lines.push(`${codeMap[giverId]} -> ${codeMap[recvId]}`);
    }
    // also show counts to detect duplicates
    const counts = {};
  Object.values(pairs).forEach(id => { const c = codeMap[id] || displayCodename(id); counts[c] = (counts[c]||0)+1; });
  lines.push('\nAnzahl:');
  // Output counts in a stable, alphabetical order to avoid reordering between renders
  Object.keys(counts).slice().sort().forEach(k => lines.push(`${k}: ${counts[k]}`));
    const newText = lines.join('\n');
    // Update the admin pairs view when either the authoritative pairs timestamp changed
    // or the rendered text would be different (e.g. codenames updated).
    if(pairsTs !== lastPairsRenderedAt || pairsView.textContent !== newText){
      pairsView.textContent = newText;
      lastPairsRenderedAt = pairsTs;
    }
  } else {
    pairsView.textContent = Object.keys(state.pairs || {}).length ? JSON.stringify(state.pairs, null, 2) : '(keine)';
  }
}

render();

// Demo helper removed: do not auto-login the first user anymore.
// Users must sign in explicitly via the login form.
// If you need a dev helper to auto-login, run a console snippet manually.
