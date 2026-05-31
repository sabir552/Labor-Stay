/**
 * QR code generator — returns a data URL (PNG base64) suitable for
 * embedding in PDFs or sending to the frontend.
 */
const QRCode = require('qrcode');

async function generateQR(text, opts = {}) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opts.width || 300,
    color: { dark: '#1A3C5E', light: '#FFFFFF' },
    ...opts,
  });
}

async function generateQRBuffer(text, opts = {}) {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opts.width || 300,
    ...opts,
  });
}

module.exports = { generateQR, generateQRBuffer };
