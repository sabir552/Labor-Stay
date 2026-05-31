import React from 'react';
import { Link } from 'react-router-dom';

const steps = [
  { icon: '🔍', title: 'Search Camps', desc: 'Filter by city, price, room type, amenities, and nationality preference.' },
  { icon: '🏕️', title: 'View & Compare', desc: 'Browse photos, virtual tours, Google Maps location, and worker reviews.' },
  { icon: '📅', title: 'Book Instantly', desc: 'Select your dates, choose a room or bed space, and confirm your booking online.' },
  { icon: '✍️', title: 'Sign Agreement', desc: 'Digitally sign your rental agreement — legally binding and stored securely.' },
  { icon: '💳', title: 'Pay Securely', desc: 'Pay via Mada, STC Pay, Visa, Mastercard, or SADAD. ZATCA-compliant VAT invoice issued.' },
  { icon: '🚪', title: 'Check In', desc: 'Use your booking QR code to check in at the camp gate — fast and paperless.' },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#0B2545] text-white py-20 text-center">
        <h1 className="text-4xl font-bold mb-4">How LaborStay Works</h1>
        <p className="text-lg text-gray-300 max-w-xl mx-auto">Book your camp accommodation in Saudi Arabia in minutes — online, secure, and simple.</p>
      </div>
      <div className="max-w-4xl mx-auto py-16 px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4 p-6 bg-[#F0F4FA] rounded-xl border">
              <div className="text-4xl">{step.icon}</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 bg-[#D4920A] text-white rounded-full text-xs font-bold flex items-center justify-center">{i+1}</span>
                  <h3 className="font-bold text-[#0B2545]">{step.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/search" className="inline-block bg-[#0B2545] text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#1a3a6b] transition-colors">
            Find a Camp Now
          </Link>
        </div>
      </div>
    </div>
  );
}
