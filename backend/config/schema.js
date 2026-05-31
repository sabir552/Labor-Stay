/**
 * Schema definitions. We write portable SQL that works on both
 * Postgres and SQLite. For Postgres we use SERIAL, for SQLite
 * we use INTEGER PRIMARY KEY AUTOINCREMENT (the setup script
 * picks the right variant based on driver).
 */
function buildSchema(driver) {
  const PK = driver === 'postgres'
    ? 'SERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = driver === 'postgres'
    ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    : 'DATETIME DEFAULT CURRENT_TIMESTAMP';
  const BOOL = driver === 'postgres' ? 'BOOLEAN' : 'INTEGER';
  const JSON_T = driver === 'postgres' ? 'JSONB' : 'TEXT';
  const TEXT = 'TEXT';
  const DECIMAL = driver === 'postgres' ? 'DECIMAL(12,2)' : 'REAL';

  return [
    // ===== USERS =====
    `CREATE TABLE IF NOT EXISTS users (
      id ${PK},
      role ${TEXT} NOT NULL CHECK (role IN ('worker','owner','admin','provider')),
      full_name ${TEXT} NOT NULL,
      email ${TEXT} UNIQUE NOT NULL,
      password_hash ${TEXT} NOT NULL,
      phone ${TEXT},
      preferred_language ${TEXT} DEFAULT 'en',
      is_active ${BOOL} DEFAULT 1,
      is_verified ${BOOL} DEFAULT 0,
      avatar_url ${TEXT},
      created_at ${TS},
      updated_at ${TS}
    )`,

    // Worker profile (1:1 with users when role=worker)
    `CREATE TABLE IF NOT EXISTS worker_profiles (
      id ${PK},
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nationality ${TEXT},
      iqama_number ${TEXT},
      iqama_expiry ${TEXT},
      iqama_photo_url ${TEXT},
      iqama_verified ${BOOL} DEFAULT 0,
      created_at ${TS}
    )`,

    // Owner / Company profile
    `CREATE TABLE IF NOT EXISTS owner_profiles (
      id ${PK},
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name ${TEXT},
      cr_number ${TEXT},
      vat_number ${TEXT},
      address ${TEXT},
      created_at ${TS}
    )`,

    // ===== CAMPS =====
    `CREATE TABLE IF NOT EXISTS camps (
      id ${PK},
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      camp_type ${TEXT} CHECK (camp_type IN ('standard','executive','istira')),
      address ${TEXT},
      city ${TEXT},
      region ${TEXT},
      latitude ${DECIMAL},
      longitude ${DECIMAL},
      amenities ${JSON_T},
      nearby_pois ${JSON_T},
      nationality_preference ${JSON_T},
      family_allowed ${BOOL} DEFAULT 0,
      smoking_allowed ${BOOL} DEFAULT 0,
      rules ${TEXT},
      licence_number ${TEXT},
      capacity INTEGER DEFAULT 0,
      emergency_contact ${TEXT},
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
      is_featured ${BOOL} DEFAULT 0,
      rating ${DECIMAL} DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      created_at ${TS},
      updated_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS camp_photos (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      url ${TEXT} NOT NULL,
      is_cover ${BOOL} DEFAULT 0,
      created_at ${TS}
    )`,

    // ===== ROOMS =====
    `CREATE TABLE IF NOT EXISTS rooms (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      room_type ${TEXT} CHECK (room_type IN ('standard','executive','bed_space')),
      capacity INTEGER NOT NULL DEFAULT 1,
      available_beds INTEGER NOT NULL DEFAULT 1,
      price_per_day ${DECIMAL} DEFAULT 0,
      price_per_month ${DECIMAL} DEFAULT 0,
      amenities ${JSON_T},
      photos ${JSON_T},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    // Dynamic pricing rules (weekend, ramadan, hajj)
    `CREATE TABLE IF NOT EXISTS dynamic_pricing (
      id ${PK},
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      pricing_type ${TEXT} NOT NULL,
      multiplier ${DECIMAL} DEFAULT 1.0,
      start_date ${TEXT},
      end_date ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    // ===== BOOKINGS =====
    `CREATE TABLE IF NOT EXISTS bookings (
      id ${PK},
      booking_code ${TEXT} UNIQUE NOT NULL,
      worker_id INTEGER NOT NULL REFERENCES users(id),
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      camp_id INTEGER NOT NULL REFERENCES camps(id),
      booking_type ${TEXT} CHECK (booking_type IN ('daily','weekly','monthly','contract')),
      start_date ${TEXT} NOT NULL,
      end_date ${TEXT} NOT NULL,
      occupants INTEGER DEFAULT 1,
      base_amount ${DECIMAL} DEFAULT 0,
      vat_amount ${DECIMAL} DEFAULT 0,
      commission_amount ${DECIMAL} DEFAULT 0,
      total_amount ${DECIMAL} DEFAULT 0,
      net_to_owner ${DECIMAL} DEFAULT 0,
      status ${TEXT} DEFAULT 'pending',
      rejection_reason ${TEXT},
      qr_code ${TEXT},
      checked_in_at ${TEXT},
      checked_out_at ${TEXT},
      created_at ${TS},
      updated_at ${TS}
    )`,

    // ===== PAYMENTS =====
    `CREATE TABLE IF NOT EXISTS payments (
      id ${PK},
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      equipment_booking_id INTEGER,
      service_request_id INTEGER,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount ${DECIMAL} NOT NULL,
      method ${TEXT},
      gateway_ref ${TEXT},
      status ${TEXT} DEFAULT 'pending',
      invoice_number ${TEXT},
      paid_at ${TEXT},
      created_at ${TS}
    )`,

    // ===== REVIEWS =====
    `CREATE TABLE IF NOT EXISTS reviews (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL REFERENCES users(id),
      booking_id INTEGER REFERENCES bookings(id),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      comment ${TEXT},
      owner_reply ${TEXT},
      created_at ${TS}
    )`,

    // ===== MESSAGES =====
    `CREATE TABLE IF NOT EXISTS messages (
      id ${PK},
      conversation_id ${TEXT} NOT NULL,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content ${TEXT} NOT NULL,
      is_read ${BOOL} DEFAULT 0,
      created_at ${TS}
    )`,

    // ===== NOTIFICATIONS =====
    `CREATE TABLE IF NOT EXISTS notifications (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type ${TEXT},
      title ${TEXT},
      body ${TEXT},
      link ${TEXT},
      is_read ${BOOL} DEFAULT 0,
      created_at ${TS}
    )`,

    // ===== WAITING LIST =====
    `CREATE TABLE IF NOT EXISTS waiting_list (
      id ${PK},
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      requested_date ${TEXT},
      status ${TEXT} DEFAULT 'active',
      notified_at ${TEXT},
      created_at ${TS}
    )`,

    // ===== EQUIPMENT =====
    `CREATE TABLE IF NOT EXISTS equipment (
      id ${PK},
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category ${TEXT} NOT NULL,
      name ${TEXT} NOT NULL,
      model ${TEXT},
      manufacturer ${TEXT},
      description ${TEXT},
      specifications ${JSON_T},
      photos ${JSON_T},
      daily_rate ${DECIMAL} DEFAULT 0,
      weekly_rate ${DECIMAL} DEFAULT 0,
      monthly_rate ${DECIMAL} DEFAULT 0,
      city ${TEXT},
      gps_tracker_id ${TEXT},
      fuel_type ${TEXT},
      fuel_consumption ${TEXT},
      operator_included ${BOOL} DEFAULT 0,
      delivery_available ${BOOL} DEFAULT 0,
      delivery_charge ${DECIMAL} DEFAULT 0,
      status ${TEXT} DEFAULT 'available',
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS equipment_bookings (
      id ${PK},
      booking_code ${TEXT} UNIQUE NOT NULL,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id),
      client_id INTEGER NOT NULL REFERENCES users(id),
      start_date ${TEXT} NOT NULL,
      end_date ${TEXT} NOT NULL,
      rental_type ${TEXT},
      total_amount ${DECIMAL} DEFAULT 0,
      operator_assigned ${BOOL} DEFAULT 0,
      status ${TEXT} DEFAULT 'pending',
      created_at ${TS}
    )`,

    // ===== SERVICES =====
    `CREATE TABLE IF NOT EXISTS services (
      id ${PK},
      provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category ${TEXT} NOT NULL,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      pricing_type ${TEXT},
      base_price ${DECIMAL} DEFAULT 0,
      city ${TEXT},
      photos ${JSON_T},
      rating ${DECIMAL} DEFAULT 0,
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS service_requests (
      id ${PK},
      request_code ${TEXT} UNIQUE NOT NULL,
      client_id INTEGER NOT NULL REFERENCES users(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      description ${TEXT},
      required_date ${TEXT},
      quantity INTEGER DEFAULT 1,
      status ${TEXT} DEFAULT 'pending',
      quoted_price ${DECIMAL},
      created_at ${TS}
    )`,

    // ===== ADMIN / OPS =====
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id ${PK},
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action ${TEXT} NOT NULL,
      entity ${TEXT},
      entity_id INTEGER,
      meta ${JSON_T},
      ip ${TEXT},
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS announcements (
      id ${PK},
      title ${TEXT} NOT NULL,
      body ${TEXT},
      audience ${TEXT} DEFAULT 'all',
      created_by INTEGER REFERENCES users(id),
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS disputes (
      id ${PK},
      booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
      raised_by INTEGER REFERENCES users(id),
      subject ${TEXT},
      description ${TEXT},
      status ${TEXT} DEFAULT 'open',
      resolution ${TEXT},
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS maintenance_requests (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES rooms(id),
      worker_id INTEGER REFERENCES users(id),
      title ${TEXT},
      description ${TEXT},
      priority ${TEXT} DEFAULT 'medium',
      status ${TEXT} DEFAULT 'open',
      created_at ${TS}
    )`,

    `CREATE TABLE IF NOT EXISTS documents (
      id ${PK},
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id),
      doc_type ${TEXT},
      name ${TEXT},
      url ${TEXT},
      created_at ${TS}
    )`,

    // ===== INDEXES =====
    `CREATE INDEX IF NOT EXISTS idx_camps_city ON camps(city)`,
    `CREATE INDEX IF NOT EXISTS idx_camps_status ON camps(status)`,
    `CREATE INDEX IF NOT EXISTS idx_camps_featured ON camps(is_featured)`,
    `CREATE INDEX IF NOT EXISTS idx_rooms_camp ON rooms(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_worker ON bookings(worker_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)`,
  ];
}

module.exports = { buildSchema };

/**
 * v2 (Piece 13+) — additive schema for follow-up build.
 * All tables use CREATE TABLE IF NOT EXISTS so re-running is safe.
 * Does NOT touch existing v1 tables.
 *
 * Also adds new columns to existing tables via ALTER TABLE ADD COLUMN
 * (guarded — silently ignored if column already exists).
 */
function buildSchemaV2(driver) {
  const PK = driver === 'postgres'
    ? 'SERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = driver === 'postgres'
    ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    : 'DATETIME DEFAULT CURRENT_TIMESTAMP';
  const BOOL = driver === 'postgres' ? 'BOOLEAN' : 'INTEGER';
  const JSON_T = driver === 'postgres' ? 'JSONB' : 'TEXT';
  const TEXT = 'TEXT';
  const DECIMAL = driver === 'postgres' ? 'DECIMAL(12,2)' : 'REAL';

  return [
    // ===== A1: Agreement-related columns on bookings =====
    // (added via additive ALTER; helper in setupDatabase handles silent fail)

    // ===== B1/B2: Camp/Room enhancement columns (additive) =====

    // ===== B3: CATERING =====
    `CREATE TABLE IF NOT EXISTS catering_menus (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      date ${TEXT} NOT NULL,
      meal_type ${TEXT} CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
      items ${JSON_T},
      dietary_options ${JSON_T},
      cost_per_person ${DECIMAL} DEFAULT 0,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS meal_attendance (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      booking_id INTEGER REFERENCES bookings(id),
      date ${TEXT} NOT NULL,
      meal_type ${TEXT},
      attended ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS catering_packages (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      name ${TEXT} NOT NULL,
      description ${TEXT},
      includes_breakfast ${BOOL} DEFAULT 0,
      includes_lunch ${BOOL} DEFAULT 0,
      includes_dinner ${BOOL} DEFAULT 0,
      price_per_day ${DECIMAL} DEFAULT 0,
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS catering_orders (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      ordered_by INTEGER NOT NULL REFERENCES users(id),
      package_id INTEGER REFERENCES catering_packages(id),
      start_date ${TEXT},
      end_date ${TEXT},
      num_persons INTEGER DEFAULT 1,
      total_cost ${DECIMAL} DEFAULT 0,
      status ${TEXT} DEFAULT 'pending',
      notes ${TEXT},
      created_at ${TS}
    )`,

    // ===== B4: TRANSPORTATION =====
    `CREATE TABLE IF NOT EXISTS vehicles (
      id ${PK},
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id) ON DELETE SET NULL,
      plate_number ${TEXT} NOT NULL,
      vehicle_type ${TEXT} CHECK (vehicle_type IN ('bus','van','pickup','car')),
      capacity INTEGER DEFAULT 1,
      driver_name ${TEXT},
      driver_phone ${TEXT},
      driver_iqama ${TEXT},
      gps_device_id ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS transport_routes (
      id ${PK},
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id) ON DELETE SET NULL,
      route_name ${TEXT} NOT NULL,
      origin ${TEXT},
      destination ${TEXT},
      stops ${JSON_T},
      departure_time ${TEXT},
      arrival_time ${TEXT},
      days_of_week ${JSON_T},
      price_per_seat ${DECIMAL} DEFAULT 0,
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS transport_bookings (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
      travel_date ${TEXT} NOT NULL,
      seat_number INTEGER,
      status ${TEXT} DEFAULT 'pending',
      amount ${DECIMAL} DEFAULT 0,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS vehicle_locations (
      id ${PK},
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      latitude ${DECIMAL},
      longitude ${DECIMAL},
      speed ${DECIMAL},
      recorded_at ${TS}
    )`,

    // ===== C1: SERVICE REQUESTS (worker-side, distinct from existing
    //          services marketplace `service_requests` table — we use a
    //          new table `worker_service_requests` to avoid clashing) =====
    `CREATE TABLE IF NOT EXISTS worker_service_requests (
      id ${PK},
      worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id),
      booking_id INTEGER REFERENCES bookings(id),
      request_type ${TEXT} NOT NULL,
      title ${TEXT},
      description ${TEXT},
      priority ${TEXT} DEFAULT 'medium' CHECK (priority IN ('low','medium','high','emergency')),
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','rejected')),
      assigned_to INTEGER REFERENCES users(id),
      response_notes ${TEXT},
      attachment_urls ${JSON_T},
      resolved_at ${TEXT},
      created_at ${TS},
      updated_at ${TS}
    )`,

    // ===== C2: SURVEYS =====
    `CREATE TABLE IF NOT EXISTS surveys (
      id ${PK},
      title ${TEXT} NOT NULL,
      description ${TEXT},
      questions ${JSON_T},
      camp_id INTEGER REFERENCES camps(id),
      is_active ${BOOL} DEFAULT 1,
      start_date ${TEXT},
      end_date ${TEXT},
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS survey_responses (
      id ${PK},
      survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      booking_id INTEGER REFERENCES bookings(id),
      answers ${JSON_T},
      nps_score INTEGER,
      created_at ${TS}
    )`,

    // ===== D1: HOUSEKEEPING =====
    `CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES rooms(id),
      assigned_to INTEGER,
      task_type ${TEXT} CHECK (task_type IN ('cleaning','laundry','linen_change','inspection')),
      scheduled_date ${TEXT},
      scheduled_time ${TEXT},
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','skipped')),
      notes ${TEXT},
      completed_at ${TEXT},
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS housekeeping_schedules (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES rooms(id),
      frequency ${TEXT} CHECK (frequency IN ('daily','weekly','monthly')),
      days_of_week ${JSON_T},
      time_of_day ${TEXT},
      task_type ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    // ===== D2: VISITORS =====
    `CREATE TABLE IF NOT EXISTS visitor_logs (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      visitor_name ${TEXT} NOT NULL,
      visitor_id_number ${TEXT},
      visitor_phone ${TEXT},
      host_worker_id INTEGER REFERENCES users(id),
      host_room ${TEXT},
      purpose ${TEXT},
      entry_time ${TS},
      exit_time ${TEXT},
      vehicle_plate ${TEXT},
      approved_by INTEGER REFERENCES users(id),
      created_at ${TS}
    )`,

    // ===== D3: STAFF =====
    `CREATE TABLE IF NOT EXISTS camp_staff (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      full_name ${TEXT} NOT NULL,
      role ${TEXT} CHECK (role IN ('cleaner','security','maintenance','driver','cook','supervisor','other')),
      phone ${TEXT},
      email ${TEXT},
      iqama_number ${TEXT},
      iqama_expiry ${TEXT},
      passport_number ${TEXT},
      passport_expiry ${TEXT},
      nationality ${TEXT},
      photo_url ${TEXT},
      documents ${JSON_T},
      salary ${DECIMAL} DEFAULT 0,
      hire_date ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS staff_attendance (
      id ${PK},
      staff_id INTEGER NOT NULL REFERENCES camp_staff(id) ON DELETE CASCADE,
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      date ${TEXT} NOT NULL,
      check_in_time ${TEXT},
      check_out_time ${TEXT},
      hours_worked ${DECIMAL} DEFAULT 0,
      status ${TEXT} DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day')),
      notes ${TEXT},
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS staff_shifts (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES camp_staff(id) ON DELETE CASCADE,
      shift_name ${TEXT},
      start_time ${TEXT},
      end_time ${TEXT},
      days ${JSON_T},
      created_at ${TS}
    )`,

    // ===== D6: PAYROLL =====
    `CREATE TABLE IF NOT EXISTS payroll_records (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES camp_staff(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      basic_salary ${DECIMAL} DEFAULT 0,
      allowances ${DECIMAL} DEFAULT 0,
      deductions ${DECIMAL} DEFAULT 0,
      accommodation_deduction ${DECIMAL} DEFAULT 0,
      net_salary ${DECIMAL} DEFAULT 0,
      payment_status ${TEXT} DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
      payment_date ${TEXT},
      notes ${TEXT},
      created_at ${TS}
    )`,

    // ===== E2/E3: CORPORATE =====
    `CREATE TABLE IF NOT EXISTS corporate_accounts (
      id ${PK},
      company_name ${TEXT} NOT NULL,
      cr_number ${TEXT},
      vat_number ${TEXT},
      contact_name ${TEXT},
      contact_email ${TEXT},
      contact_phone ${TEXT},
      credit_limit ${DECIMAL} DEFAULT 0,
      current_balance ${DECIMAL} DEFAULT 0,
      payment_terms ${TEXT} DEFAULT 'net30',
      finance_email ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS corporate_bookings (
      id ${PK},
      corporate_id INTEGER NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id),
      num_beds INTEGER DEFAULT 1,
      start_date ${TEXT},
      end_date ${TEXT},
      total_amount ${DECIMAL} DEFAULT 0,
      invoice_id INTEGER,
      status ${TEXT} DEFAULT 'pending',
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS corporate_invoices (
      id ${PK},
      corporate_id INTEGER NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
      invoice_number ${TEXT} UNIQUE NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_amount ${DECIMAL} DEFAULT 0,
      vat_amount ${DECIMAL} DEFAULT 0,
      status ${TEXT} DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue')),
      due_date ${TEXT},
      paid_at ${TEXT},
      pdf_url ${TEXT},
      created_at ${TS}
    )`,

    // ===== E5: PAYOUT REQUESTS =====
    `CREATE TABLE IF NOT EXISTS payout_requests (
      id ${PK},
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount ${DECIMAL} NOT NULL,
      bank_name ${TEXT},
      iban ${TEXT},
      account_holder ${TEXT},
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
      admin_notes ${TEXT},
      processed_at ${TEXT},
      created_at ${TS}
    )`,

    // ===== F1/F2: 2FA + SESSIONS =====
    `CREATE TABLE IF NOT EXISTS user_2fa (
      id ${PK},
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      secret ${TEXT} NOT NULL,
      is_enabled ${BOOL} DEFAULT 0,
      backup_codes ${JSON_T},
      created_at ${TS},
      enabled_at ${TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash ${TEXT} NOT NULL,
      device_info ${TEXT},
      ip_address ${TEXT},
      user_agent ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS},
      last_used_at ${TEXT},
      expires_at ${TEXT}
    )`,

    // ===== F3: IP BLOCKING =====
    `CREATE TABLE IF NOT EXISTS ip_blocks (
      id ${PK},
      ip_address ${TEXT} UNIQUE NOT NULL,
      attempts INTEGER DEFAULT 0,
      blocked_until ${TS},
      reason ${TEXT},
      created_at ${TS},
      updated_at ${TS}
    )`,

    // ===== F4: CCTV =====
    `CREATE TABLE IF NOT EXISTS cctv_cameras (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      camera_name ${TEXT},
      location_description ${TEXT},
      stream_url ${TEXT},
      snapshot_url ${TEXT},
      camera_type ${TEXT} CHECK (camera_type IN ('ip','analog','ptz')),
      manufacturer ${TEXT},
      model ${TEXT},
      ip_address ${TEXT},
      username ${TEXT},
      password ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    // ===== F5: ACCESS CARDS =====
    `CREATE TABLE IF NOT EXISTS access_cards (
      id ${PK},
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id) ON DELETE CASCADE,
      booking_id INTEGER REFERENCES bookings(id),
      card_number ${TEXT},
      card_uid ${TEXT},
      status ${TEXT} DEFAULT 'active' CHECK (status IN ('active','inactive','lost','expired')),
      issued_at ${TS},
      expires_at ${TEXT},
      deactivated_at ${TEXT},
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS access_logs (
      id ${PK},
      card_id INTEGER REFERENCES access_cards(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id),
      camp_id INTEGER REFERENCES camps(id),
      room_id INTEGER REFERENCES rooms(id),
      action ${TEXT} CHECK (action IN ('entry','exit','denied')),
      gate_name ${TEXT},
      timestamp ${TS}
    )`,

    // ===== F6: BIOMETRIC =====
    `CREATE TABLE IF NOT EXISTS biometric_records (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      camp_id INTEGER REFERENCES camps(id),
      device_id ${TEXT},
      biometric_id ${TEXT},
      type ${TEXT} CHECK (type IN ('fingerprint','face','iris')),
      enrolled_at ${TS},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS biometric_logs (
      id ${PK},
      user_id INTEGER REFERENCES users(id),
      camp_id INTEGER REFERENCES camps(id),
      device_id ${TEXT},
      action ${TEXT} CHECK (action IN ('check_in','check_out','access_denied')),
      confidence_score ${DECIMAL},
      verified_at ${TEXT},
      created_at ${TS}
    )`,

    // ===== F7: PDPL DELETION REQUESTS =====
    `CREATE TABLE IF NOT EXISTS deletion_requests (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason ${TEXT},
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
      processed_by INTEGER REFERENCES users(id),
      processed_at ${TEXT},
      created_at ${TS}
    )`,

    // ===== G1: ERP SYNC =====
    `CREATE TABLE IF NOT EXISTS erp_sync_logs (
      id ${PK},
      sync_type ${TEXT},
      entity_type ${TEXT},
      entity_id INTEGER,
      direction ${TEXT} CHECK (direction IN ('push','pull')),
      status ${TEXT} CHECK (status IN ('success','failed','pending')),
      payload ${JSON_T},
      response ${JSON_T},
      error_message ${TEXT},
      created_at ${TS}
    )`,

    // ===== G2: MULTI-COMPANY =====
    `CREATE TABLE IF NOT EXISTS companies (
      id ${PK},
      name ${TEXT} NOT NULL,
      cr_number ${TEXT},
      vat_number ${TEXT},
      logo_url ${TEXT},
      address ${TEXT},
      city ${TEXT},
      region ${TEXT},
      phone ${TEXT},
      email ${TEXT},
      website ${TEXT},
      account_manager_id INTEGER REFERENCES users(id),
      credit_limit ${DECIMAL} DEFAULT 0,
      payment_terms ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS branches (
      id ${PK},
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_name ${TEXT} NOT NULL,
      address ${TEXT},
      city ${TEXT},
      region ${TEXT},
      manager_name ${TEXT},
      manager_phone ${TEXT},
      manager_email ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      created_at ${TS}
    )`,

    // ===== G3: UTILITIES =====
    `CREATE TABLE IF NOT EXISTS utility_readings (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      utility_type ${TEXT} CHECK (utility_type IN ('electricity','water','gas','diesel')),
      meter_number ${TEXT},
      previous_reading ${DECIMAL} DEFAULT 0,
      current_reading ${DECIMAL} DEFAULT 0,
      consumption ${DECIMAL} DEFAULT 0,
      unit ${TEXT},
      rate_per_unit ${DECIMAL} DEFAULT 0,
      total_cost ${DECIMAL} DEFAULT 0,
      reading_date ${TEXT},
      recorded_by INTEGER REFERENCES users(id),
      notes ${TEXT},
      created_at ${TS}
    )`,
    `CREATE TABLE IF NOT EXISTS utility_alerts (
      id ${PK},
      camp_id INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
      utility_type ${TEXT},
      threshold_value ${DECIMAL},
      alert_email ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      last_triggered ${TEXT},
      created_at ${TS}
    )`,

    // ===== H1: REFERRALS =====
    `CREATE TABLE IF NOT EXISTS referrals (
      id ${PK},
      referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      referral_code ${TEXT} NOT NULL,
      status ${TEXT} DEFAULT 'pending' CHECK (status IN ('pending','completed','rewarded')),
      reward_amount ${DECIMAL} DEFAULT 0,
      reward_credited ${BOOL} DEFAULT 0,
      created_at ${TS}
    )`,

    // ===== H2: LOYALTY POINTS =====
    `CREATE TABLE IF NOT EXISTS loyalty_points (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      transaction_type ${TEXT} CHECK (transaction_type IN ('earned','redeemed','expired','bonus')),
      reference_type ${TEXT},
      reference_id INTEGER,
      description ${TEXT},
      created_at ${TS}
    )`,

    // ===== H4: PRICE ALERTS =====
    `CREATE TABLE IF NOT EXISTS price_alerts (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      city ${TEXT},
      camp_type ${TEXT},
      room_type ${TEXT},
      max_price ${DECIMAL},
      nationality_pref ${TEXT},
      is_active ${BOOL} DEFAULT 1,
      last_notified ${TEXT},
      created_at ${TS}
    )`,

    // ===== H5: BADGES (cached lookup) =====
    `CREATE TABLE IF NOT EXISTS badges (
      id ${PK},
      entity_type ${TEXT} NOT NULL,
      entity_id INTEGER NOT NULL,
      badge_type ${TEXT} NOT NULL,
      awarded_at ${TS}
    )`,

    // ===== H10: NOTIFICATION PREFS =====
    `CREATE TABLE IF NOT EXISTS notification_preferences (
      id ${PK},
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category ${TEXT} NOT NULL,
      channel ${TEXT} NOT NULL,
      is_enabled ${BOOL} DEFAULT 1,
      created_at ${TS},
      updated_at ${TS}
    )`,

    // ===== INDEXES =====
    `CREATE INDEX IF NOT EXISTS idx_v2_catering_menus_camp     ON catering_menus(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_meal_attendance_user    ON meal_attendance(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_catering_orders_camp    ON catering_orders(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_vehicles_owner          ON vehicles(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_routes_vehicle          ON transport_routes(vehicle_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_tbookings_user          ON transport_bookings(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_vlocations_vehicle      ON vehicle_locations(vehicle_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_wsr_worker              ON worker_service_requests(worker_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_wsr_camp                ON worker_service_requests(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_wsr_status              ON worker_service_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_survey_responses_survey ON survey_responses(survey_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_housekeeping_camp       ON housekeeping_tasks(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_visitors_camp           ON visitor_logs(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_staff_camp              ON camp_staff(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_attendance_staff        ON staff_attendance(staff_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_payroll_staff           ON payroll_records(staff_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_corp_bookings_corp      ON corporate_bookings(corporate_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_corp_invoices_corp      ON corporate_invoices(corporate_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_payout_owner            ON payout_requests(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_sessions_user           ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_ipblocks_ip             ON ip_blocks(ip_address)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_cctv_camp               ON cctv_cameras(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_access_cards_user       ON access_cards(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_access_logs_camp        ON access_logs(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_biometric_user          ON biometric_records(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_companies_active        ON companies(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_branches_company        ON branches(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_utility_camp            ON utility_readings(camp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_referrals_referrer      ON referrals(referrer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_referrals_code          ON referrals(referral_code)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_loyalty_user            ON loyalty_points(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_price_alerts_user       ON price_alerts(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_badges_entity           ON badges(entity_type, entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_v2_notif_prefs_user        ON notification_preferences(user_id)`,
  ];
}

/**
 * Additive ALTER TABLE statements that enhance existing v1 tables.
 * Each is wrapped in try/catch by the setup script — "duplicate column"
 * errors are silently ignored so re-runs are safe.
 */
function additiveAlters() {
  return [
    // A1: agreement signing fields on bookings
    `ALTER TABLE bookings ADD COLUMN agreement_signed INTEGER DEFAULT 0`,
    `ALTER TABLE bookings ADD COLUMN agreement_url TEXT`,
    `ALTER TABLE bookings ADD COLUMN agreement_signed_at TEXT`,

    // B1: virtual tour url
    `ALTER TABLE camps ADD COLUMN virtual_tour_url TEXT`,

    // B2: room dimensions & details
    `ALTER TABLE rooms ADD COLUMN length_m REAL`,
    `ALTER TABLE rooms ADD COLUMN width_m REAL`,
    `ALTER TABLE rooms ADD COLUMN height_m REAL`,
    `ALTER TABLE rooms ADD COLUMN num_windows INTEGER`,
    `ALTER TABLE rooms ADD COLUMN floor_type TEXT`,
    `ALTER TABLE rooms ADD COLUMN has_attached_bathroom INTEGER DEFAULT 0`,
    `ALTER TABLE rooms ADD COLUMN num_bathrooms INTEGER DEFAULT 0`,
    `ALTER TABLE rooms ADD COLUMN ac_type TEXT`,
    `ALTER TABLE rooms ADD COLUMN internet_type TEXT`,
    `ALTER TABLE rooms ADD COLUMN internet_speed TEXT`,

    // E1: user preferred currency
    `ALTER TABLE users ADD COLUMN preferred_currency TEXT DEFAULT 'SAR'`,

    // G2: company/branch on users, camps, bookings
    `ALTER TABLE users    ADD COLUMN company_id INTEGER`,
    `ALTER TABLE users    ADD COLUMN branch_id INTEGER`,
    `ALTER TABLE users    ADD COLUMN employee_id TEXT`,
    `ALTER TABLE camps    ADD COLUMN company_id INTEGER`,
    `ALTER TABLE camps    ADD COLUMN branch_id INTEGER`,
    `ALTER TABLE bookings ADD COLUMN company_id INTEGER`,

    // H1: referral code on users
    `ALTER TABLE users ADD COLUMN referral_code TEXT`,
    `ALTER TABLE users ADD COLUMN referred_by_code TEXT`,

    // H7: maintenance enhancements
    `ALTER TABLE maintenance_requests ADD COLUMN assigned_to INTEGER`,
    `ALTER TABLE maintenance_requests ADD COLUMN parts_cost REAL DEFAULT 0`,
    `ALTER TABLE maintenance_requests ADD COLUMN labor_cost REAL DEFAULT 0`,
    `ALTER TABLE maintenance_requests ADD COLUMN photo_urls TEXT`,
    `ALTER TABLE maintenance_requests ADD COLUMN resolved_at TEXT`,
    `ALTER TABLE maintenance_requests ADD COLUMN verified_at TEXT`,
  ];
}

module.exports.buildSchemaV2 = buildSchemaV2;
module.exports.additiveAlters = additiveAlters;
