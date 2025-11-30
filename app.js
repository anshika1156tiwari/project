/* app.js
   Frontend interactions for Academic-Net.
   IMPORTANT: This script uses several backend endpoints. Implement these endpoints on your server.

   Expected API endpoints (examples):
   - POST /api/auth/login                 { email, password } => { token, user }
   - POST /api/auth/register              { name, email, password, university, branch } => { token, user }
   - GET  /api/metadata/universities      => [ "Univ A", "Univ B" ]
   - GET  /api/files?univ=&branch=&sem=&subject=&page=&q= => { files: [...], total }
   - POST /api/files/upload (multipart)   => { success, file }
   - GET  /api/files/:id                  => { file: {...} }
   - GET  /api/missing_requests           => [ ... ]
   - POST /api/missing_requests           { subject, semester, university }
   - POST /api/files/:id/rate             { rating: 4 } => { avgRating }
   - POST /api/files/:id/comment          { text } => { comment }
   - POST /api/files/:id/report           { reason } => { ok }
   - GET  /api/leaderboard                => [ { user, points } ]
   - GET  /api/admin/stats                => { uploads, downloads, activeUsers }
   All requests requiring auth must accept Authorization: Bearer <token>.
*/

const API_BASE = '/api'; // change to your server base path

/* ---------- UI Shortcuts ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const state = {
  token: null,
  user: null,
  page: 1,
  perPage: 12,
  view: 'grid'
};

/* ---------- Utils ---------- */
function setToken(token, user){
  state.token = token;
  state.user = user || state.user;
  if(token) localStorage.setItem('academic_token', token);
  else localStorage.removeItem('academic_token');
  renderAuthUI();
}

function authHeaders(){
  if(!state.token) return {};
  return { 'Authorization': 'Bearer ' + state.token };
}

async function apiFetch(path, opts = {}){
  opts.headers = opts.headers || {};
  Object.assign(opts.headers, { 'Accept': 'application/json' });
  Object.assign(opts.headers, authHeaders());
  try{
    let res = await fetch(API_BASE + path, opts);
    if(!res.ok){
      const text = await res.text();
      console.error('API error', res.status, text);
      throw new Error(`API ${res.status}: ${text}`);
    }
    if(res.status === 204) return null;
    return await res.json();
  }catch(err){
    console.error('Fetch failed', err);
    throw err;
  }
}

/* ---------- Initializers ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // load token
  const token = localStorage.getItem('academic_token');
  if(token) state.token = token;
  bindUI();
  await loadFilterOptions();
  await loadFiles();
  await loadMissingRequests();
  await loadLeaderboard();
  try{ await loadAdminStats(); }catch(e){}
});

function bindUI(){
  // auth buttons
  $('#loginBtn').onclick = ()=> openAuthModal('login');
  $('#signupBtn').onclick = ()=> openAuthModal('signup');
  $('#closeAuth').onclick = closeAuthModal;
  $('#switchAuth').onclick = toggleAuthMode;
  $('#authForm').onsubmit = handleAuthSubmit;

  // upload modal
  $('#uploadBtn').onclick = openUploadModal;
  $('#closeUpload').onclick = closeUploadModal;
  $('#cancelUpload').onclick = closeUploadModal;
  $('#uploadForm').onsubmit = handleUpload;

  // search
  $('#searchBtn').onclick = () => { state.page = 1; loadFiles($('#searchInput').value.trim()); };
  $('#searchInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ state.page = 1; loadFiles($('#searchInput').value.trim()); } });

  // filters
  $('#applyFilter').onclick = () => { state.page = 1; loadFiles(); };
  $('#clearFilter').onclick = () => { clearFilterSelections(); loadFiles(); };

  // view toggles
  $('#listView').onclick = () => { state.view = 'list'; renderFiles(state.files || []); };
  $('#gridView').onclick = () => { state.view = 'grid'; renderFiles(state.files || []); };
}

/* ---------- Auth modal ---------- */
function openAuthModal(mode='login'){
  $('#modalBackdrop').classList.remove('hidden');
  $('#authModal').classList.remove('hidden');
  $('#authTitle').textContent = mode === 'login' ? 'Login' : 'Sign up';
  $('#authSubmit').textContent = mode === 'login' ? 'Login' : 'Create account';
  $('#switchAuth').textContent = mode === 'login' ? 'Switch to Sign up' : 'Switch to Login';
  if(mode === 'signup') $('#signupExtra').classList.remove('hidden'); else $('#signupExtra').classList.add('hidden');
  $('#authModal').dataset.mode = mode;
}
function closeAuthModal(){
  $('#modalBackdrop').classList.add('hidden');
  $('#authModal').classList.add('hidden');
  $('#authForm').reset();
}
function toggleAuthMode(){
  const mode = $('#authModal').dataset.mode === 'login' ? 'signup' : 'login';
  openAuthModal(mode);
}

async function handleAuthSubmit(ev){
  ev.preventDefault();
  const mode = $('#authModal').dataset.mode || 'login';
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if(mode === 'login'){
    try{
      const res = await apiFetch('/auth/login', { method: 'POST', headers:{ 'Content-Type':'application/json'}, body: JSON.stringify({ email, password })});
      setToken(res.token, res.user);
      closeAuthModal();
      alert('Logged in!');
    }catch(e){ alert('Login failed: ' + e.message); }
  }else{
    const name = $('#name').value.trim();
    const university = $('#university').value.trim();
    const branch = $('#branch').value.trim();
    try{
      const res = await apiFetch('/auth/register', { method:'POST', headers:{ 'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password, university, branch })});
      setToken(res.token, res.user);
      closeAuthModal();
      alert('Account created!');
    }catch(e){ alert('Register failed: ' + e.message); }
  }
}

function renderAuthUI(){
  if(state.token && state.user){
    $('#loginBtn').style.display = 'none';
    $('#signupBtn').style.display = 'none';
    $('#uploadBtn').style.display = 'inline-block';
  }else{
    $('#loginBtn').style.display = '';
    $('#signupBtn').style.display = '';
    $('#uploadBtn').style.display = 'inline-block';
  }
}

/* ---------- Load filter options (universities, branches, subjects) ---------- */
async function loadFilterOptions(){
  try{
    const data = await apiFetch('/metadata/universities');
    const uSelect = $('#filterUniversity');
    const uUpload = $('#u_university');
    uSelect.innerHTML = `<option value="">All</option>`;
    uUpload.innerHTML = `<option value="">Select</option>`;
    data.forEach(u => {
      const opt = document.createElement('option'); opt.value = u; opt.textContent = u;
      uSelect.appendChild(opt);
      const opt2 = opt.cloneNode(true); uUpload.appendChild(opt2);
    });
    // branches and subjects could be fetched dynamically when a university selected
    uSelect.onchange = () => populateBranches(uSelect.value);
    uUpload.onchange = () => populateBranches(uUpload.value, true);
  }catch(e){
    console.warn('Could not load universities', e);
  }
}

async function populateBranches(univ, uploadMode=false){
  if(!univ) return;
  try{
    const branches = await apiFetch(`/metadata/branches?univ=${encodeURIComponent(univ)}`);
    const sel = uploadMode ? $('#u_branch') : $('#filterBranch');
    sel.innerHTML = `<option value="">All</option>`;
    branches.forEach(b => {
      const o = document.createElement('option'); o.value = b; o.textContent = b;
      sel.appendChild(o);
    });
    // optionally populate subjects when branch selected
    sel.onchange = () => populateSubjects(univ, sel.value, uploadMode);
  }catch(e){ console.warn(e); }
}

async function populateSubjects(univ, branch, uploadMode=false){
  if(!univ || !branch) return;
  try{
    const subjects = await apiFetch(`/metadata/subjects?univ=${encodeURIComponent(univ)}&branch=${encodeURIComponent(branch)}`);
    const sel = uploadMode ? $('#u_subject') : $('#filterSubject');
    sel.innerHTML = `<option value="">All</option>`;
    subjects.forEach(s => {
      const o = document.createElement('option'); o.value = s; o.textContent = s;
      sel.appendChild(o);
    });
  }catch(e){ console.warn(e); }
}

/* ---------- File listing ---------- */
async function loadFiles(query=''){
  const univ = $('#filterUniversity').value || '';
  const branch = $('#filterBranch').value || '';
  const semester = $('#filterSemester').value || '';
  const subject = $('#filterSubject').value || '';
  const sort = $('#sortSelect').value || 'recent';
  const page = state.page || 1;
  const perPage = state.perPage;

  const qs = new URLSearchParams({ univ, branch, semester, subject, q: query, page, perPage, sort }).toString();
  try{
    const res = await apiFetch(`/files?${qs}`);
    state.files = res.files || [];
    state.total = res.total || 0;
    renderFiles(state.files);
    renderPagination(state.total, page, perPage);
  }catch(e){
    console.error('Failed to load files', e);
    $('#filesContainer').innerHTML = `<div class="card">Failed to load files.</div>`;
  }
}

function renderFiles(files){
  const container = $('#filesContainer');
  if(!files || files.length === 0){
    container.innerHTML = `<div class="card">No files found. Try expanding filters or searching different keywords.</div>`;
    return;
  }
  if(state.view === 'list'){
    container.classList.add('list'); container.classList.remove('files-grid');
    container.innerHTML = '';
    files.forEach(f => {
      const row = document.createElement('div'); row.className = 'file-row';
      row.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="width:48px;height:48px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-weight:700">${f.type?.slice(0,1) || 'F'}</div>
            <div>
              <div class="title">${escapeHtml(f.title)}</div>
              <div class="meta">${escapeHtml(f.university)} • ${escapeHtml(f.branch)} • Sem ${escapeHtml(f.semester)} • ${escapeHtml(f.type)} • v${escapeHtml(f.version||'1')}</div>
            </div>
          </div>
        </div>
        <div style="min-width:120px;text-align:right">
          <div class="rating">⭐ ${Number(f.avgRating || 0).toFixed(1)}</div>
          <div style="margin-top:6px"><button class="btn small" onclick="openFileModal('${f.id}')">Details</button></div>
        </div>
      `;
      container.appendChild(row);
    });
  } else {
    container.classList.remove('list'); container.classList.add('files-grid');
    container.innerHTML = '';
    files.forEach(f => {
      const card = document.createElement('div'); card.className = 'file-card';
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center">
          <div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(180deg,#eef2ff,#fff);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">
            ${escapeHtml((f.type||'F').slice(0,1))}</div>
          <div style="flex:1">
            <div class="title">${escapeHtml(f.title)}</div>
            <div class="meta">${escapeHtml(f.university)} • Sem ${escapeHtml(f.semester)} • ${escapeHtml(f.branch)}</div>
            <div class="meta" style="margin-top:6px">${escapeHtml(f.description||'')}</div>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn small" onclick="openFileModal('${f.id}')">View</button>
          <button class="btn small outline" onclick="downloadFile('${f.id}')">Download</button>
          <div style="margin-left:auto;font-size:13px;color:var(--muted)">⭐ ${Number(f.avgRating||0).toFixed(1)}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }
}

/* ---------- Pagination ---------- */
function renderPagination(total, page, perPage){
  const container = $('#paginationBar');
  container.innerHTML = '';
  const totalPages = Math.ceil(total / perPage) || 1;
  const createBtn = (p,text) => {
    const btn = document.createElement('button'); btn.className = 'btn small';
    btn.textContent = text; btn.onclick = ()=>{ state.page = p; loadFiles(); };
    return btn;
  };
  if(page>1) container.appendChild(createBtn(page-1,'Prev'));
  container.appendChild(document.createTextNode(` Page ${page} of ${totalPages} `));
  if(page<totalPages) container.appendChild(createBtn(page+1,'Next'));
}

/* ---------- File Modal & interactions ---------- */
async function openFileModal(fileId){
  try{
    const res = await apiFetch(`/files/${fileId}`);
    const f = res.file;
    $('#fileModalTitle').textContent = f.title;
    $('#fileDetailsBody').innerHTML = `
      <p><strong>${escapeHtml(f.title)}</strong></p>
      <p class="meta">${escapeHtml(f.university)} • ${escapeHtml(f.branch)} • Sem ${escapeHtml(f.semester)} • ${escapeHtml(f.type)}</p>
      <p>${escapeHtml(f.description || '')}</p>
      <p>Version: ${escapeHtml(f.version || '1')}</p>
      <p>Uploaded by: ${escapeHtml(f.uploaderName || 'Anonymous')}</p>
      <div style="margin-top:8px">
        <label>Rate this file:
          <select id="rateSelect">
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Very Good</option>
            <option value="3">3 - Good</option>
            <option value="2">2 - Poor</option>
            <option value="1">1 - Bad</option>
          </select>
        </label>
        <button class="btn small" id="rateSubmit">Submit Rating</button>
      </div>
      <div style="margin-top:12px">
        <h4>Comments</h4>
        <div id="commentsList">${(f.comments||[]).map(c=>`<div class="list-item"><b>${escapeHtml(c.user)}</b>: ${escapeHtml(c.text)}</div>`).join('')}</div>
        <textarea id="commentText" rows="3" style="width:100%;margin-top:8px" placeholder="Add a short comment"></textarea>
        <div style="margin-top:6px"><button class="btn small" id="commentSubmit">Comment</button></div>
      </div>
    `;
    $('#downloadFileBtn').onclick = () => downloadFile(fileId);
    $('#reportFileBtn').onclick = () => {
      const reason = prompt('Reason for report (short)');
      if(reason) reportFile(fileId, reason);
    };
    $('#commentSubmit').onclick = () => submitComment(fileId);
    $('#rateSubmit').onclick = () => submitRating(fileId);
    $('#closeFileModal').onclick = closeFileModal;
    $('#closeFileBtn').onclick = closeFileModal;
    $('#modalBackdrop').classList.remove('hidden');
    $('#fileModal').classList.remove('hidden');
  }catch(e){ alert('Failed to load file: ' + e.message); }
}
function closeFileModal(){ $('#modalBackdrop').classList.add('hidden'); $('#fileModal').classList.add('hidden'); $('#fileDetailsBody').innerHTML = ''; }

async function downloadFile(id){
  try{
    // this expects the API to return a pre-signed URL or redirect to storage
    const res = await apiFetch(`/files/${id}/download`);
    if(res.url) window.open(res.url, '_blank');
    else if(res.file && res.file.downloadUrl) window.open(res.file.downloadUrl, '_blank');
    else alert('Download available via server route');
  }catch(e){ alert('Download failed: ' + e.message); }
}

async function submitRating(fileId){
  const val = Number($('#rateSelect').value);
  try{
    const res = await apiFetch(`/files/${fileId}/rate`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ rating: val })});
    alert('Rating submitted. New average: ' + (res.avgRating||'—'));
    closeFileModal();
    loadFiles(); // refresh listing
  }catch(e){ alert('Rating failed: ' + e.message); }
}

async function submitComment(fileId){
  const text = $('#commentText').value.trim();
  if(!text) return alert('Please type a comment.');
  try{
    const res = await apiFetch(`/files/${fileId}/comment`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text })});
    alert('Comment added');
    closeFileModal();
    loadFiles();
  }catch(e){ alert('Comment failed: ' + e.message); }
}

async function reportFile(fileId, reason){
  try{
    await apiFetch(`/files/${fileId}/report`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ reason })});
    alert('File reported. Admin will review.');
  }catch(e){ alert('Report failed: ' + e.message); }
}

/* ---------- Upload ---------- */
function openUploadModal(){
  $('#modalBackdrop').classList.remove('hidden');
  $('#uploadModal').classList.remove('hidden');
  // prefill if user known
  if(state.user?.university) $('#u_university').value = state.user.university;
}

function closeUploadModal(){
  $('#modalBackdrop').classList.add('hidden');
  $('#uploadModal').classList.add('hidden');
  $('#uploadForm').reset();
}

async function handleUpload(ev){
  ev.preventDefault();
  if(!state.token) return alert('Please login before uploading.');

  const fileInput = $('#u_file');
  const file = fileInput.files[0];
  if(!file) return alert('Select a file to upload.');

  const payload = new FormData();
  payload.append('file', file);
  payload.append('title', file.name);
  payload.append('university', $('#u_university').value || '');
  payload.append('branch', $('#u_branch').value || '');
  payload.append('semester', $('#u_semester').value || '');
  payload.append('subject', $('#u_subject').value || $('#u_subject').value);
  payload.append('type', $('#u_type').value);
  payload.append('version', $('#u_version').value || '1');
  payload.append('description', $('#u_desc').value || '');

  try{
    const res = await fetch(API_BASE + '/files/upload', {
      method:'POST', headers: authHeaders(), body: payload
    });
    if(!res.ok) throw new Error('Upload failed: ' + res.statusText);
    const result = await res.json();
    alert('Uploaded successfully');
    closeUploadModal();
    loadFiles();
    loadLeaderboard();
  }catch(e){ alert('Upload error: ' + e.message); }
}

/* ---------- Missing requests ---------- */
async function loadMissingRequests(){
  try{
    const data = await apiFetch('/missing_requests');
    const list = $('#missingList'); list.innerHTML = '';
    data.forEach(req => {
      const li = document.createElement('li'); li.textContent = `${req.subject} — Sem ${req.semester} (${req.university || 'Any'})`;
      list.appendChild(li);
    });
    $('#missingForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const subject = $('#missingSubject').value.trim();
      const semester = $('#missingSemester').value.trim();
      try{
        await apiFetch('/missing_requests', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ subject, semester })});
        alert('Request submitted');
        $('#missingForm').reset();
        loadMissingRequests();
      }catch(e){ alert('Could not send request: ' + e.message); }
    };
  }catch(e){ console.warn('No missing requests', e); }
}

/* ---------- Leaderboard ---------- */
async function loadLeaderboard(){
  try{
    const data = await apiFetch('/leaderboard');
    const list = $('#leaderboardList'); list.innerHTML = '';
    data.forEach(u => {
      const li = document.createElement('li'); li.textContent = `${u.user} — ${u.points} pts`;
      list.appendChild(li);
    });
  }catch(e){ console.warn('Leaderboard load failed', e); }
}

/* ---------- Admin analytics ---------- */
async function loadAdminStats(){
  try{
    const stats = await apiFetch('/admin/stats');
    document.getElementById('statUploads').textContent = `Uploads: ${stats.uploads}`;
    document.getElementById('statDownloads').textContent = `Downloads: ${stats.downloads}`;
    document.getElementById('statActiveUsers').textContent = `Active users: ${stats.activeUsers}`;
    // show for admin only
    if(state.user && state.user.role === 'admin') document.getElementById('adminAnalytics').style.display = 'block';
  }catch(e){ console.warn('Admin stats not available', e); }
}

/* ---------- Utilities ---------- */
function escapeHtml(s){ if(!s && s !== 0) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clearFilterSelections(){
  $('#filterUniversity').value = ''; $('#filterBranch').value = ''; $('#filterSemester').value = ''; $('#filterSubject').value = '';
}

/* expose some functions for inline onclick */
window.openFileModal = openFileModal;
window.downloadFile = downloadFile;
window.openUploadModal = openUploadModal;
