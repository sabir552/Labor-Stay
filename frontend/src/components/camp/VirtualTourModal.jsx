import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';

/**
 * B1 — Virtual tour modal.
 * Accepts any iframe URL — YouTube (360 / regular), Matterport, etc.
 * Sandboxes the iframe for safety.
 */
export default function VirtualTourModal({ open, onClose, url, campName = '' }) {
  const { t } = useTranslation();
  if (!url) return null;

  // Normalize known share URLs to embed URLs
  let embedUrl = url;
  // YouTube watch → embed
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) embedUrl = `https://www.youtube.com/embed/${yt[1]}`;
  // Matterport space → embed
  const mp = url.match(/matterport\.com\/show\/\?m=([A-Za-z0-9]+)/);
  if (mp) embedUrl = `https://my.matterport.com/show/?m=${mp[1]}`;

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={`🎥 ${t('camp.virtualTour', 'Virtual tour')}${campName ? ` — ${campName}` : ''}`}>
      <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          title="Virtual tour"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; xr-spatial-tracking"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
      <div className="mt-3 text-xs text-slate-500 break-all">
        <a href={url} target="_blank" rel="noreferrer" className="link">{url}</a>
      </div>
    </Modal>
  );
}
