import React from 'react';

// Generic legal page (Terms / Privacy).
export default function Legal({ title, sections = [] }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-navy mb-6">{title}</h1>
      <div className="prose prose-slate max-w-none">
        {sections.map((s, i) => (
          <div key={i} className="mb-6">
            <h2 className="text-xl font-semibold text-navy mb-2">{s.title}</h2>
            <p className="text-slate-600 leading-relaxed whitespace-pre-line">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-10">Last updated: {new Date().toLocaleDateString('en-GB')}</p>
    </div>
  );
}

export const TermsSections = [
  { title: '1. Acceptance', body: 'By accessing or using LaborStay you agree to these Terms of Service. If you do not agree, please do not use the platform.' },
  { title: '2. Eligibility', body: 'Workers must hold a valid Saudi Iqama. Camp owners must hold a valid commercial registration (CR) and Ministry of HR licence for accommodation.' },
  { title: '3. Booking & payment', body: 'All bookings are subject to room availability. Payment is processed securely via Tap Payments. All prices include 15% VAT in accordance with ZATCA. A 10% platform commission applies to camp owners and service providers.' },
  { title: '4. Cancellation', body: 'Bookings may be cancelled up to 48 hours before check-in for a full refund. Pending bookings that are not paid within 24 hours are auto-cancelled.' },
  { title: '5. Conduct', body: 'Workers must abide by camp rules and Saudi labour regulations. Camp owners must maintain hygiene, safety and capacity standards per Ministry of HR.' },
  { title: '6. Disputes', body: 'Disputes should be raised via the in-platform dispute system. LaborStay mediates in good faith but is not a party to the underlying accommodation contract.' },
  { title: '7. Liability', body: 'LaborStay is a marketplace and is not responsible for the conduct of users or quality of off-platform interactions. Maximum liability is capped at the amount paid for the disputed booking.' },
];

export const PrivacySections = [
  { title: '1. PDPL compliance', body: 'LaborStay complies with the Personal Data Protection Law (PDPL) of the Kingdom of Saudi Arabia. We collect only the personal data necessary to provide our services.' },
  { title: '2. Data we collect', body: 'Account info (name, email, phone, role), worker info (nationality, Iqama number & expiry, Iqama photo for verification), owner info (company name, CR, VAT), and transactional data (bookings, payments, messages).' },
  { title: '3. How we use data', body: 'To create your account, verify identity, process bookings & payments, issue ZATCA-compliant invoices, send notifications, prevent fraud, and comply with legal obligations.' },
  { title: '4. Sharing', body: 'We share data with camp owners (booking details) and payment processors (Tap Payments). We never sell personal data to third parties.' },
  { title: '5. Your rights', body: 'You may request access, rectification, or deletion of your personal data at any time by emailing privacy@laborstay.sa.' },
  { title: '6. Retention', body: 'Account data is kept while your account is active and for 5 years after closure for tax/ZATCA records.' },
  { title: '7. Security', body: 'Passwords are hashed with bcrypt. JWT tokens are signed and short-lived. Iqama photos and documents are stored in private, access-controlled storage.' },
];
