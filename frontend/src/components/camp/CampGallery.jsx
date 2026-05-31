import React, { useState } from 'react';
import { safeImage } from '../../utils/helpers';
import Modal from '../common/Modal';

export default function CampGallery({ photos = [], name = '' }) {
  const [lightbox, setLightbox] = useState(null);
  const list = photos.length ? photos : [{ url: safeImage(null) }];

  return (
    <>
      <div className="grid grid-cols-4 gap-2 rounded-2xl overflow-hidden">
        <div className="col-span-4 sm:col-span-2 row-span-2 relative aspect-[4/3] sm:aspect-auto sm:h-[420px] cursor-pointer" onClick={() => setLightbox(0)}>
          <img src={safeImage(list[0].url)} alt={name} className="w-full h-full object-cover hover:opacity-90 transition" />
        </div>
        {list.slice(1, 5).map((p, i) => (
          <div key={i} className="hidden sm:block aspect-[4/3] sm:h-[206px] cursor-pointer relative" onClick={() => setLightbox(i + 1)}>
            <img src={safeImage(p.url)} alt={`${name} ${i + 2}`} className="w-full h-full object-cover hover:opacity-90 transition" />
            {i === 3 && list.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-semibold">
                +{list.length - 5}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={lightbox !== null} onClose={() => setLightbox(null)} size="xl">
        {lightbox !== null && (
          <div className="space-y-3">
            <img src={safeImage(list[lightbox].url)} alt={`${name} ${lightbox + 1}`} className="w-full max-h-[70vh] object-contain bg-black" />
            <div className="flex items-center justify-between text-sm text-slate-600">
              <button
                disabled={lightbox === 0}
                onClick={() => setLightbox((i) => Math.max(0, i - 1))}
                className="btn-ghost"
              >← Prev</button>
              <span>{lightbox + 1} / {list.length}</span>
              <button
                disabled={lightbox === list.length - 1}
                onClick={() => setLightbox((i) => Math.min(list.length - 1, i + 1))}
                className="btn-ghost"
              >Next →</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
