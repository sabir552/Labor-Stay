import React from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger = false }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
          <button
            onClick={() => { onConfirm?.(); onClose?.(); }}
            className={danger ? 'btn bg-rose-600 text-white hover:bg-rose-700 px-5 py-2.5' : 'btn-primary'}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{message}</p>
    </Modal>
  );
}
