/**
 * Multer file upload middleware.
 * Stores files under /uploads/<subdir>/ with a UUID filename.
 * Restricts to images (jpg/png/webp) + PDF by default.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_PATH = path.resolve(process.env.UPLOAD_PATH || './uploads');
fs.mkdirSync(UPLOAD_PATH, { recursive: true });

function makeUploader(subdir = 'general', { allowPdf = false, maxSizeMB = 5 } = {}) {
  const dir = path.join(UPLOAD_PATH, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
    },
  });

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (allowPdf) allowed.add('application/pdf');

  return multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (allowed.has(file.mimetype)) cb(null, true);
      else cb(new Error(`Unsupported file type: ${file.mimetype}`));
    },
  });
}

function publicUrl(req, relativePath) {
  // returns a URL the frontend can hit
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${relativePath.replace(/^\/+/, '')}`;
}

module.exports = { makeUploader, publicUrl, UPLOAD_PATH };
