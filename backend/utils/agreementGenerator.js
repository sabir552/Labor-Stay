/**
 * Agreement signing PDF generator (A1).
 * Writes a signed rental agreement to /uploads/agreements/ and returns
 * { url, path, filename }. The booking row stores `agreement_url`.
 *
 * Inputs:
 *   { booking, camp, room, worker, owner, signature }
 *   signature = { typed_name, signed_at, ip, user_agent }
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatSAR } = require('./vatCalculator');

const NAVY = '#1A3C5E';
const GOLD = '#E8A020';
const GREY = '#6B7280';

const UPLOAD_PATH = path.resolve(process.env.UPLOAD_PATH || './uploads');
const AGREEMENT_DIR = path.join(UPLOAD_PATH, 'agreements');
fs.mkdirSync(AGREEMENT_DIR, { recursive: true });

function hr(doc, y, color = '#E5E7EB') {
  doc.moveTo(50, y).lineTo(550, y).strokeColor(color).stroke();
}

async function generateSignedAgreement({ booking, camp, room, worker, owner, signature }) {
  const filename = `agreement-${booking.booking_code}.pdf`;
  const filePath = path.join(AGREEMENT_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve({
      url: '/uploads/agreements/' + filename,
      path: filePath,
      filename,
    }));
    stream.on('error', reject);
    doc.pipe(stream);

    // ────── Header ──────
    doc.fillColor(NAVY).fontSize(24).text('LaborStay', 50, 50);
    doc.fillColor(GOLD).fontSize(10).text('Saudi Arabia • laborstay.sa', 50, 78);
    doc.fillColor(NAVY).fontSize(20).text('Accommodation Rental Agreement', 50, 105);
    doc.fillColor(GREY).fontSize(9)
      .text(`Reference: ${booking.booking_code}`, 50, 135)
      .text(`Issued: ${new Date().toLocaleDateString('en-GB')}`, 50, 148);
    hr(doc, 168);

    // ────── Parties ──────
    let y = 180;
    doc.fillColor(NAVY).fontSize(12).text('Parties', 50, y); y += 18;
    doc.fillColor('#111').fontSize(10);
    doc.text(`Provider:  ${owner?.company_name || owner?.full_name || '—'}`, 50, y); y += 14;
    doc.text(`           CR: ${owner?.cr_number || '—'} · VAT: ${owner?.vat_number || '—'}`, 50, y); y += 14;
    doc.text(`Occupant:  ${worker?.full_name || '—'}`, 50, y); y += 14;
    doc.text(`           Email: ${worker?.email || '—'}`, 50, y); y += 14;
    y += 6; hr(doc, y); y += 12;

    // ────── Premises ──────
    doc.fillColor(NAVY).fontSize(12).text('Premises', 50, y); y += 18;
    doc.fillColor('#111').fontSize(10)
      .text(`Camp:   ${camp?.name || '—'} (${camp?.camp_type || ''})`, 50, y); y += 14;
    doc.text(`Address: ${camp?.address || '—'}, ${camp?.city || ''}`, 50, y); y += 14;
    doc.text(`Room:   ${room?.name || '—'} (${room?.room_type || ''}) — capacity ${room?.capacity || 1}`, 50, y); y += 14;
    y += 6; hr(doc, y); y += 12;

    // ────── Term & Payment ──────
    doc.fillColor(NAVY).fontSize(12).text('Term & Payment', 50, y); y += 18;
    doc.fillColor('#111').fontSize(10)
      .text(`Check-in:  ${booking.start_date}`, 50, y)
      .text(`Check-out: ${booking.end_date}`, 300, y); y += 14;
    doc.text(`Occupants: ${booking.occupants}`, 50, y)
      .text(`Booking type: ${booking.booking_type}`, 300, y); y += 14;

    // Mini money table
    y += 8;
    doc.fontSize(10).fillColor(GREY);
    doc.text('Description', 50, y).text('Amount (SAR)', 450, y, { align: 'right', width: 100 });
    hr(doc, y + 14); y += 22;
    const row = (label, val, bold = false) => {
      doc.fillColor(bold ? NAVY : '#111').fontSize(bold ? 11 : 10);
      doc.text(label, 50, y).text(formatSAR(val), 450, y, { align: 'right', width: 100 });
      y += 16;
    };
    row('Accommodation (base)', booking.base_amount);
    row('VAT (15%)', booking.vat_amount);
    hr(doc, y + 2); y += 10;
    row('Total payable', booking.total_amount, true);
    y += 10; hr(doc, y); y += 12;

    // ────── Worker obligations ──────
    doc.fillColor(NAVY).fontSize(12).text('Occupant Obligations', 50, y); y += 18;
    doc.fillColor('#111').fontSize(9);
    const obligations = [
      'Pay the total amount above on or before the check-in date.',
      'Respect camp rules, prayer times, and Saudi labour regulations.',
      'Use the room and facilities responsibly and report damage immediately.',
      'No subletting or overnight visitors without prior owner approval.',
      'Vacate the room by the check-out date or arrange a written extension.',
    ];
    for (const o of obligations) { doc.text('• ' + o, 60, y, { width: 480 }); y += 14; }
    y += 4; hr(doc, y); y += 12;

    // ────── Cancellation policy ──────
    doc.fillColor(NAVY).fontSize(12).text('Cancellation Policy', 50, y); y += 18;
    doc.fillColor('#111').fontSize(9)
      .text('• Cancellations made >= 48 hours before check-in are fully refundable.', 60, y, { width: 480 }); y += 12;
    doc.text('• Cancellations made < 48 hours before check-in forfeit one night.', 60, y, { width: 480 }); y += 12;
    doc.text('• Bookings unpaid within 24 hours of creation are auto-cancelled.', 60, y, { width: 480 }); y += 12;
    y += 4; hr(doc, y); y += 12;

    // ────── Camp rules ──────
    if (camp?.rules) {
      doc.fillColor(NAVY).fontSize(12).text('Camp Rules', 50, y); y += 18;
      doc.fillColor('#111').fontSize(9).text(camp.rules, 60, y, { width: 480 });
      y = doc.y + 12;
      hr(doc, y); y += 12;
    }

    // ────── Signature ──────
    if (y > 660) { doc.addPage(); y = 60; }
    doc.fillColor(NAVY).fontSize(12).text('Digital Signature', 50, y); y += 20;
    doc.fillColor('#111').fontSize(10);
    doc.text(`Signed by (typed): `, 50, y);
    doc.fillColor(NAVY).fontSize(14).text(signature?.typed_name || '—', 170, y - 2);
    y += 22;
    doc.fillColor('#111').fontSize(9)
      .text(`Signed at: ${signature?.signed_at || new Date().toISOString()}`, 50, y); y += 12;
    doc.text(`IP address: ${signature?.ip || '—'}`, 50, y); y += 12;
    doc.text(`User agent: ${(signature?.user_agent || '—').slice(0, 90)}`, 50, y); y += 16;
    doc.fillColor(GREY).fontSize(8)
      .text('By typing your full legal name above and clicking "Sign agreement", you ' +
            'electronically accept this rental agreement in accordance with Saudi e-Transactions Law.',
            50, y, { width: 500, align: 'justify' });

    // ────── Footer ──────
    doc.fillColor(GREY).fontSize(8)
      .text(`LaborStay platform commission: 10% of base. VAT 15% collected on behalf of ZATCA. ` +
            `Booking ${booking.booking_code} · generated ${new Date().toISOString()}.`,
            50, 760, { align: 'center', width: 500 });

    doc.end();
  });
}

module.exports = { generateSignedAgreement, AGREEMENT_DIR };
