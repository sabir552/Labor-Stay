/**
 * PDF generator using pdfkit.
 * Produces ZATCA-style tax invoices and booking contracts.
 * Streams PDFs directly to an Express response.
 */
const PDFDocument = require('pdfkit');
const { formatSAR } = require('./vatCalculator');
const { generateQRBuffer } = require('./qrGenerator');

const NAVY = '#1A3C5E';
const GOLD = '#E8A020';
const GREY = '#6B7280';

function hr(doc, y) {
  doc.moveTo(50, y).lineTo(550, y).strokeColor('#E5E7EB').stroke();
}

async function streamBookingReceipt(res, { booking, camp, room, worker, owner, payment }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${booking.booking_code}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fillColor(NAVY).fontSize(24).text('LaborStay', 50, 50);
  doc.fillColor(GOLD).fontSize(10).text('Saudi Arabia • laborstay.sa', 50, 78);

  doc.fillColor(NAVY).fontSize(18).text('Tax Invoice / Receipt', 350, 50, { align: 'right' });
  doc.fillColor(GREY).fontSize(9)
    .text(`Invoice #: ${payment?.invoice_number || booking.booking_code}`, 350, 75, { align: 'right' })
    .text(`Date: ${new Date(booking.created_at || Date.now()).toLocaleDateString('en-GB')}`, 350, 88, { align: 'right' })
    .text(`Booking: ${booking.booking_code}`, 350, 101, { align: 'right' });

  hr(doc, 130);

  // Parties
  doc.fillColor(NAVY).fontSize(11).text('Bill To', 50, 145);
  doc.fillColor('#111').fontSize(10)
    .text(worker?.full_name || '—', 50, 162)
    .text(worker?.email || '', 50, 176)
    .text(worker?.phone || '', 50, 190);

  doc.fillColor(NAVY).fontSize(11).text('Service Provider', 300, 145);
  doc.fillColor('#111').fontSize(10)
    .text(owner?.company_name || owner?.full_name || '—', 300, 162)
    .text(`CR: ${owner?.cr_number || '—'}`, 300, 176)
    .text(`VAT: ${owner?.vat_number || '—'}`, 300, 190);

  hr(doc, 215);

  // Stay details
  doc.fillColor(NAVY).fontSize(12).text('Stay Details', 50, 230);
  doc.fillColor('#111').fontSize(10)
    .text(`Camp: ${camp?.name || '—'}`, 50, 250)
    .text(`Room: ${room?.name || '—'} (${room?.room_type || ''})`, 50, 264)
    .text(`City: ${camp?.city || '—'}`, 50, 278)
    .text(`Check-in:  ${booking.start_date}`, 50, 292)
    .text(`Check-out: ${booking.end_date}`, 50, 306)
    .text(`Occupants: ${booking.occupants || 1}`, 50, 320);

  // Amount table
  hr(doc, 345);
  const tableTop = 360;
  doc.fillColor(NAVY).fontSize(11)
    .text('Description', 50, tableTop)
    .text('Amount (SAR)', 450, tableTop, { align: 'right', width: 100 });
  hr(doc, tableTop + 18);

  let y = tableTop + 30;
  const row = (label, value, bold = false) => {
    if (bold) doc.fillColor(NAVY).fontSize(11);
    else doc.fillColor('#111').fontSize(10);
    doc.text(label, 50, y).text(formatSAR(value), 450, y, { align: 'right', width: 100 });
    y += 18;
  };
  row('Accommodation (base)', booking.base_amount);
  row('VAT (15%)', booking.vat_amount);
  hr(doc, y + 2); y += 12;
  row('Total Paid', booking.total_amount, true);

  // QR code
  try {
    const qr = await generateQRBuffer(
      JSON.stringify({ code: booking.booking_code, room: room?.id, worker: worker?.id })
    );
    doc.image(qr, 450, 470, { width: 100 });
    doc.fillColor(GREY).fontSize(8).text('Scan at check-in', 450, 575, { width: 100, align: 'center' });
  } catch { /* ignore */ }

  // Footer
  doc.fillColor(GREY).fontSize(8)
    .text('This is a system-generated ZATCA-compliant tax invoice.', 50, 720, { align: 'center', width: 500 })
    .text('LaborStay platform — 10% commission applies to providers. VAT collected on behalf of the General Authority of Zakat & Tax.',
          50, 735, { align: 'center', width: 500 });

  doc.end();
}

async function streamBookingContract(res, { booking, camp, room, worker, owner }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contract-${booking.booking_code}.pdf"`);
  doc.pipe(res);

  doc.fillColor(NAVY).fontSize(22).text('Accommodation Agreement', { align: 'center' });
  doc.moveDown();
  doc.fillColor(GREY).fontSize(10)
    .text(`Contract reference: ${booking.booking_code}`, { align: 'center' })
    .text(`Issued: ${new Date().toLocaleDateString('en-GB')}`, { align: 'center' });
  doc.moveDown(2);

  doc.fillColor('#111').fontSize(11)
    .text(`This agreement is made between ${owner?.company_name || owner?.full_name || 'the Owner'} ("Provider") `
      + `and ${worker?.full_name || 'the Worker'} ("Occupant") for the accommodation described below.`, { align: 'justify' });
  doc.moveDown();

  doc.fontSize(12).fillColor(NAVY).text('Accommodation');
  doc.fontSize(10).fillColor('#111')
    .text(`Camp: ${camp?.name}, ${camp?.city}`)
    .text(`Room: ${room?.name} (${room?.room_type})`);
  doc.moveDown();

  doc.fontSize(12).fillColor(NAVY).text('Term');
  doc.fontSize(10).fillColor('#111')
    .text(`From ${booking.start_date} to ${booking.end_date}`)
    .text(`Occupants: ${booking.occupants}`);
  doc.moveDown();

  doc.fontSize(12).fillColor(NAVY).text('Payment');
  doc.fontSize(10).fillColor('#111')
    .text(`Base: ${formatSAR(booking.base_amount)}`)
    .text(`VAT (15%): ${formatSAR(booking.vat_amount)}`)
    .text(`Total: ${formatSAR(booking.total_amount)}`);
  doc.moveDown();

  doc.fontSize(12).fillColor(NAVY).text('Terms & Conditions');
  doc.fontSize(9).fillColor('#111').list([
    'The Occupant agrees to abide by camp rules and Saudi labour regulations.',
    'Cancellations must be made at least 48 hours before check-in for a refund.',
    'The Provider guarantees clean accommodation as per Ministry of HR standards.',
    'Disputes shall be handled via the LaborStay platform mediation system.',
    'All amounts include 15% VAT in accordance with ZATCA regulations.',
  ]);

  doc.moveDown(3);
  doc.fontSize(10).fillColor('#111')
    .text('______________________', 80, 700).text('Occupant', 110, 715)
    .text('______________________', 360, 700).text('Provider', 400, 715);

  doc.end();
}

module.exports = { streamBookingReceipt, streamBookingContract };
