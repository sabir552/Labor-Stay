import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Floating bar at the bottom showing currently-selected camps for compare.
 * Persists selection in localStorage. Shows when 1-3 camps selected.
 *
 * Other components dispatch:
 *   window.dispatchEvent(new CustomEvent('laborstay:compare:add',    { detail: {id, name} }))
 *   window.dispatchEvent(new CustomEvent('laborstay:compare:remove', { detail: {id} }))
 */
const KEY = 'laborstay_compare';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 3))); } catch {}
}

export default function CompareBar() {
  const { t } = useTranslation();
  const [list, setList] = useState(load());
  const nav = useNavigate();

  useEffect(() => {
    const onAdd = (e) => {
      const d = e.detail || {};
      if (!d.id) return;
      const cur = load();
      if (cur.find((x) => x.id === d.id)) return;
      if (cur.length >= 3) {
        alert(t('compare.maxReached', 'Max 3 camps. Remove one first.'));
        return;
      }
      const next = [...cur, d];
      save(next); setList(next);
    };
    const onRemove = (e) => {
      const id = e.detail?.id;
      const next = load().filter((x) => x.id !== id);
      save(next); setList(next);
    };
    const onStorage = () => setList(load());
    window.addEventListener('laborstay:compare:add', onAdd);
    window.addEventListener('laborstay:compare:remove', onRemove);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('laborstay:compare:add', onAdd);
      window.removeEventListener('laborstay:compare:remove', onRemove);
      window.removeEventListener('storage', onStorage);
    };
  }, [t]);

  if (list.length === 0) return null;

  const remove = (id) => {
    const next = list.filter((x) => x.id !== id);
    save(next); setList(next);
  };
  const clear = () => { save([]); setList([]); };
  const go = () => {
    if (list.length < 1) return;
    nav(`/compare?ids=${list.map((x) => x.id).join(',')}`);
  };

  // Sit above the chatbot bubble (which is bottom-4 right-4)
  return (
    <div className="fixed bottom-4 ltr:left-4 rtl:right-4 z-[55] bg-white border border-slate-200 rounded-xl shadow-lift p-3 flex items-center gap-3 max-w-md">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          {t('compare.compareBar', 'Compare')} ({list.length}/3)
        </div>
        <div className="flex gap-1 mt-1 flex-wrap">
          {list.map((c) => (
            <button key={c.id} onClick={() => remove(c.id)}
              className="chip hover:bg-rose-100 transition group" title="Remove">
              <span className="line-clamp-1 max-w-[120px]">{c.name}</span>
              <span className="ms-1 opacity-50 group-hover:opacity-100 group-hover:text-rose-600">✕</span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={clear} className="text-xs text-slate-400 hover:text-rose-600 px-2">
        {t('common.clear', 'Clear')}
      </button>
      <button onClick={go} disabled={list.length < 1} className="btn-gold btn-sm">
        ⚖ {t('compare.compareBtn', 'Compare')}
      </button>
    </div>
  );
}
