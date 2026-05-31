import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { post, get } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

/**
 * Floating chat bubble — opens a small panel with conversation history.
 * Hidden on auth pages.
 */
export default function ChatbotWidget() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    get('/chatbot/status').then((s) => {
      setAvailable(true);
      if (s.fallback_active) {
        setMessages([{ role: 'system', text: t('chatbot.faqMode', 'Quick-FAQ mode. For complex questions, contact support.') }]);
      }
    }).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages]);

  // Don't show on auth pages
  if (typeof window !== 'undefined' && /\/(login|register)$/.test(window.location.pathname)) return null;

  const send = async () => {
    if (!user) { window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
    const msg = text.trim();
    if (!msg) return;
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setText('');
    setSending(true);
    try {
      const r = await post('/chatbot/message', { message: msg });
      setMessages((m) => [...m, { role: 'bot', text: r.reply, source: r.source }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: '⚠️ ' + (e.message || 'Error'), source: 'error' }]);
    } finally { setSending(false); }
  };

  if (!available) return null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 ltr:right-4 rtl:left-4 z-[60] w-14 h-14 rounded-full bg-navy text-white shadow-lift flex items-center justify-center text-2xl hover:scale-105 transition"
        aria-label={t('chatbot.toggle', 'Toggle chat')}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 ltr:right-4 rtl:left-4 z-[60] w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lift border border-slate-200 flex flex-col"
             style={{ height: '440px' }}>
          <div className="px-4 py-3 border-b border-slate-100 bg-navy text-white rounded-t-2xl flex items-center justify-between">
            <div>
              <div className="font-bold flex items-center gap-1">🤖 {t('chatbot.title', 'LaborStay Assistant')}</div>
              <div className="text-[10px] opacity-80">{t('chatbot.replyTime', 'Replies in seconds')}</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xl">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8">
                👋 {t('chatbot.greet', 'Hi! Ask me about bookings, payments, or rooms.')}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                  m.role === 'user'    ? 'bg-navy text-white rounded-br-sm'
                  : m.role === 'system' ? 'bg-amber-100 text-amber-800 text-xs italic'
                                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                }`}>
                  {m.text}
                  {m.source && m.source !== 'openai' && m.role === 'bot' && (
                    <div className="text-[9px] opacity-60 mt-1">via {m.source}</div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="text-xs text-slate-400 italic">...</div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-slate-100 p-2 flex gap-1">
            <input value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t('chatbot.placeholder', 'Type a message…')}
              disabled={sending}
              className="input !py-2 !text-sm flex-1" />
            <button type="submit" disabled={sending || !text.trim()}
              className="btn-primary !px-3 !py-2">→</button>
          </form>
        </div>
      )}
    </>
  );
}
