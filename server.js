// server.js — EduSync backend API
//
// Everything the front end used to do itself with localStorage (accounts,
// assignments, submissions, and even the PDF bytes) now lives here instead:
// real files on disk, one JSON "table" for structured data, and a REST API
// in front of it. The front end only ever talks to this server over HTTP.

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readDb, writeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB, same limit as before

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR)); // serve stored PDFs

// ---- File upload handling (PDF only, 5MB max) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '.pdf');
  }
});

function pdfFileFilter(req, file, cb) {
  const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
  if (!isPdf) return cb(new Error('Only PDF files are allowed.'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_PDF_BYTES }
});

// Wrap multer's single-file upload so its errors come back as JSON, not a stack trace.
function uploadPdf(fieldName) {
  const mw = upload.single(fieldName);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  };
}

function publicFileInfo(file) {
  if (!file) return null;
  return { filename: file.filename, originalName: file.originalname, url: `/uploads/${file.filename}` };
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

app.post('/api/register', (req, res) => {
  const { name, id, pw, role } = req.body || {};
  if (!name || !id || !pw || !role) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }
  if (role !== 'student' && role !== 'teacher') {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const db = readDb();
  const key = `${role}:${id}`;
  if (db.users[key]) {
    return res.status(409).json({ error: 'That ID is already taken.' });
  }

  // NOTE: passwords are stored in plain text here to keep the demo simple.
  // A real deployment must hash passwords (e.g. bcrypt) before storing them.
  db.users[key] = { name, id, pw, role };
  writeDb(db);

  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { id, pw, role } = req.body || {};
  if (!id || !pw || !role) return res.status(400).json({ error: 'Please fill in all fields.' });

  const db = readDb();
  const key = `${role}:${id}`;
  const user = db.users[key];
  if (!user || user.pw !== pw) {
    return res.status(401).json({ error: 'Invalid ID or password.' });
  }

  res.json({ name: user.name, id: user.id, role: user.role });
});

// ---------------------------------------------------------------------------
// ASSIGNMENTS
// ---------------------------------------------------------------------------

// GET /api/assignments?role=teacher&teacherId=T1
// GET /api/assignments?role=student&studentId=S1
app.get('/api/assignments', (req, res) => {
  const { role, teacherId, studentId } = req.query;
  const db = readDb();

  if (role === 'teacher') {
    if (!teacherId) return res.status(400).json({ error: 'teacherId is required.' });
    const mine = db.assignments.filter(a => a.teacherId === teacherId);
    return res.json(mine);
  }

  if (role === 'student') {
    const today = new Date().toISOString().split('T')[0];
    const visible = db.assignments
      .filter(a => a.publish <= today)
      .map(a => {
        const { submissions, ...rest } = a;
        const mySubmission = studentId ? submissions[studentId] || null : null;
        return { ...rest, mySubmission };
      });
    return res.json(visible);
  }

  return res.status(400).json({ error: 'role must be "teacher" or "student".' });
});

// Create an assignment (teacher). multipart/form-data with optional "pdf" file.
app.post('/api/assignments', uploadPdf('pdf'), (req, res) => {
  const { subject, title, desc, publish, due, teacherId, teacherName } = req.body || {};
  if (!subject || !title || !publish || !due || !teacherId || !teacherName) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (due < publish) {
    return res.status(400).json({ error: 'Due date cannot be before publish date.' });
  }

  const db = readDb();
  const assignment = {
    id: Date.now(),
    subject, title, desc: desc || '', publish, due,
    teacherId, teacherName,
    pdf: publicFileInfo(req.file),
    submissions: {}
  };
  db.assignments.push(assignment);
  writeDb(db);

  res.status(201).json(assignment);
});

app.delete('/api/assignments/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const target = db.assignments.find(a => a.id === id);

  if (target) {
    // Clean up files on disk so uploads/ doesn't grow forever.
    [target.pdf, ...Object.values(target.submissions || {}).map(s => s.pdf)]
      .filter(Boolean)
      .forEach(f => {
        const p = path.join(UPLOAD_DIR, f.filename);
        fs.existsSync(p) && fs.unlinkSync(p);
      });
  }

  db.assignments = db.assignments.filter(a => a.id !== id);
  writeDb(db);
  res.json({ ok: true });
});

// Student submits/replaces their PDF for an assignment.
app.post('/api/assignments/:id/submit', uploadPdf('pdf'), (req, res) => {
  const id = Number(req.params.id);
  const { studentId, studentName } = req.body || {};
  if (!studentId || !studentName) return res.status(400).json({ error: 'Missing student info.' });
  if (!req.file) return res.status(400).json({ error: 'Please select a PDF to upload.' });

  const db = readDb();
  const assignment = db.assignments.find(a => a.id === id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  // Replace an existing submission's file on disk, if any.
  const previous = assignment.submissions[studentId];
  if (previous && previous.pdf) {
    const p = path.join(UPLOAD_DIR, previous.pdf.filename);
    fs.existsSync(p) && fs.unlinkSync(p);
  }

  const now = new Date();
  const submittedAt = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  assignment.submissions[studentId] = {
    studentId, studentName,
    pdf: publicFileInfo(req.file),
    submittedAt
  };
  writeDb(db);

  res.json(assignment.submissions[studentId]);
});

app.listen(PORT, () => {
  console.log(`EduSync backend running at http://localhost:${PORT}`);
});
