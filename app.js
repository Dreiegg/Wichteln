// Simple client-side Secret Santa (Wichteln) app
// Stores users, wishlists and pairs in localStorage. Single-file app logic.

const LS_KEY = 'wichteln_data_v1';

function uid(){ return 'u_' + Math.random().toString(36).slice(2,9); }

// Local state; will be synced with Firestore if configured
let state = {users: [], pairs: {}};
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
  if(!raw) return {users: [], pairs: {}};
  try{ return JSON.parse(raw);}catch(e){return {users:[], pairs:{}}}
}

function saveDataLocal(d){ localStorage.setItem(LS_KEY, JSON.stringify(d)); }

async function loadSharedData(){
  if(!useFirestore) return loadData();
  // read from Firestore doc 'shared/wichteln'
  try{
    const doc = await firestoreDb.collection('shared').doc('wichteln').get();
    if(!doc.exists) return loadData();
    return doc.data();
  }catch(e){ console.warn('loadSharedData failed', e); return loadData(); }
}

async function saveSharedData(d){
  if(!useFirestore){ saveDataLocal(d); return; }
  try{
    await firestoreDb.collection('shared').doc('wichteln').set(d);
    // also keep local copy
    saveDataLocal(d);
  }catch(e){ console.warn('saveSharedData failed', e); saveDataLocal(d);}  
}

// init demo admin if no users
async function ensureInitialData(){
  const loaded = await loadSharedData();
  state = loaded || {users: [], pairs: {}};
  if(state.users.length === 0){
    const admin = {id: uid(), username: 'admin', displayName: 'Admin', pwd: 'admin', isAdmin: true, wishlist: ''};
    state.users.push(admin);
    await saveSharedData(state);
  }
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
const changeCredsBtn = document.getElementById('changeCredsBtn');
const credsForm = document.getElementById('credsForm');
const credsDisplayName = document.getElementById('credsDisplayName');
const credsCurrentPwd = document.getElementById('credsCurrentPwd');
const credsNewPwd = document.getElementById('credsNewPwd');
const credsNewPwd2 = document.getElementById('credsNewPwd2');
const assignedInfo = document.getElementById('assignedInfo');
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
const deleteUsernameInput = document.getElementById('deleteUsernameInput');
const deleteUserBtn = document.getElementById('deleteUserBtn');
const resetUsernameInput = document.getElementById('resetUsernameInput');
const resetPwdInput = document.getElementById('resetPwdInput');
const resetPwdBtn = document.getElementById('resetPwdBtn');

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
  // No separate display name: use username as displayName
  const displayName = username;
  const password = f.get('password');
  const isAdmin = !!f.get('isAdmin');
  const adminKey = f.get('adminKey');
  state = await loadSharedData();
  if(state.users.find(u=>u.username===username)){ alert('Benutzername bereits vergeben'); return; }
  // If an organizer secret is configured, require it for admin creation
  if(isAdmin && window.organizerSecret){
    if(!adminKey || adminKey !== window.organizerSecret){ alert('Falsches Organisator-Passwort, Admin-Erstellung nicht erlaubt'); return; }
  }
  const user = {id: uid(), username, displayName, pwd: password, isAdmin, wishlist: ''};
  state.users.push(user); await saveSharedData(state);
  alert('Registrierung erfolgreich — bitte anmelden');
  registerBox.classList.add('hidden'); loginBox.classList.remove('hidden');
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

// toggle credentials form visibility
if(changeCredsBtn && credsForm){
  changeCredsBtn.addEventListener('click', ()=>{
    credsForm.classList.toggle('hidden');
    // prefill display name when showing
    if(!credsForm.classList.contains('hidden')){
      const s = loadData();
      const me = s.users.find(u=>u.id === session.userId) || {};
      credsDisplayName.value = me.displayName || me.username || '';
      credsCurrentPwd.value = '';
      credsNewPwd.value = '';
      credsNewPwd2.value = '';
    }
  });
}

// handle credentials form submit: change display name and/or password (requires current password when changing pwd)
if(credsForm){
  credsForm.addEventListener('submit', async e=>{
    e.preventDefault();
    state = await loadSharedData();
    const user = state.users.find(u=>u.id === session.userId);
    if(!user) return alert('Nicht eingeloggt');

    const newName = (credsDisplayName.value || '').trim();
    const currentPwd = credsCurrentPwd.value || '';
    const newPwd = credsNewPwd.value || '';
    const newPwd2 = credsNewPwd2.value || '';

    // change display name if provided
    if(newName && newName !== user.displayName){
      user.displayName = newName;
    }

    // if password fields filled, require current password and match
    if(newPwd || newPwd2){
      if(!currentPwd) return alert('Bitte aktuelles Passwort eingeben, um das Passwort zu ändern');
      if(currentPwd !== user.pwd) return alert('Aktuelles Passwort falsch');
      if(newPwd.length < 4) return alert('Neues Passwort zu kurz (min. 4 Zeichen)');
      if(newPwd !== newPwd2) return alert('Neue Passwörter stimmen nicht überein');
      user.pwd = newPwd;
    }

    await saveSharedData(state);
    alert('Änderungen gespeichert');
    credsForm.classList.add('hidden');
    render();
  });
}

drawBtn.addEventListener('click', async ()=>{
  state = await loadSharedData();
  if(state.users.length < 2){ alert('Mindestens 2 Nutzer nötig'); return; }
  const ids = state.users.map(u=>u.id);
  const cycle = sattolo(ids.slice());
  const pairs = {};
  for(let i=0;i<cycle.length;i++) pairs[cycle[i]] = cycle[(i+1)%cycle.length];
  state.pairs = pairs; await saveSharedData(state); render();
});

exportPairs.addEventListener('click', async ()=>{
  state = await loadSharedData();
  const dataStr = JSON.stringify({users: state.users, pairs: state.pairs}, null, 2);
  downloadText('wichteln_pairs.json', dataStr);
});

resetPairs.addEventListener('click', async ()=>{ if(confirm('Pairs wirklich zurücksetzen?')){ state = await loadSharedData(); state.pairs = {}; await saveSharedData(state); render(); } });

// Admin: delete user by username
if(deleteUserBtn){
  deleteUserBtn.addEventListener('click', async ()=>{
    const username = (deleteUsernameInput.value || '').trim();
    if(!username) return alert('Bitte Benutzernamen eingeben');
    if(!confirm(`Benutzer "${username}" wirklich löschen? Diese Aktion ist permanent.`)) return;
    state = await loadSharedData();
    const me = state.users.find(u=>u.id === session.userId);
    if(!me || !me.isAdmin) return alert('Nur Admins können Nutzer löschen');
    const idx = state.users.findIndex(u=>u.username === username);
    if(idx === -1) return alert('Benutzer nicht gefunden');
    const removed = state.users[idx];
    // prevent deleting the last admin
    if(removed.isAdmin){
      const adminCount = state.users.filter(u=>u.isAdmin).length;
      if(adminCount <= 1) return alert('Kann den letzten Admin nicht löschen. Lege zuerst einen weiteren Admin an.');
    }
    // perform removal
    state.users.splice(idx,1);
    // remove any pairs referencing the removed user
    const newPairs = {};
    Object.keys(state.pairs || {}).forEach(g => {
      const r = state.pairs[g];
      if(g === removed.id) return; // removed giver
      if(r === removed.id) return; // removed receiver
      newPairs[g] = r;
    });
    state.pairs = newPairs;
    // if removed user is current session, log them out
    if(session.userId === removed.id) session.userId = null;
    await saveSharedData(state);
    alert('Benutzer gelöscht: ' + username);
    render();
  });
}

// Admin: reset a user's password by username
if(resetPwdBtn){
  resetPwdBtn.addEventListener('click', async ()=>{
    const username = (resetUsernameInput.value || '').trim();
    const newPwdRaw = (resetPwdInput.value || '').trim();
    if(!username) return alert('Bitte Benutzernamen eingeben');
    state = await loadSharedData();
    const me = state.users.find(u=>u.id === session.userId);
    if(!me || !me.isAdmin) return alert('Nur Admins können Passwörter zurücksetzen');
    const user = state.users.find(u=>u.username === username);
    if(!user) return alert('Benutzer nicht gefunden');

    // generate a random password if none provided
    let newPwd = newPwdRaw;
    if(!newPwd){
      newPwd = Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,6);
    }

    user.pwd = newPwd;
    await saveSharedData(state);

    // If the reset target is the current session, keep them logged in (their session id stays valid)
    alert(`Passwort für ${username} wurde zurückgesetzt. Neues Passwort: ${newPwd}\nBitte dem Nutzer mitteilen, dass er das Passwort ändern sollte.`);
    // clear input for safety
    resetPwdInput.value = '';
    render();
  });
}

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

// Simple deterministic obfuscation for ids using a salted djb2 hash -> base36
// List of christmassy codenames (at least 10)
const CODENAMES = [
  'Claus', 'Rudolph', 'MrsSanta', 'Mistletoe', 'Krampus', 'Frosty', 'Holly', 'Jingle', 'Tinsel', 'Sleigh', 'Donner', 'Blitzen'
];

// Deterministic codename mapping using salted djb2 -> index into CODENAMES
function codenameForId(id){
  const salt = (window.organizerSecret || '');
  const s = id + '::' + salt;
  let h = 5381;
  for(let i=0;i<s.length;i++) h = ((h<<5) + h) + s.charCodeAt(i);
  h = Math.abs(h);
  const idx = h % CODENAMES.length;
  return CODENAMES[idx];
}

function render(){
  state = loadData();
  // nav
  nav.innerHTML = '';
  const l = document.createElement('div');
  l.textContent = `Nutzer: ${state.users.length}`;
  nav.appendChild(l);

  if(!session.userId){ auth.classList.remove('hidden'); dashboard.classList.add('hidden'); return; }

  auth.classList.add('hidden'); dashboard.classList.remove('hidden');
  const me = state.users.find(u=>u.id === session.userId);
  const myCode = codenameForId(me.id);
  welcome.textContent = `Willkommen, ${me.displayName || me.username} (${myCode})`;
  wishlistInput.value = me.wishlist || '';

  // assigned: who you gift (receiver) and who gives you (giver)
  if(state.pairs){
    // receiver: whom I should gift
    if(state.pairs[me.id]){
      const assignedId = state.pairs[me.id];
      const assignedUser = state.users.find(u=>u.id === assignedId);
      const assignedCode = codenameForId(assignedUser.id);
      assignedInfo.innerHTML = `<strong>Du beschenkst:</strong> ${assignedUser.displayName||assignedUser.username} (${assignedCode})<br><pre>${(assignedUser.wishlist||'(keine)')}</pre>`;
    } else {
      assignedInfo.innerHTML = 'Du beschenkst im Moment niemanden.';
    }

    // giver: who gives me a present
    const giverId = Object.keys(state.pairs || {}).find(g => state.pairs[g] === me.id);
    if(giverId){
      const giverUser = state.users.find(u=>u.id === giverId);
      const giverCode = codenameForId(giverUser.id);
      assignedInfo.innerHTML += `<div style="margin-top:8px"><strong>Du bekommst dein Geschenk von:</strong> ${giverCode}</div>`;
    } else {
      assignedInfo.innerHTML += `<div style="margin-top:8px"><em>Wer dir schenkt ist noch nicht gezogen.</em></div>`;
    }
  } else {
    assignedInfo.textContent = 'Noch keine Zuordnung vorhanden.';
  }

  // admin
  adminArea.classList.toggle('hidden', !me.isAdmin);
  usersList.innerHTML = '';
  state.users.forEach(u=>{
    const li = document.createElement('li');
    const code = codenameForId(u.id);
    li.innerHTML = `${u.displayName||u.username} (${code}) ${u.isAdmin?'<em>admin</em>':''}`;
    usersList.appendChild(li);
  });

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
