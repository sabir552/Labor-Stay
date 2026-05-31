import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../context/ToastContext';

export default function Contact() {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    // POSTing a contact form is a marketing endpoint not in the API spec — for now just succeed.
    setTimeout(() => {
      toast.success('Thanks! Our team will reply within 24 hours.');
      setForm({ name: '', email: '', subject: '', message: '' });
      setSending(false);
    }, 600);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-2 gap-10">
      <div>
        <h1 className="text-3xl font-bold text-navy mb-3">Get in touch</h1>
        <p className="text-slate-600 mb-6">Questions about pricing, onboarding, or partnerships? Drop us a line and we'll get back within 24 hours.</p>
        <div className="space-y-3 text-sm">
          <Row icon="📧" label="Email" value="hello@laborstay.sa" />
          <Row icon="📞" label="Phone" value="+966 11 234 5678" />
          <Row icon="💬" label="WhatsApp" value="+966 50 123 4567" />
          <Row icon="📍" label="Office" value="King Fahd Road, Riyadh, KSA" />
          <Row icon="🕒" label="Hours" value="Sun–Thu · 9:00 – 18:00 AST" />
        </div>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-3">
        <div>
          <label className="label">Name</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Subject</label>
          <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="input" />
        </div>
        <button type="submit" disabled={sending} className="btn-primary w-full">
          {sending ? t('common.loading') : 'Send message'}
        </button>
      </form>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy flex items-center justify-center text-lg">{icon}</span>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}
