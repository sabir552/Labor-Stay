import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../common/Logo';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-navy text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="bg-white rounded-lg inline-block px-3 py-1.5 mb-3">
            <Logo size={28} />
          </div>
          <p className="text-sm text-navy-100 max-w-xs">{t('footer.tagline')}</p>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-gold">{t('footer.platform')}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/search"    className="text-navy-100 hover:text-white">{t('nav.camps')}</Link></li>
            <li><Link to="/equipment" className="text-navy-100 hover:text-white">{t('nav.equipment')}</Link></li>
            <li><Link to="/services"  className="text-navy-100 hover:text-white">{t('nav.services')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-gold">{t('footer.company')}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/about"   className="text-navy-100 hover:text-white">{t('nav.about')}</Link></li>
            <li><Link to="/contact" className="text-navy-100 hover:text-white">{t('nav.contact')}</Link></li>
            <li><Link to="/register?role=owner" className="text-navy-100 hover:text-white">{t('home.ctaJoinBtn')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-gold">{t('footer.legal')}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/terms"   className="text-navy-100 hover:text-white">{t('footer.terms')}</Link></li>
            <li><Link to="/privacy" className="text-navy-100 hover:text-white">{t('footer.privacy')}</Link></li>
          </ul>
          <p className="text-xs text-navy-100 mt-4">{t('footer.vatNote')}</p>
        </div>
      </div>
      <div className="border-t border-navy-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-xs text-navy-100 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} LaborStay. {t('footer.rights')}</div>
          <div className="flex items-center gap-3">
            <span className="chip !bg-navy-600 !text-navy-100">VAT 15%</span>
            <span className="chip !bg-navy-600 !text-navy-100">ZATCA</span>
            <span className="chip !bg-navy-600 !text-navy-100">PDPL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
