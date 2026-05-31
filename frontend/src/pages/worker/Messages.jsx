import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, initials } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function Messages() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  // base = '/worker' or '/owner' or '/admin' — derived from current path
  const base = (loc.pathname.match(/^\/(?:worker|owner|admin|provider)/) || ['/worker'])[0];

  const [conversations, setConversations] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConvos = () => get('/messages/conversations').then((r) => setConversations(r.conversations || []));
  useEffect(() => { loadConvos(); }, []);

  useEffect(() => {
    if (!conversationId) { setThread(null); return; }
    get(`/messages/${conversationId}`).then((r) => {
      setThread(r.messages || []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }).catch(() => setThread([]));
    put(`/messages/${conversationId}/read`, {}).then(() => loadConvos()).catch(() => {});
  }, [conversationId]);

  const counterpart = conversations?.find((c) => c.conversation_id === conversationId)?.counterpart;

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !counterpart) return;
    setSending(true);
    try {
      await post('/messages', { receiver_id: counterpart.id, content: text });
      setText('');
      // reload thread
      const r = await get(`/messages/${conversationId}`);
      setThread(r.messages || []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      loadConvos();
    } finally { setSending(false); }
  };

  return (
    <div className="card overflow-hidden h-[calc(100vh-180px)] flex">
      {/* Conversation list */}
      <aside className={`${conversationId ? 'hidden md:block' : ''} w-full md:w-72 border-e border-slate-100 overflow-y-auto`}>
        <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-navy">{t('nav.messages')}</h2>
        </div>
        {conversations === null && <div className="p-4 text-sm text-slate-500">{t('common.loading')}</div>}
        {conversations && conversations.length === 0 && (
          <EmptyState icon="💬" title="No messages yet" body="Start a conversation with a camp owner from the camp page." />
        )}
        {conversations && conversations.map((c) => (
          <button
            key={c.conversation_id}
            onClick={() => nav(`${base}/messages/${c.conversation_id}`)}
            className={`w-full text-start px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition flex gap-3 ${conversationId === c.conversation_id ? 'bg-navy-50' : ''}`}
          >
            <div className="w-10 h-10 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials(c.counterpart?.full_name || '?')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="font-medium text-sm text-navy truncate">{c.counterpart?.full_name || 'Unknown'}</div>
                {c.unread_count > 0 && (
                  <span className="bg-gold text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{c.unread_count}</span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">{c.last_message?.content}</div>
            </div>
          </button>
        ))}
      </aside>

      {/* Thread */}
      <section className={`flex-1 flex flex-col ${conversationId ? '' : 'hidden md:flex'}`}>
        {!conversationId && (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a conversation to start chatting
          </div>
        )}
        {conversationId && (
          <>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <button onClick={() => nav(`${base}/messages`)} className="md:hidden text-slate-500">←</button>
              <div className="w-9 h-9 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">
                {initials(counterpart?.full_name || '?')}
              </div>
              <div>
                <div className="font-semibold text-navy text-sm">{counterpart?.full_name || 'Conversation'}</div>
                <div className="text-[10px] text-slate-400 uppercase">{counterpart?.role}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
              {thread === null && <div className="text-center text-sm text-slate-400">{t('common.loading')}</div>}
              {thread && thread.length === 0 && <div className="text-center text-sm text-slate-400 pt-10">No messages yet — say hello!</div>}
              {thread && thread.map((m) => {
                const mine = m.sender_id === user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-navy text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm'}`}>
                      <div>{m.content}</div>
                      <div className={`text-[10px] mt-1 ${mine ? 'text-navy-100' : 'text-slate-400'}`}>{formatDateTime(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t border-slate-100 p-3 flex gap-2">
              <input
                value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…" className="input flex-1"
              />
              <button type="submit" disabled={sending || !text.trim()} className="btn-primary">Send</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
