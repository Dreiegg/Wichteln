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
  state = await loadSharedData();
  const user = state.users.find(u=>u.id === session.userId);
  if(!user) return;
  user.wishlist = wishlistInput.value.trim();
  await saveSharedData(state);
  alert('Wunschliste gespeichert');
});

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

    // Now create a Sattolo cycle for gifting (ensures a single cycle permutation)
    const ids = state.users.map(u=>u.id);
    const cycle = sattolo(ids.slice());
    const pairs = {};
    for(let i=0;i<cycle.length;i++) pairs[cycle[i]] = cycle[(i+1)%cycle.length];
    state.pairs = pairs;
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
  resetPairs.addEventListener('click', async ()=>{ if(confirm('Pairs wirklich zurücksetzen?')){ state = await loadSharedData(); state.pairs = {}; await saveSharedData(state); render(); } });
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

// Simple deterministic obfuscation for ids using a salted djb2 hash -> base36
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

function render(){
  // Start from the local copy so UI is responsive, then try to sync with Firestore
  const localState = loadData();
  state = localState;

  // If Firestore is enabled, fetch remote state and replace local if different
  if(useFirestore){
    loadSharedData().then(remote => {
      try{
            if(JSON.stringify(remote) !== JSON.stringify(localState)){
              // accept remote state (including codenames) so mappings stay consistent across devices
              const r = remote || {users: [], pairs: {}, codenames: {}};
              r.users = r.users || [];
              r.pairs = r.pairs || {};
              r.codenames = r.codenames || {};
              state = r;
              // update local cache
              saveDataLocal(state);
              // re-render once with the remote data
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
  const myCode = codenameForId(me.id);
  // Show username with codename only in the welcome line for non-admins (privacy elsewhere preserved)
  if(me.isAdmin){
    welcome.textContent = `Willkommen, ${me.username}`;
  } else {
    welcome.textContent = `Willkommen, ${me.username} (${myCode})`;
  }
  // Avoid overwriting the textarea while the user is actively typing.
  try{
    if(document.activeElement !== wishlistInput){
      wishlistInput.value = me.wishlist || '';
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
      const giverCode = codenameForId(giverUser.id);
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

  // For admins: show pairs as codenames so names are not plainly visible, but patterns can be checked
  if(me.isAdmin){
    const pairs = state.pairs || {};
    const lines = [];
    // mapping id -> codename
    const codeMap = {};
    state.users.forEach(u => codeMap[u.id] = codenameForId(u.id));
    for(const giverId of Object.keys(pairs)){
      const recvId = pairs[giverId];
      lines.push(`${codeMap[giverId]} -> ${codeMap[recvId]}`);
    }
    // also show counts to detect duplicates
    const counts = {};
    Object.values(pairs).forEach(id => { const c = codeMap[id]||id; counts[c] = (counts[c]||0)+1; });
    lines.push('\nAnzahl:');
    Object.keys(counts).forEach(k => lines.push(`${k}: ${counts[k]}`));
    pairsView.textContent = lines.join('\n');
  } else {
    pairsView.textContent = Object.keys(state.pairs || {}).length ? JSON.stringify(state.pairs, null, 2) : '(keine)';
  }
}

render();

// Demo helper removed: do not auto-login the first user anymore.
// Users must sign in explicitly via the login form.
// If you need a dev helper to auto-login, run a console snippet manually.
