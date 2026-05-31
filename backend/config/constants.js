// Business + domain constants used across the platform.
require('dotenv').config();

module.exports = {
  COMMISSION_RATE: parseFloat(process.env.COMMISSION_RATE || '0.10'),
  VAT_RATE: parseFloat(process.env.VAT_RATE || '0.15'),

  ROLES: {
    WORKER: 'worker',
    OWNER: 'owner',
    ADMIN: 'admin',
    PROVIDER: 'provider',
  },

  BOOKING_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CHECKED_IN: 'checked_in',
    CHECKED_OUT: 'checked_out',
    CANCELLED: 'cancelled',
    REJECTED: 'rejected',
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
    REFUNDED: 'refunded',
  },

  CAMP_TYPES: ['standard', 'executive', 'istira'],
  ROOM_TYPES: ['standard', 'executive', 'bed_space'],
  PRICING_TYPES: ['standard', 'weekend', 'ramadan', 'hajj_umrah'],

  KSA_CITIES: [
    'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina',
    'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha',
    'Hail', 'Najran', 'Taif', 'Buraidah', 'Khamis Mushait',
  ],

  KSA_REGIONS: [
    'Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir',
    'Tabuk', 'Hail', 'Northern Borders', 'Jazan', 'Najran',
    'Al-Baha', 'Al-Jouf', 'Qassim',
  ],

  NATIONALITIES: [
    'Saudi', 'Pakistani', 'Indian', 'Bangladeshi', 'Egyptian',
    'Filipino', 'Yemeni', 'Sudanese', 'Nepali', 'Sri Lankan',
    'Indonesian', 'Ethiopian', 'Other',
  ],

  EQUIPMENT_CATEGORIES: [
    'heavy_construction', 'dewatering', 'generator', 'compressor',
    'water_pump', 'tower_light', 'scaffolding', 'tools',
  ],

  SERVICE_CATEGORIES: [
    'labour_supply', 'catering', 'transportation', 'facility_management',
    'cleaning', 'security', 'laundry', 'portable_office', 'container_rental',
  ],
};
