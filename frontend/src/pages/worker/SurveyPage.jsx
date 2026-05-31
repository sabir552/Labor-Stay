import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import EmptyState from '../../components/common/EmptyState';
import { formatDate } from '../../utils/formatters';

export default function SurveyPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [active, setActive] = useState(null);
  const [history, setHistory] = useState(null);
  const [respondingTo, setRespondingTo] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    const [a, h] = await Promise.all([
      get('/surveys/active'),
      get('/surveys/my-responses'),
    ]);
    setActive(a.surveys || []);
    setHistory(h.responses || []);
  };
  useEffect(() => { reload(); }, []);

  const startSurvey = (s) => {
    setRespondingTo(s);
    // Seed answers based on question type defaults
    const init = {};
    (s.questions || []).forEach((q) => {
      init[q.id] = q.type === 'rating' || q.type === 'nps' ? null
        : q.type === 'multi_choice' ? []
        : q.type === 'boolean' ? false
        : '';
    });
    setAnswers(init);
  };

  const submit = async () => {
    if (!respondingTo) return;
    // Required check
    for (const q of respondingTo.questions || []) {
      if (q.required) {
        const v = answers[q.id];
        const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) {
          toast.error(`${t('survey.required', 'Required')}: ${q.label}`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      await post(`/surveys/${respondingTo.id}/respond`, { answers });
      toast.success(t('survey.thanks', 'Thank you for your feedback!'));
      setRespondingTo(null);
      reload();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  if (active === null) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={t('survey.title', 'Surveys')}
        subtitle={t('survey.subtitle', 'Share your feedback — it helps us improve.')} />

      {/* Active surveys */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
          {t('survey.active', 'Active')}
        </h3>
        {active.length === 0 ? (
          <EmptyState icon="✅" title={t('survey.allDone', 'All caught up!')}
            body={t('survey.allDoneBody', 'No surveys waiting for your response.')} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {active.map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="font-semibold text-navy">{s.title}</div>
                    {s.camp_name && <div className="text-xs text-slate-500">{s.camp_name}</div>}
                  </div>
                </div>
                {s.description && <p className="text-sm text-slate-600 mt-2 line-clamp-2">{s.description}</p>}
                <div className="text-xs text-slate-500 mt-2">{(s.questions || []).length} {t('survey.questions', 'questions')}</div>
                <button onClick={() => startSurvey(s)} className="btn-gold btn-sm w-full mt-3">
                  {t('survey.startSurvey', 'Take the survey')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 mt-6">
          {t('survey.history', 'My past responses')}
        </h3>
        {history?.length === 0 ? (
          <div className="card p-4 text-sm text-slate-500 text-center">{t('common.noData')}</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {(history || []).map((r) => (
              <div key={r.id} className="p-3 flex items-center gap-3">
                <span className="text-xl">📋</span>
                <div className="flex-1">
                  <div className="font-medium text-navy">{r.survey_title}</div>
                  <div className="text-xs text-slate-500">{r.camp_name || '—'} · {formatDate(r.created_at)}</div>
                </div>
                {r.nps_score != null && (
                  <span className={`badge ${r.nps_score >= 9 ? 'bg-emerald-100 text-emerald-800' : r.nps_score >= 7 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-700'}`}>
                    NPS {r.nps_score}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Survey response modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={() => setRespondingTo(null)}>
          <div className="bg-white rounded-2xl shadow-lift w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-navy text-lg">{respondingTo.title}</h2>
            {respondingTo.description && <p className="text-sm text-slate-600">{respondingTo.description}</p>}
            <div className="border-t border-slate-100 my-2" />

            {(respondingTo.questions || []).map((q, i) => (
              <div key={q.id}>
                <label className="label flex items-center gap-1">
                  <span className="text-slate-400 text-xs">{i + 1}.</span>
                  {q.label} {q.required && <span className="text-rose-500">*</span>}
                </label>

                {q.type === 'text' && (
                  <textarea rows={2} value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="input" />
                )}

                {q.type === 'rating' && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setAnswers({ ...answers, [q.id]: n })}
                        className={`text-3xl ${answers[q.id] >= n ? 'text-gold' : 'text-slate-300'} hover:scale-110 transition`}>
                        ★
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'nps' && (
                  <div className="space-y-1">
                    <div className="flex gap-1 flex-wrap">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button key={n} type="button" onClick={() => setAnswers({ ...answers, [q.id]: n })}
                          className={`w-9 h-9 rounded-md text-sm font-medium border ${
                            answers[q.id] === n
                              ? n >= 9 ? 'bg-emerald-500 text-white border-emerald-500'
                                : n >= 7 ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-rose-500 text-white border-rose-500'
                              : 'bg-white border-slate-200 hover:border-navy'
                          }`}>{n}</button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{t('survey.notLikely', 'Not at all likely')}</span>
                      <span>{t('survey.extremely', 'Extremely likely')}</span>
                    </div>
                  </div>
                )}

                {q.type === 'boolean' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAnswers({ ...answers, [q.id]: true })}
                      className={`btn-sm ${answers[q.id] === true ? 'btn-primary' : 'btn-outline'}`}>
                      ✓ {t('common.yes')}
                    </button>
                    <button type="button" onClick={() => setAnswers({ ...answers, [q.id]: false })}
                      className={`btn-sm ${answers[q.id] === false ? 'btn-primary' : 'btn-outline'}`}>
                      ✕ {t('common.no')}
                    </button>
                  </div>
                )}

                {q.type === 'choice' && (
                  <div className="flex gap-1 flex-wrap">
                    {(q.options || []).map((opt) => (
                      <button key={opt} type="button" onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                        className={`px-3 py-1.5 rounded-full text-xs border ${
                          answers[q.id] === opt ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
                        }`}>{opt}</button>
                    ))}
                  </div>
                )}

                {q.type === 'multi_choice' && (
                  <div className="flex gap-1 flex-wrap">
                    {(q.options || []).map((opt) => {
                      const arr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const sel = arr.includes(opt);
                      return (
                        <button key={opt} type="button"
                          onClick={() => {
                            const next = sel ? arr.filter((x) => x !== opt) : [...arr, opt];
                            setAnswers({ ...answers, [q.id]: next });
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs border ${
                            sel ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
                          }`}>{opt}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button onClick={() => setRespondingTo(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={submit} disabled={submitting} className="btn-primary">
                {submitting ? t('common.loading') : t('survey.submitResponse', 'Submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
