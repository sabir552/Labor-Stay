import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, initials } from '../../utils/formatters';
import { debounce } from '../../utils/helpers';

const ROLES = ['all', 'worker', 'owner', 'provider', 'admin'];

export default function Users() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'all';
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');

  const load = () => {
    const qp = {};
    if (role !== 'all') qp.role = role;
    if (q) qp.q = q;
    get('/admin/users', qp).then((r) => setUsers(r.users || [])).catch(() => setUsers([]));
  };

  useEffect(load, [role, q]);

  const setRole = (r) => {
    const next = new URLSearchParams(params);
    if (r === 'all') next.delete('role'); else next.set('role', r);
    setParams(next, { replace: true });
  };

  const debouncedSearch = React.useMemo(() => debounce((v) => {
    const next = new URLSearchParams(params);
    if (v) next.set('q', v); else next.delete('q');
    setParams(next, { replace: true });
  }, 300), [params]);

  const verify = async (id) => {
    try { await put(`/admin/users/${id}/verify`); toast.success('Verified ✓'); load(); }
    catch (e) { toast.error(e.message); }
  };
  const toggle = async (id) => {
    try { const r = await put(`/admin/users/${id}/toggle-active`); toast.success(r.is_active ? 'Activated' : 'Deactivated'); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('admin.users')} subtitle={users ? `${users.length} users` : ''} />

      <div className="flex flex-wrap items-center gap-2">
        {ROLES.map((r) => (
          <button key={r} onClick={() => setRole(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition ${role === r ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
            {r === 'all' ? t('common.all') : r}
          </button>
        ))}
        <input
          type="search" defaultValue={q}
          onChange={(e) => { setQ(e.target.value); debouncedSearch(e.target.value); }}
          placeholder="🔍 Search name or email…"
          className="input !py-2 max-w-xs ms-auto"
        />
      </div>

      {users === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {users && users.length === 0 && <div className="card p-8 text-center text-slate-500">No users match.</div>}

      {users && users.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-start px-4 py-3">User</th>
                <th className="text-start px-4 py-3">Role</th>
                <th className="text-start px-4 py-3">Joined</th>
                <th className="text-start px-4 py-3">Status</th>
                <th className="text-end px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">{initials(u.full_name)}</div>
                      <div className="min-w-0">
                        <div className="font-medium text-navy truncate">{u.full_name}</div>
                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700 capitalize">{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {u.is_active
                        ? <span className="badge bg-emerald-100 text-emerald-800">Active</span>
                        : <span className="badge bg-rose-100 text-rose-700">Disabled</span>}
                      {u.is_verified
                        ? <span className="badge bg-blue-100 text-blue-800">✓ Verified</span>
                        : <span className="badge bg-amber-100 text-amber-800">Unverified</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    {!u.is_verified && (
                      <button onClick={() => verify(u.id)} className="btn-outline btn-sm me-1">Verify</button>
                    )}
                    <button onClick={() => toggle(u.id)} className={`btn-sm me-1 ${u.is_active ? 'btn-ghost text-rose-600 hover:bg-rose-50' : 'btn-primary'}`}>
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
