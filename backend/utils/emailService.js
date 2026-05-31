/**
 * Email service. Uses Nodemailer if SMTP creds are configured;
 * otherwise falls back to a console transport (useful for dev).
 *
 * Also exposes an in-app notification helper for parity.
 */
const nodemailer = require('nodemailer');
const db = require('../config/database');

let transporter = null;
const FROM = process.env.FROM_EMAIL || 'noreply@laborstay.sa';

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      && process.env.SMTP_USER !== 'your_email@gmail.com') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    transporter = {
      sendMail: async (opts) => {
        console.log('[email:dev] →', opts.to, '|', opts.subject);
        return { messageId: 'dev-' + Date.now(), accepted: [opts.to] };
      },
    };
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  try {
    const t = getTransporter();
    return await t.sendMail({ from: FROM, to, subject, html, text: text || html?.replace(/<[^>]+>/g, '') });
  } catch (err) {
    console.warn('[email] send failed:', err.message);
    return { error: err.message };
  }
}

// Persisted in-app notification
async function notify(userId, { type, title, body, link }) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, type || 'info', title, body || '', link || '']
    );
  } catch (err) {
    console.warn('[notify] failed:', err.message);
  }
}

// Pre-built templates
const templates = {
  welcome: (name) => ({
    subject: 'Welcome to LaborStay 🏕️',
    html: `<h2>Ahlan ${name},</h2>
      <p>Your LaborStay account has been created. You can now search labour camps, book accommodation, rent equipment, and request services across Saudi Arabia.</p>
      <p style="color:#1A3C5E;font-weight:bold">— The LaborStay team</p>`,
  }),
  bookingConfirmed: (b) => ({
    subject: `Booking confirmed — ${b.booking_code}`,
    html: `<h3>Your booking is confirmed ✅</h3>
      <p><b>Reference:</b> ${b.booking_code}<br/>
         <b>Check-in:</b> ${b.start_date}<br/>
         <b>Check-out:</b> ${b.end_date}<br/>
         <b>Total:</b> SAR ${b.total_amount}</p>
      <p>Show the QR code in your dashboard at check-in.</p>`,
  }),
  bookingRejected: (b, reason) => ({
    subject: `Booking ${b.booking_code} was rejected`,
    html: `<p>Unfortunately your booking <b>${b.booking_code}</b> was rejected.</p>
           <p><b>Reason:</b> ${reason || '—'}</p>`,
  }),
  paymentReceived: (p) => ({
    subject: `Payment received — ${p.invoice_number}`,
    html: `<p>We received your payment of <b>SAR ${p.amount}</b>. Invoice ${p.invoice_number} is attached to your account.</p>`,
  }),
  iqamaExpiryAlert: (days) => ({
    subject: 'Iqama expiry reminder',
    html: `<p>Your Iqama will expire in <b>${days} days</b>. Please renew it to keep your bookings active.</p>`,
  }),
};

module.exports = { sendEmail, notify, templates };
