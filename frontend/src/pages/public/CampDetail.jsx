import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import StarRating from '../../components/common/StarRating';
import { SkeletonCard } from '../../components/common/Skeleton';
import CampGallery from '../../components/camp/CampGallery';
import RoomCard from '../../components/camp/RoomCard';
import BookingWidget from '../../components/camp/BookingWidget';
import VirtualTourModal from '../../components/camp/VirtualTourModal';
import NearbyPoisPanel from '../../components/camp/NearbyPoisPanel';
import { formatDate, initials } from '../../utils/formatters';

export default function CampDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    get(`/camps/${id}`)
      .then((r) => { setData(r); if (r.rooms?.length) setSelectedRoom(r.rooms[0]); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="skeleton h-[420px] rounded-2xl" />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (!data?.camp) {
    return <div className="max-w-3xl mx-auto py-24 text-center text-slate-500">Camp not found.</div>;
  }

  const { camp, photos, rooms, reviews, owner } = data;
  const gmapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
  const mapSrc = camp.latitude && camp.longitude
    ? (gmapsKey
        ? `https://www.google.com/maps/embed/v1/place?key=${gmapsKey}&q=${camp.latitude},${camp.longitude}`
        : `https://www.openstreetmap.org/export/embed.html?bbox=${(+camp.longitude - 0.01)},${(+camp.latitude - 0.01)},${(+camp.longitude + 0.01)},${(+camp.latitude + 0.01)}&layer=mapnik&marker=${camp.latitude},${camp.longitude}`)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 mb-3">
        <Link to="/" className="hover:text-navy">{t('nav.home')}</Link>
        <span className="mx-2">›</span>
        <Link to="/search" className="hover:text-navy">{t('nav.camps')}</Link>
        <span className="mx-2">›</span>
        <span className="text-navy">{camp.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {camp.is_featured && <span className="badge bg-gold text-white">★ {t('camp.featured')}</span>}
            <span className="badge bg-emerald-100 text-emerald-800">✓ {t('camp.verifiedCamp')}</span>
            <span className="badge bg-navy-50 text-navy capitalize">{camp.camp_type}</span>
            {camp.virtual_tour_url && (
              <button
                onClick={() => setTourOpen(true)}
                className="badge bg-gold/15 text-gold-600 hover:bg-gold/25 transition cursor-pointer"
                type="button"
              >
                🎥 {t('camp.virtualTour', 'Virtual tour')}
              </button>
            )}
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-navy">{camp.name}</h1>
          <div className="text-sm text-slate-600 mt-1 flex items-center gap-3">
            <StarRating value={camp.rating} size={14} />
            <span>({camp.review_count} {t('camp.reviews').toLowerCase()})</span>
            <span>·</span>
            <span>📍 {camp.address}, {camp.city}</span>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <CampGallery photos={photos} name={camp.name} />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        {/* ---------- MAIN COLUMN ---------- */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <section className="card p-5">
            <h2 className="text-lg font-semibold text-navy mb-2">About this camp</h2>
            <p className="text-slate-600 text-sm leading-relaxed">{camp.description}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {camp.family_allowed
                ? <span className="badge bg-emerald-100 text-emerald-800">👨‍👩‍👧 {t('camp.familyOk')}</span>
                : <span className="badge bg-slate-100 text-slate-600">Workers only</span>}
              {camp.smoking_allowed
                ? <span className="badge bg-amber-100 text-amber-800">🚬 {t('camp.smokingOk')}</span>
                : <span className="badge bg-slate-100 text-slate-600">🚭 {t('camp.noSmoking')}</span>}
              {(camp.nationality_preference || []).map((n) => (
                <span key={n} className="badge bg-navy-50 text-navy">{n}</span>
              ))}
            </div>
          </section>

          {/* Amenities */}
          <section className="card p-5">
            <h2 className="text-lg font-semibold text-navy mb-3">{t('camp.amenities')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(camp.amenities || []).map((a) => (
                <div key={a} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="text-emerald-600">✓</span>{a}
                </div>
              ))}
            </div>
          </section>

          {/* Rooms */}
          <section>
            <h2 className="text-xl font-bold text-navy mb-3">{t('camp.rooms')}</h2>
            <div className="space-y-3">
              {rooms.length === 0 && <div className="text-sm text-slate-500">No rooms listed yet.</div>}
              {rooms.map((r) => (
                <RoomCard
                  key={r.id} room={r}
                  selected={selectedRoom?.id === r.id}
                  onSelect={(rm) => setSelectedRoom(rm)}
                />
              ))}
            </div>
          </section>

          {/* Map */}
          {mapSrc && (
            <section className="card p-5">
              <h2 className="text-lg font-semibold text-navy mb-3">{t('camp.location')}</h2>
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <iframe
                  title="map"
                  src={mapSrc}
                  className="w-full h-64"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              {(camp.nearby_pois || []).length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-navy mb-2">{t('camp.nearby')}</h3>
                  <NearbyPoisPanel pois={camp.nearby_pois || []} />
                </div>
              )}
            </section>
          )}

          {/* Rules */}
          {camp.rules && (
            <section className="card p-5">
              <h2 className="text-lg font-semibold text-navy mb-2">{t('camp.rules')}</h2>
              <p className="text-sm text-slate-600 whitespace-pre-line">{camp.rules}</p>
            </section>
          )}

          {/* Reviews */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-navy">{t('camp.reviews')} ({reviews.length})</h2>
              <StarRating value={camp.rating} size={16} />
            </div>
            {reviews.length === 0 && <div className="text-sm text-slate-500">No reviews yet.</div>}
            <div className="space-y-4">
              {reviews.slice(0, 6).map((r) => (
                <div key={r.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">{initials(r.worker_name)}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-navy">{r.worker_name}</div>
                      <div className="text-xs text-slate-500">{formatDate(r.created_at)}</div>
                    </div>
                    <StarRating value={r.rating} size={12} showNumber={false} />
                  </div>
                  <p className="text-sm text-slate-700">{r.comment}</p>
                  {r.owner_reply && (
                    <div className="mt-2 ms-10 bg-slate-50 rounded-lg p-2 text-xs text-slate-700 border-s-2 border-gold">
                      <b>Owner reply:</b> {r.owner_reply}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Owner */}
          {owner && (
            <section className="card p-5">
              <h2 className="text-lg font-semibold text-navy mb-3">{t('camp.owner')}</h2>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gold text-white flex items-center justify-center font-bold">
                  {initials(owner.company_name || owner.full_name)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-navy">{owner.company_name || owner.full_name}</div>
                  <div className="text-xs text-slate-500">{owner.phone ? `📞 ${owner.phone}` : '📞 Available after booking confirmation'}</div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ---------- SIDEBAR ---------- */}
        <div className="lg:col-span-1">
          <BookingWidget room={selectedRoom} camp={camp} />
        </div>
      </div>
      <VirtualTourModal open={tourOpen} onClose={() => setTourOpen(false)} url={camp.virtual_tour_url} campName={camp.name} />
    </div>
  );
}
