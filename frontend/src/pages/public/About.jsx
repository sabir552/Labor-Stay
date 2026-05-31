import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function About() {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
      <h1 className="text-3xl lg:text-4xl font-bold text-navy mb-3">About LaborStay</h1>
      <p className="text-slate-600 text-lg leading-relaxed mb-8">
        LaborStay is Saudi Arabia's first end-to-end marketplace built for the workforce-housing ecosystem.
        We connect <b>workers</b> with quality labour camps, help <b>camp owners</b> fill their rooms, and let
        <b> contractors</b> rent equipment or book essential services — all in one place, in three languages, fully ZATCA-compliant.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        {[
          { n: '10+', l: 'Cities covered' },
          { n: '50+', l: 'Active camps' },
          { n: '2k+', l: 'Rooms available' },
        ].map((s) => (
          <div key={s.l} className="card p-5 text-center">
            <div className="text-3xl font-extrabold text-gold">{s.n}</div>
            <div className="text-sm text-slate-500 mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-navy mb-3">Our mission</h2>
      <p className="text-slate-600 leading-relaxed mb-8">
        Tens of thousands of workers across the Kingdom struggle to find dignified, affordable accommodation close
        to their job sites. Camp owners, on the other hand, lose revenue to empty beds because they lack a way to
        reach the right tenants. LaborStay bridges that gap with transparent listings, real-time availability,
        secure online payments, and digital check-in via QR.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <Pillar icon="🛏️" title="Quality housing">
          Every camp is verified — Ministry of HR licence, capacity, emergency contact, photos and amenities.
        </Pillar>
        <Pillar icon="🔒" title="Secure payments">
          Tap Payments integration with Mada, STC Pay, Visa & Mastercard. Auto-generated VAT invoices.
        </Pillar>
        <Pillar icon="🌍" title="Made for KSA">
          Arabic-first RTL UI, support for Urdu, 13 regions, prayer-time awareness, ZATCA & PDPL compliant.
        </Pillar>
      </div>

      <div className="bg-navy text-white rounded-2xl p-8 lg:p-10 text-center">
        <h3 className="text-2xl font-bold mb-2">Become a partner</h3>
        <p className="text-navy-100 max-w-md mx-auto mb-5">List your camp, equipment or services and tap into the largest workforce-housing network in the Kingdom.</p>
        <Link to="/register?role=owner" className="btn-gold px-6">Get started →</Link>
      </div>
    </div>
  );
}

function Pillar({ icon, title, children }) {
  return (
    <div className="card p-5">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-semibold text-navy mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}
