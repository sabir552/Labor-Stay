/**
 * Chatbot utilities (D5).
 *
 * Two parts:
 *   1. WhatsApp via Twilio — webhook receiver + outbound message helper
 *   2. AI support via OpenAI — chat completion endpoint
 *
 * Both have graceful no-op fallbacks when credentials are missing
 * (rule M5 + M17 — works independently, never crashes).
 */
const db = require('../config/database');

const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM   = process.env.TWILIO_WHATSAPP_FROM || '';
const OPENAI_KEY    = process.env.OPENAI_API_KEY || '';

const twilioReady = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
const openaiReady = !!OPENAI_KEY;

// ────────── WHATSAPP ──────────

/**
 * Send a WhatsApp message via Twilio REST API.
 * Falls back to console log when not configured.
 * Returns { ok, sid?, error? }
 */
async function sendWhatsApp(toNumber, body) {
  if (!twilioReady) {
    console.log(`[whatsapp:dev] → ${toNumber}: ${body.slice(0, 100)}`);
    return { ok: true, dev: true };
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const form = new URLSearchParams({
      From: TWILIO_FROM,
      To: toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`,
      Body: body,
    });
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.message || `HTTP ${res.status}` };
    return { ok: true, sid: data.sid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ────────── INTENT PARSER (rule-based, no LLM needed) ──────────
function parseIntent(text) {
  const lower = (text || '').toLowerCase().trim();
  if (!lower) return { intent: 'help' };
  if (/^(help|menu|hi|hello|salam|مرحبا|السلام|hey)\b/.test(lower)) return { intent: 'help' };
  if (/check.*booking|my booking|booking status/.test(lower)) return { intent: 'check_booking' };
  if (/^cancel\s+booking\s*#?(\d+)/i.test(text)) {
    const id = parseInt(text.match(/^cancel\s+booking\s*#?(\d+)/i)[1], 10);
    return { intent: 'cancel_booking', booking_id: id };
  }
  if (/available rooms? in (\w[\w\s]*)/i.test(text)) {
    const city = text.match(/available rooms? in (\w[\w\s]*)/i)[1].trim();
    return { intent: 'available_rooms', city };
  }
  if (/talk to (support|human|agent)/.test(lower)) return { intent: 'human' };
  return { intent: 'fallback' };
}

// ────────── INTENT HANDLERS ──────────
async function handleIntent(intent, fromPhone) {
  // Identify the user by their phone (best-effort)
  let user = null;
  try {
    const { rows } = await db.query('SELECT id, full_name, role FROM users WHERE phone=$1 OR phone=$2 LIMIT 1',
      [fromPhone, fromPhone.replace(/^whatsapp:/, '')]);
    user = rows[0] || null;
  } catch (e) {}

  switch (intent.intent) {
    case 'help':
      return `🏕️ *LaborStay Bot*\n\nReply with:\n` +
             `• "check my booking" — booking status\n` +
             `• "cancel booking #123" — cancel a booking\n` +
             `• "available rooms in Riyadh" — search\n` +
             `• "talk to support" — escalate to human\n` +
             `\nDownload our app: ${process.env.FRONTEND_URL || 'https://laborstay.sa'}`;

    case 'check_booking': {
      if (!user) return `Please link your phone in your account first by signing in.`;
      const { rows } = await db.query(
        `SELECT b.booking_code, b.status, b.start_date, b.end_date, c.name AS camp_name
         FROM bookings b JOIN camps c ON c.id=b.camp_id
         WHERE b.worker_id=$1 ORDER BY b.created_at DESC LIMIT 3`, [user.id]
      );
      if (!rows.length) return `No bookings on file for you.`;
      return `Your latest bookings:\n\n` + rows.map((b) =>
        `📌 *${b.booking_code}* — ${b.camp_name}\n   ${b.start_date} → ${b.end_date}\n   Status: ${b.status}`
      ).join('\n\n');
    }

    case 'cancel_booking': {
      if (!user) return `Please sign in to cancel a booking.`;
      const { rows } = await db.query('SELECT * FROM bookings WHERE id=$1 AND worker_id=$2', [intent.booking_id, user.id]);
      if (!rows[0]) return `Booking #${intent.booking_id} not found in your account.`;
      if (!['pending', 'confirmed'].includes(rows[0].status))
        return `Cannot cancel a booking in status: ${rows[0].status}`;
      await db.query(`UPDATE bookings SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [intent.booking_id]);
      await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id=$2',
        [rows[0].occupants || 1, rows[0].room_id]);
      return `✅ Booking #${intent.booking_id} (${rows[0].booking_code}) cancelled.`;
    }

    case 'available_rooms': {
      const { rows } = await db.query(
        `SELECT c.name, c.city, r.name AS room_name, r.price_per_day, r.available_beds
         FROM camps c JOIN rooms r ON r.camp_id=c.id
         WHERE c.status='approved' AND r.is_active=1 AND r.available_beds > 0
           AND LOWER(c.city) = LOWER($1)
         ORDER BY r.price_per_day ASC LIMIT 3`, [intent.city]
      );
      if (!rows.length) return `No available rooms in ${intent.city} right now. Try our search at ${process.env.FRONTEND_URL || 'laborstay.sa'}/search`;
      return `🏕️ *Top 3 rooms in ${intent.city}:*\n\n` + rows.map((r, i) =>
        `${i + 1}. ${r.name} — ${r.room_name}\n   SAR ${r.price_per_day}/day · ${r.available_beds} bed(s) free`
      ).join('\n\n');
    }

    case 'human':
      return `🙋 A support agent will get back to you within 1 business hour.\nIn the meantime visit: ${process.env.FRONTEND_URL || 'https://laborstay.sa'}/contact`;

    default:
      return `🤔 I didn't catch that. Reply *help* to see what I can do.`;
  }
}

// ────────── AI (OpenAI) ──────────
async function aiChat(message, language = 'en') {
  if (!openaiReady) {
    // Fallback: simple FAQ matcher
    const faq = [
      { match: /(book|reserve|reservation)/i, en: 'To book a camp: search → pick a room → confirm dates → pay. We accept Mada, STC Pay, Visa.', ar: 'للحجز: ابحث، اختر غرفة، أكد التواريخ، ثم ادفع. نقبل مدى وSTC Pay وVisa.', ur: 'بکنگ کے لیے: تلاش کریں، کمرہ منتخب کریں، تاریخیں تصدیق کریں، ادائیگی کریں۔' },
      { match: /(refund|cancel)/i, en: 'Cancellations 48h+ before check-in are fully refundable. Within 48h, one night is forfeited.', ar: 'الإلغاءات قبل 48 ساعة من الوصول قابلة للاسترداد كاملاً.', ur: 'چیک ان سے 48 گھنٹے پہلے منسوخی پر مکمل رقم واپس۔' },
      { match: /(vat|tax|invoice)/i, en: 'All prices include 15% VAT. ZATCA-compliant invoices download from your dashboard.', ar: 'الأسعار تشمل 15% ضريبة. الفواتير متوافقة مع هيئة الزكاة.', ur: 'تمام قیمتیں 15% VAT شامل ہیں۔ ZATCA کے مطابق انوائسز۔' },
      { match: /(iqama|expir)/i, en: 'Upload your Iqama in Profile → admin verifies in 24h. We alert you 60/30/7 days before expiry.', ar: 'حمل إقامتك في الملف الشخصي. ننبهك قبل 60/30/7 يوم من الانتهاء.', ur: 'پروفائل میں اقامہ اپلوڈ کریں۔ ختم ہونے سے 60/30/7 دن پہلے الرٹ۔' },
    ];
    const hit = faq.find((f) => f.match.test(message));
    if (hit) return { reply: hit[language] || hit.en, source: 'faq' };
    return {
      reply: language === 'ar'
        ? 'لست متأكدًا من إجابة هذا. تواصل مع الدعم.'
        : language === 'ur'
        ? 'مجھے یقین نہیں۔ سپورٹ سے رابطہ کریں۔'
        : "I'm not sure about that. Please contact support — they'll respond within 1 hour.",
      source: 'fallback',
    };
  }
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    const langName = language === 'ar' ? 'Arabic' : language === 'ur' ? 'Urdu' : 'English';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are LaborStay support assistant for Saudi Arabia labour camp bookings. Reply in ${langName}, in 2-3 short sentences. Mention VAT 15%, ZATCA, Iqama where relevant. Refuse non-platform topics politely.` },
          { role: 'user', content: message },
        ],
        max_tokens: 250, temperature: 0.4,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { reply: 'Sorry, support is busy. Try later.', source: 'error', error: data.error?.message };
    return { reply: data.choices?.[0]?.message?.content || '...', source: 'openai' };
  } catch (e) {
    return { reply: "I'm having trouble connecting right now.", source: 'error', error: e.message };
  }
}

module.exports = {
  sendWhatsApp, parseIntent, handleIntent, aiChat,
  twilioReady, openaiReady,
};
