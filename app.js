// app.js — EduSync front end
//
// This file used to keep a whole fake "database" (users, assignments, PDF
// bytes) in localStorage. Now it just talks to the backend over HTTP:
// every piece of state (accounts, assignments, submissions, PDFs) lives on
// the server, in backend/data/db.json and backend/uploads/.

// Change this if your backend runs somewhere other than localhost:4000.
const API_BASE = 'http://localhost:4000';

let currentRole = 'student';
let currentUser = null; // { id, name, role }

// Files the user has picked but not yet uploaded, keyed by the hidden
// input's id (e.g. "teacher-pdf-data" or "sdd-<assignmentId>").
const selectedFiles = {};

// ---------------------------------------------------------------------------
// Small fetch helper
// ---------------------------------------------------------------------------
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no JSON body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Landing / auth
// ---------------------------------------------------------------------------
function switchRole(r) {
  currentRole = r;
  document.querySelectorAll('.role-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && r === 'student') || (i === 1 && r === 'teacher'));
  });
  clearMsg('msg-landing');
}
function showRegister() { document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; clearMsg('msg-landing'); }
function showLogin() { document.getElementById('register-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; clearMsg('msg-landing'); }
function showMsg(id, text, type) { const el = document.getElementById(id); el.textContent = text; el.className = 'msg ' + type; }
function clearMsg(id) { const el = document.getElementById(id); el.className = 'msg'; el.textContent = ''; }

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const id = document.getElementById('reg-id').value.trim();
  const pw = document.getElementById('reg-pw').value;
  const pw2 = document.getElementById('reg-pw2').value;
  if (!name || !id || !pw) return showMsg('msg-landing', 'Please fill in all fields.', 'err');
  if (pw !== pw2) return showMsg('msg-landing', 'Passwords do not match.', 'err');

  try {
    await api('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, id, pw, role: currentRole })
    });
    showMsg('msg-landing', 'Account created! You can now sign in.', 'ok');
    showLogin();
  } catch (e) {
    showMsg('msg-landing', e.message, 'err');
  }
}

async function doLogin() {
  const id = document.getElementById('login-id').value.trim();
  const pw = document.getElementById('login-pw').value;

  try {
    const user = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pw, role: currentRole })
    });
    currentUser = user;
    if (user.role === 'teacher') openTeacher(); else openStudent();
  } catch (e) {
    showMsg('msg-landing', e.message, 'err');
  }
}

function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

function openTeacher() {
  show('teacher-dashboard');
  document.getElementById('teacher-name-top').textContent = currentUser.name;
  document.getElementById('teacher-avatar').textContent = initials(currentUser.name);
  setTodayMin();
}
function openStudent() {
  show('student-dashboard');
  document.getElementById('student-name-top').textContent = currentUser.name;
  document.getElementById('student-avatar').textContent = initials(currentUser.name);
  renderStudentAssignments();
}
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }

function logout() {
  currentUser = null;
  document.getElementById('login-id').value = '';
  document.getElementById('login-pw').value = '';
  clearMsg('msg-landing');
  show('landing');
}

function setTodayMin() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('t-publish').value = today;
  document.getElementById('t-publish').min = today;
  document.getElementById('t-due').min = today;
}

function teacherTab(tab) {
  document.getElementById('teacher-post-panel').style.display = tab === 'post' ? 'block' : 'none';
  document.getElementById('teacher-view-panel').style.display = tab === 'view' ? 'block' : 'none';
  document.getElementById('nav-post').classList.toggle('active', tab === 'post');
  document.getElementById('nav-view').classList.toggle('active', tab === 'view');
  if (tab === 'view') renderTeacherAssignments();
}

// ---------------------------------------------------------------------------
// PDF picker widgets (drag/drop + click to browse)
// The file itself is kept in memory (selectedFiles) until the form is
// submitted — only then does it get uploaded to the backend.
// ---------------------------------------------------------------------------
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function fmtSize(b) { return b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }

function handleDragOver(e, zoneId) { e.preventDefault(); document.getElementById(zoneId).classList.add('drag-over'); }
function handleDragLeave(zoneId) { document.getElementById(zoneId).classList.remove('drag-over'); }

function handleDrop(e, inputId, previewId, dataId, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processPdfFile(file, previewId, dataId, zoneId);
}

function handleFileSelect(input, previewId, dataId, zoneId) {
  const file = input.files[0];
  if (file) processPdfFile(file, previewId, dataId, zoneId);
}

function processPdfFile(file, previewId, dataId, zoneId) {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) { alert('Please upload a PDF file only.'); return; }
  if (file.size > MAX_PDF_BYTES) { alert('File too large. Maximum size is 5 MB.'); return; }

  selectedFiles[dataId] = file;

  const preview = document.getElementById(previewId);
  preview.querySelector('.pdf-preview-name').textContent = file.name;
  preview.querySelector('.pdf-preview-size').textContent = fmtSize(file.size);
  preview.style.display = 'flex';
  document.getElementById(zoneId).style.display = 'none';
}

function removePdf(inputId, previewId, dataId, zoneId) {
  delete selectedFiles[dataId];
  document.getElementById(previewId).style.display = 'none';
  document.getElementById(zoneId).style.display = 'block';
  const input = document.getElementById(inputId);
  if (input) input.value = '';
}

function openPdf(fileInfo) {
  if (!fileInfo) return;
  window.open(API_BASE + fileInfo.url, '_blank');
}

// ---------------------------------------------------------------------------
// Teacher: post assignment
// ---------------------------------------------------------------------------
async function postAssignment() {
  const subject = document.getElementById('t-subject').value.trim();
  const title = document.getElementById('t-title').value.trim();
  const desc = document.getElementById('t-desc').value.trim();
  const publish = document.getElementById('t-publish').value;
  const due = document.getElementById('t-due').value;
  if (!subject || !title || !publish || !due) return showMsg('msg-post', 'Please fill in all required fields.', 'err');
  if (due < publish) return showMsg('msg-post', 'Due date cannot be before publish date.', 'err');

  const form = new FormData();
  form.append('subject', subject);
  form.append('title', title);
  form.append('desc', desc);
  form.append('publish', publish);
  form.append('due', due);
  form.append('teacherId', currentUser.id);
  form.append('teacherName', currentUser.name);
  if (selectedFiles['teacher-pdf-data']) form.append('pdf', selectedFiles['teacher-pdf-data']);

  try {
    await api('/api/assignments', { method: 'POST', body: form });
    showMsg('msg-post', 'Assignment published successfully!', 'ok');
    ['t-subject', 't-title', 't-desc', 't-due'].forEach(f => document.getElementById(f).value = '');
    removePdf('teacher-pdf-input', 'teacher-pdf-preview', 'teacher-pdf-data', 'teacher-drop-zone');
    setTodayMin();
  } catch (e) {
    showMsg('msg-post', e.message, 'err');
  }
}

// ---------------------------------------------------------------------------
// Teacher: view assignments (with student submissions)
// ---------------------------------------------------------------------------
async function renderTeacherAssignments() {
  const el = document.getElementById('teacher-assignments-list');
  let mine;
  try {
    mine = await api(`/api/assignments?role=teacher&teacherId=${encodeURIComponent(currentUser.id)}`);
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Couldn\'t load assignments</div><div class="empty-sub">' + esc(e.message) + '</div></div>';
    return;
  }

  if (!mine.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Nothing posted yet</div><div class="empty-sub">Switch to &ldquo;Post Assignment&rdquo; to publish your first one.</div></div>'; return; }

  el.innerHTML = mine.map(a => {
    const subs = a.submissions || {};
    const subCount = Object.keys(subs).length;
    const pdfBtn = a.pdf ? `<button class="pdf-link" onclick='openPdf(${JSON.stringify(a.pdf)})'>📄 ${esc(a.pdf.originalName || 'attachment.pdf')}</button>` : '';
    const subsHtml = subCount > 0
      ? '<details style="margin-top:10px"><summary style="font-size:12px;color:var(--ink-muted);cursor:pointer">' + subCount + ' submission' + (subCount > 1 ? 's' : '') + ' received</summary><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">' +
        Object.values(subs).map(sub =>
          '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--sage-light);border-radius:6px;font-size:12px">' +
          '<span>👤 <strong>' + esc(sub.studentName) + '</strong></span>' +
          '<span style="color:var(--ink-light)">' + sub.submittedAt + '</span>' +
          `<button class="pdf-link" style="margin-left:auto" onclick='openPdf(${JSON.stringify(sub.pdf)})'>📥 ${esc(sub.pdf.originalName || 'submission.pdf')}</button>` +
          '</div>'
        ).join('') +
        '</div></details>'
      : '<div style="font-size:12px;color:var(--ink-light);margin-top:8px">No submissions yet</div>';
    return '<div class="assignment-card">' +
      '<div class="card-top"><div>' +
      '<div class="card-subject">' + esc(a.subject) + '</div>' +
      '<div class="card-title">' + esc(a.title) + '</div>' +
      '</div><button class="btn-danger" onclick="deleteAssignment(' + a.id + ')">Delete</button></div>' +
      (a.desc ? '<div class="card-desc">' + esc(a.desc) + '</div>' : '') +
      '<div class="card-footer" style="flex-wrap:wrap;gap:8px">' +
      '<span class="badge badge-warn">📅 Publishes ' + a.publish + '</span>' +
      '<span class="badge badge-danger">⏰ Due ' + a.due + '</span>' +
      pdfBtn + '</div>' + subsHtml + '</div>';
  }).join('');
}

async function deleteAssignment(id) {
  try {
    await api('/api/assignments/' + id, { method: 'DELETE' });
    renderTeacherAssignments();
  } catch (e) {
    alert(e.message);
  }
}

// ---------------------------------------------------------------------------
// Student: view assignments + submit PDF
// ---------------------------------------------------------------------------
async function renderStudentAssignments() {
  const el = document.getElementById('student-assignments-list');
  let visible;
  try {
    visible = await api(`/api/assignments?role=student&studentId=${encodeURIComponent(currentUser.id)}`);
  } catch (e) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Couldn\'t load assignments</div><div class="empty-sub">' + esc(e.message) + '</div></div>';
    return;
  }

  if (!visible.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📬</div><div class="empty-title">No assignments yet</div><div class="empty-sub">Your teachers haven\'t posted anything yet. Check back soon!</div></div>'; return; }

  const today = new Date().toISOString().split('T')[0];
  el.innerHTML = visible.map(a => {
    const overdue = a.due < today;
    const daysLeft = Math.ceil((new Date(a.due) - new Date(today)) / 86400000);
    const label = overdue ? 'Overdue' : daysLeft === 0 ? 'Due today!' : daysLeft === 1 ? 'Due tomorrow' : 'Due in ' + daysLeft + ' days';
    const badgeClass = overdue ? 'badge-danger' : daysLeft <= 2 ? 'badge-warn' : 'badge-ok';
    const icon = overdue ? '🔴' : daysLeft <= 2 ? '🟡' : '🟢';
    const cardClass = overdue ? 'overdue' : daysLeft > 2 ? 'ok' : '';
    const pdfBtn = a.pdf ? `<button class="pdf-link" onclick='openPdf(${JSON.stringify(a.pdf)})'>📄 ${esc(a.pdf.originalName || 'Download PDF')}</button>` : '';
    const sub = a.mySubmission;
    const submitSection = '<div class="student-submit-section">' +
      '<div class="student-submit-label">Your Submission</div>' +
      (sub
        ? '<div class="submission-status submitted">✅ Submitted on ' + sub.submittedAt + '</div>' +
          `<button class="pdf-link" style="margin-top:6px" onclick='openPdf(${JSON.stringify(sub.pdf)})'>📥 View my submission</button>` +
          '<div style="font-size:11px;color:var(--ink-light);margin-top:6px">Re-upload below to replace your submission</div>'
        : '<div class="submission-status pending">📤 Not submitted yet</div>') +
      '<div style="margin-top:10px">' +
      '<div class="pdf-drop-zone" id="sdz-' + a.id + '" ondragover="handleDragOver(event,\'sdz-' + a.id + '\')" ondragleave="handleDragLeave(\'sdz-' + a.id + '\')" ondrop="handleDrop(event,\'sdi-' + a.id + '\',\'sdp-' + a.id + '\',\'sdd-' + a.id + '\',\'sdz-' + a.id + '\')">' +
        '<input type="file" id="sdi-' + a.id + '" accept=".pdf" onchange="handleFileSelect(this,\'sdp-' + a.id + '\',\'sdd-' + a.id + '\',\'sdz-' + a.id + '\')">' +
        '<div class="pdf-drop-icon">📎</div>' +
        '<div class="pdf-drop-text"><strong>Click to upload</strong> or drag &amp; drop</div>' +
        '<div class="pdf-drop-hint">PDF only &middot; Max 5 MB</div>' +
      '</div>' +
      '<div id="sdp-' + a.id + '" style="display:none" class="pdf-preview">' +
        '<span class="pdf-preview-icon">📄</span>' +
        '<span class="pdf-preview-name"></span>' +
        '<span class="pdf-preview-size"></span>' +
        '<button class="pdf-remove-btn" onclick="removePdf(\'sdi-' + a.id + '\',\'sdp-' + a.id + '\',\'sdd-' + a.id + '\',\'sdz-' + a.id + '\')" title="Remove">&#x2715;</button>' +
      '</div>' +
      '<button class="btn-submit-pdf" onclick="submitAssignment(' + a.id + ')">Submit PDF &#x2192;</button>' +
      '<div id="smsg-' + a.id + '" class="msg" style="margin-top:6px"></div>' +
      '</div></div>';
    return '<div class="assignment-card ' + cardClass + '">' +
      '<div class="card-top"><div>' +
      '<div class="card-subject' + (overdue ? ' red' : daysLeft > 2 ? ' green' : '') + '">' + esc(a.subject) + '</div>' +
      '<div class="card-title">' + esc(a.title) + '</div>' +
      '<div class="card-by">by ' + esc(a.teacherName) + '</div>' +
      '</div><span class="badge ' + badgeClass + '">' + icon + ' ' + label + '</span></div>' +
      (a.desc ? '<div class="card-desc">' + esc(a.desc) + '</div>' : '') +
      '<div class="card-footer" style="flex-wrap:wrap;gap:8px">' +
      '<span class="badge badge-warn">📅 Published ' + a.publish + '</span>' +
      '<span class="card-due">Due: <strong>' + a.due + '</strong></span>' +
      pdfBtn + '</div>' + submitSection + '</div>';
  }).join('');
}

async function submitAssignment(assignmentId) {
  const msgEl = document.getElementById('smsg-' + assignmentId);
  const file = selectedFiles['sdd-' + assignmentId];
  if (!file) { msgEl.textContent = 'Please select a PDF to upload.'; msgEl.className = 'msg err'; return; }

  const form = new FormData();
  form.append('studentId', currentUser.id);
  form.append('studentName', currentUser.name);
  form.append('pdf', file);

  try {
    await api('/api/assignments/' + assignmentId + '/submit', { method: 'POST', body: form });
    msgEl.textContent = 'Submitted successfully!'; msgEl.className = 'msg ok';
    delete selectedFiles['sdd-' + assignmentId];
    setTimeout(() => renderStudentAssignments(), 1200);
  } catch (e) {
    msgEl.textContent = e.message; msgEl.className = 'msg err';
  }
}

// ---------------------------------------------------------------------------
// Escaping helpers (still needed — we render server data with innerHTML)
// ---------------------------------------------------------------------------
function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }
