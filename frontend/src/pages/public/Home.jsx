import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import Logo from '../../components/common/Logo';
import StarRating from '../../components/common/StarRating';
import { SkeletonGrid } from '../../components/common/Skeleton';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';

export default function Home() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [featured, setFeatured] = useState(null);
  const [city, setCity] = useState('');

  useEffect(() => {
    get('/camps/featured').then((r) => setFeatured(r.camps || [])).catch(() => setFeatured([]));
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (city) qs.set('city', city);
    nav(`/search?${qs.toString()}`);
  };

  const cities = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative bg-gradient-to-br from-navy via-navy-600 to-navy-700 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block bg-gold/20 text-gold-100 text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full mb-4">
              🇸🇦 {t('tagline')}
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-4">{t('home.heroTitle')}</h1>
            <p className="text-navy-100 text-lg mb-8 max-w-xl">{t('home.heroSubtitle')}</p>

            <form onSubmit={onSearch} className="bg-white rounded-2xl shadow-lift p-3 flex flex-col sm:flex-row gap-2">
              <select value={city} onChange={(e) => setCity(e.target.value)} className="input !text-slate-700 sm:max-w-xs">
                <option value="">{t('home.searchPlaceholder')}</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn-gold px-8">{t('common.search')}</button>
            </form>

            <div className="mt-8 grid grid-cols-4 gap-4 max-w-md">
              <Stat n="10+" label={t('home.statsCities')} />
              <Stat n="50+" label={t('home.statsCamps')} />
              <Stat n="2k+" label={t('home.statsRooms')} />
              <Stat n="15k+" label={t('home.statsWorkers')} />
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=900"
                alt="Worker camp accommodation"
                className="rounded-2xl shadow-lift object-cover w-full h-[420px]"
                loading="lazy"
              />
              <div className="absolute -bottom-4 -start-4 bg-white text-navy rounded-xl shadow-lift p-3 flex items-center gap-3">
                <div className="bg-gold rounded-lg p-2 text-white text-xl">★</div>
                <div>
                  <div className="font-bold">4.8 / 5</div>
                  <div className="text-xs text-slate-500">from 1,200+ workers</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED CAMPS ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-navy">{t('home.featuredTitle')}</h2>
            <p className="text-slate-500 text-sm mt-1">Hand-picked, top-rated accommodations.</p>
          </div>
          <Link to="/search" className="hidden sm:inline-flex btn-outline btn-sm">{t('common.viewDetails')} →</Link>
        </div>

        {!featured && <SkeletonGrid count={6} />}
        {featured && featured.length === 0 && (
          <div className="text-center py-12 text-slate-500">No featured camps yet.</div>
        )}
        {featured && featured.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((c) => (
              <Link to={`/camps/${c.id}`} key={c.id} className="card overflow-hidden group hover:shadow-lift transition">
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  <img src={safeImage(c.cover_photo)} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                  <span className="absolute top-2 ltr:left-2 rtl:right-2 badge bg-gold text-white">★ {t('camp.featured')}</span>
                  {c.min_price_day != null && (
                    <span className="absolute bottom-2 ltr:right-2 rtl:left-2 badge bg-white text-navy font-bold shadow">
                      from {formatSAR(c.min_price_day, i18n.language)}{t('common.perDay')}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-navy line-clamp-1 group-hover:text-gold">{c.name}</h3>
                    <StarRating value={c.rating} size={12} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span>📍</span>{c.city}, {c.region}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(c.amenities || []).slice(0, 3).map((a) => <span key={a} className="chip">{a}</span>)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-slate-100 py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl lg:text-3xl font-bold text-navy text-center mb-10">{t('home.howItWorksTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step n="1" icon="🔍" title={t('home.step1Title')} body={t('home.step1Body')} />
            <Step n="2" icon="💳" title={t('home.step2Title')} body={t('home.step2Body')} />
            <Step n="3" icon="📱" title={t('home.step3Title')} body={t('home.step3Body')} />
          </div>
        </div>
      </section>

      {/* ===== STAGE 2 + 3 TEASERS ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid md:grid-cols-2 gap-6">
        <Link to="/equipment" className="card overflow-hidden group">
          <div className="relative h-44 bg-gradient-to-br from-navy to-navy-700 flex items-center justify-center text-6xl">🚜</div>
          <div className="p-5">
            <h3 className="text-xl font-semibold text-navy group-hover:text-gold">{t('home.exploreEquipment')}</h3>
            <p className="text-sm text-slate-500 mt-1">Generators, dewatering, scaffolding & more — daily / weekly / monthly rentals.</p>
          </div>
        </Link>
        <Link to="/services" className="card overflow-hidden group">
          <div className="relative h-44 bg-gradient-to-br from-gold to-gold-500 flex items-center justify-center text-6xl">🛠️</div>
          <div className="p-5">
            <h3 className="text-xl font-semibold text-navy group-hover:text-gold">{t('home.exploreServices')}</h3>
            <p className="text-sm text-slate-500 mt-1">Catering, transport, cleaning, security, laundry — request a quote in minutes.</p>
          </div>
        </Link>
      </section>

      {/* ===== CTA — owners ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="bg-gradient-to-r from-navy to-navy-600 rounded-3xl p-8 lg:p-12 flex flex-col lg:flex-row items-center gap-6 text-white">
          <div className="flex-1">
            <h3 className="text-2xl lg:text-3xl font-bold mb-2">{t('home.ctaJoin')}</h3>
            <p className="text-navy-100 max-w-xl">{t('home.ctaJoinBody')}</p>
          </div>
          <Link to="/register?role=owner" className="btn-gold px-8 py-3 text-base whitespace-nowrap">
            {t('home.ctaJoinBtn')} →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div className="text-2xl lg:text-3xl font-extrabold text-gold">{n}</div>
      <div className="text-xs text-navy-100">{label}</div>
    </div>
  );
}

function Step({ n, icon, title, body }) {
  return (
    <div className="bg-white rounded-2xl p-6 text-center shadow-soft relative">
      <div className="absolute -top-3 ltr:left-6 rtl:right-6 bg-gold text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">{n}</div>
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="font-semibold text-navy mb-1">{title}</h3>
      <p className="text-sm text-slate-500">{body}</p>
    </div>
  );
}
