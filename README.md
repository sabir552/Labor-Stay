# LaborStay 🏕️

A production-ready, Booking.com-style marketplace for **labour camp accommodation**, **equipment rental**, and **services** across **Saudi Arabia** — built end-to-end in 12 incremental pieces.

> **Status: ✅ Complete** — backend + frontend, all 3 stages, all 4 dashboards, full i18n (EN/AR/UR with RTL).

---

## 🎯 What's inside

### Stage 1 — Camp booking platform
Workers search labour camps across 10 KSA cities, filter by amenities/price/nationality/availability, book online with secure Tap Payments, receive ZATCA-compliant tax invoices and QR codes for digital check-in. Owners manage camps, rooms, bookings, dynamic pricing (weekend/Ramadan/Hajj), occupancy and earnings.

### Stage 2 — Equipment rental
Generators, dewatering systems, scaffolding, compressors, tower lights, water pumps, tools — rented daily/weekly/monthly with operator & delivery options.

### Stage 3 — Services marketplace
Catering, transport, security, cleaning, laundry, labour supply, portable offices, container rental — full RFQ → quote → accept flow.

---

## 🏗️ Tech stack

| Layer | Tech |
|---|---|
| **Frontend** | React 18 + Vite + React Router v6 + Tailwind CSS |
| **i18n** | i18next — English / العربية / اردو with full RTL |
| **Backend** | Node.js + Express |
| **Database** | PostgreSQL **or** SQLite (toggle via `DB_DRIVER`) |
| **Auth** | JWT + bcrypt |
| **Files** | Multer (Iqama photos, camp/room/equipment photos, docs) |
| **Maps** | Google Maps embed (with OpenStreetMap fallback when no API key) |
| **Payments** | Tap Payments stub (Mada, STC Pay, Visa, Mastercard, SADAD) |
| **Email** | Nodemailer (console fallback in dev) |
| **PDF / QR** | pdfkit (ZATCA-style receipts + contracts), qrcode |

---

## ⚡ Quick start (5 minutes, zero infra)

```bash
cd laborstay
npm run install:all              # installs backend + frontend deps via workspaces

# Backend setup (uses SQLite by default — no Postgres needed)
cp backend/.env.example backend/.env
npm run db:setup
npm run db:seed                  # creates 104 demo records

# Run both servers
npm run dev
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000

---

## 🐘 Switch to PostgreSQL

In `backend/.env`:

```env
DB_DRIVER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=laborstay
DB_USER=postgres
DB_PASSWORD=postgres
```

Then `createdb laborstay && npm run db:setup && npm run db:seed`. The same SQL works on both databases — the adapter auto-translates placeholders.

---

## 🔑 Demo credentials

After running `npm run db:seed`:

| Role | Email | Password |
|---|---|---|
| 🛡️ **Admin** | admin@laborstay.sa | Admin@123 |
| 🏢 **Camp owner** | owner@riyadhcamps.sa | Owner@123 |
| 🚛 **Service provider** | catering@providersa.sa | Provider@123 |
| 🧰 **Worker** | worker@email.com | Worker@123 |

The login page has clickable demo-credential rows that auto-fill the form.

---

## 📁 Project structure

```
laborstay/
├── backend/                        ← Node.js + Express API
│   ├── config/
│   │   ├── constants.js            ← VAT 15%, commission 10%, KSA cities/regions
│   │   ├── database.js             ← Postgres + SQLite unified adapter
│   │   └── schema.js               ← 24 tables, cross-dialect SQL
│   ├── middleware/                 ← auth, upload (Multer), rate-limit, audit-log
│   ├── routes/                     ← 13 route modules:
│   │   ├── auth.js   users.js   camps.js     rooms.js
│   │   ├── bookings.js   payments.js   reviews.js   messages.js
│   │   ├── notifications.js   equipment.js   services.js
│   │   ├── admin.js   waitingList.js
│   ├── utils/                      ← vatCalculator, dynamicPricing, qrGenerator,
│   │                                  pdfGenerator (ZATCA receipts + contracts),
│   │                                  emailService (templates + in-app notify)
│   ├── scripts/
│   │   ├── setupDatabase.js        ← create/reset tables
│   │   └── seedData.js             ← 104 realistic demo records
│   └── server.js                   ← lazy route loader, helmet, cors, rate-limit
│
├── frontend/                       ← React 18 + Vite SPA
│   ├── src/
│   │   ├── api/client.js           ← axios with JWT interceptor
│   │   ├── components/
│   │   │   ├── common/             ← Logo, Modal, Spinner, Skeleton, StarRating,
│   │   │   │                          EmptyState, ConfirmDialog
│   │   │   ├── camp/               ← CampCard, CampGallery, RoomCard, BookingWidget
│   │   │   └── layout/             ← Navbar, Footer, Sidebar, LanguageSwitcher,
│   │   │                              NotificationBell, UserMenu, RequireAuth,
│   │   │                              DashboardLayout (shared by all 4 dashboards)
│   │   ├── context/                ← AuthContext, ToastContext
│   │   ├── locales/                ← en.json, ar.json, ur.json (130+ keys each)
│   │   ├── pages/
│   │   │   ├── public/             ← Home, Search, CampDetail, EquipmentList,
│   │   │   │                          EquipmentDetail, ServicesList, ServiceDetail,
│   │   │   │                          Login, Register, About, Contact, Legal
│   │   │   ├── worker/             ← Home, Bookings, BookingDetail, Profile,
│   │   │   │                          Messages, Notifications, WaitingList,
│   │   │   │                          MyEquipmentBookings, MyServiceRequests
│   │   │   ├── owner/              ← Home, MyCamps, CampForm, CampRooms,
│   │   │   │                          OwnerBookings (list+detail), OccupancyMap,
│   │   │   │                          Earnings, OwnerProfile
│   │   │   ├── admin/              ← Home, Users, CampsVerification, AllBookings,
│   │   │   │                          Revenue, FeaturedListings, Disputes,
│   │   │   │                          AuditLogs, Announcements
│   │   │   └── provider/           ← Home, MyServices, IncomingRequests
│   │   ├── utils/                  ← formatters (SAR, dates DD/MM/YYYY, status badges),
│   │   │                              helpers (safeImage, debounce, classNames)
│   │   ├── i18n.js                 ← RTL auto-flip on language change
│   │   ├── App.jsx                 ← all routes
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js          ← Navy + Gold palette
│   └── vite.config.js              ← proxy /api + /uploads → backend
│
├── package.json                    ← workspace root (concurrently)
└── README.md
```

---

## 🌐 i18n & RTL

Three languages bundled, switchable from the navbar:
- **English** (LTR, Inter font)
- **العربية** (RTL, Cairo font, layout flips automatically)
- **اردو** (RTL, Cairo font)

Switching the language:
1. updates `<html lang>` and `<html dir>`
2. swaps the body font automatically (CSS rule on `html[dir='rtl']`)
3. flips Tailwind logical properties (`ms-*`, `me-*`, `ltr:` / `rtl:`)
4. persists to localStorage and (if logged in) to the user's `preferred_language`

---

## 🇸🇦 Saudi-specific compliance

| Feature | Implementation |
|---|---|
| **VAT 15%** | Applied to all bookings — `utils/vatCalculator.js` |
| **Platform commission 10%** | Deducted from owner share, auto-shown in earnings |
| **ZATCA tax invoice** | PDF receipts with invoice number `INV-YYYY-#########` |
| **Iqama verification** | Worker uploads photo → admin verifies → ✓ badge |
| **Iqama expiry alert** | Banner when ≤ 30 days remain |
| **PDPL consent** | Checkbox enforced on registration |
| **KSA cities + 13 regions** | Pre-loaded in seed + forms |
| **Nationality preference** | Per-camp filter for owner's worker preferences |
| **MOHR fields** | Licence number, capacity, emergency contact |
| **Payment methods** | Mada, STC Pay, Visa, Mastercard, SADAD (Tap stub) |

---

## 💼 Business flows verified

1. ✅ **Worker books a camp** — search → quote → reserve → pay (Tap webhook) → QR check-in → checkout → review
2. ✅ **Owner approves & manages** — new camp (pending) → admin approval → room CRUD → approve booking → check-in/out → see net earnings (gross − VAT − 10% commission)
3. ✅ **Dynamic pricing** — Thu/Fri/Sat = +20% (weekend rule applied per-night in quote breakdown)
4. ✅ **Waiting list** — full room → auto-add to waiting list → checkout releases beds → notifies waitlisted workers
5. ✅ **Equipment rental** — browse → book daily/weekly/monthly → owner confirms → auto-syncs availability
6. ✅ **Services RFQ** — worker submits → provider quotes → worker accepts/declines → notifications both ways
7. ✅ **Admin operations** — verify users + Iqamas, approve camps, feature/unfeature, resolve disputes, broadcast announcements, refund payments
8. ✅ **Auto-cancellation** — pending bookings unpaid >24h are auto-cancelled by cron (every 30 min)

---

## 🔌 API endpoints (~75)

**Base URL:** `http://localhost:5000/api`

```
Auth          POST /auth/{register,login,logout,forgot-password,reset-password}
              GET  /auth/me
              PUT  /auth/update-profile

Users         GET  /users/me     PUT /users/me
              POST /users/me/iqama-photo     PUT /users/me/language

Camps         GET  /camps/{search,featured,owner/my-camps,:id}
              POST/PUT/DELETE /camps  +  POST /camps/:id/photos

Rooms         GET  /rooms/camp/:id    /rooms/:id
              POST /rooms/camp/:id    PUT/DELETE /rooms/:id
              POST /rooms/:id/quote   /rooms/:id/pricing-rules

Bookings      POST /bookings     GET /bookings/my-bookings    /bookings/:id
              PUT  /bookings/:id/{status,checkin,checkout,cancel}
              GET  /bookings/:id/{receipt,contract,qr-code}

Payments      POST /payments/{initiate,callback}
              GET  /payments/my-payments
              POST /payments/:id/refund

Reviews       POST /reviews   GET /reviews/camp/:id
              PUT  /reviews/:id/reply   DELETE /reviews/:id

Messages      POST /messages   GET /messages/conversations
              GET  /messages/:conversationId
              PUT  /messages/:conversationId/read

Notifications GET  /notifications    PUT /:id/read    PUT /read-all    DELETE /:id

Equipment     GET  /equipment   /equipment/:id   /equipment/categories
              POST/PUT/DELETE /equipment    POST /equipment/:id/photos
              POST /equipment/bookings    GET /equipment/bookings/my
              PUT  /equipment/bookings/:id/status

Services      GET  /services   /services/:id   /services/categories
              POST/PUT/DELETE /services
              POST /services/requests   GET /services/requests/my
              PUT  /services/requests/:id/{quote,status}

Waiting list  POST /waiting-list    GET /waiting-list/my-list    DELETE /:id

Admin         GET  /admin/dashboard
              GET  /admin/users         PUT /admin/users/:id/{verify,toggle-active}
              GET  /admin/camps         PUT /admin/camps/:id/{verify,featured}
              GET  /admin/bookings      GET /admin/revenue
              GET  /admin/audit-logs
              GET  /admin/disputes      PUT /admin/disputes/:id
              GET/POST /admin/announcements
```

---

## 📊 Final stats

| Metric | Value |
|---|---|
| **Total files (excluding node_modules)** | 92 |
| **Lines of code** | ~14,500 |
| **Backend routes** | 13 modules, ~75 endpoints |
| **Database tables** | 24 |
| **Frontend pages** | 36 |
| **i18n keys** | 130+ × 3 languages |
| **Production bundle (gzipped)** | 141 KB JS + 7 KB CSS |
| **Demo records** | 104 (1 admin, 5 owners, 3 providers, 20 workers, 11 camps, 44 rooms, 31 bookings, 16 reviews, 5 equipment, 7 services) |

---

## 📜 npm scripts

| Command | What it does |
|---|---|
| `npm run install:all` | Install backend + frontend deps via workspaces |
| `npm run db:setup` | Create database tables |
| `npm run db:seed` | Insert demo data (idempotent) |
| `npm --prefix backend run db:reset` | Drop + recreate + reseed |
| `npm run dev` | Run backend (5000) + frontend (3000) in parallel |
| `npm run dev:backend` | Backend only (nodemon) |
| `npm run dev:frontend` | Frontend only (Vite) |
| `npm run build` | Production build of frontend → `dist/` |

---

## 🔐 Environment variables

See `backend/.env.example` for all options. The most important:

```env
DB_DRIVER=sqlite                        # or "postgres"
JWT_SECRET=change_me
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY    # optional — falls back to OpenStreetMap
TAP_SECRET_KEY=sk_test_YOUR_TAP_SECRET_KEY  # optional — payment is simulated in dev
TAP_PUBLIC_KEY=pk_test_YOUR_TAP_PUBLIC_KEY
SMTP_HOST=smtp.gmail.com                # optional — falls back to console log
COMMISSION_RATE=0.10
VAT_RATE=0.15
```

---

## 🗺️ Build progress (all done!)

- [x] **Piece 1** — Scaffolding, DB schema (Postgres + SQLite), setup script
- [x] **Piece 2** — Backend core (middleware, utils)
- [x] **Piece 3** — Auth + Users + 104-record demo seed
- [x] **Piece 4** — Camps + Rooms + dynamic pricing engine
- [x] **Piece 5** — Bookings + Payments + QR + PDF receipts/contracts
- [x] **Piece 6** — Reviews, Messages, Notifications, Equipment, Services, Admin
- [x] **Piece 7** — Frontend scaffold + i18n (EN/AR/UR with RTL) + Tailwind + Auth + Navbar/Footer
- [x] **Piece 8** — Public pages (Search, Camp Detail, Login, Register, About, Contact, Terms, Privacy)
- [x] **Piece 9** — Worker dashboard (7 pages)
- [x] **Piece 10** — Owner dashboard (10 pages)
- [x] **Piece 11** — Admin dashboard (9 pages)
- [x] **Piece 12** — Equipment & Services marketplace + Provider dashboard + final polish ✅

---

## 📸 Visual preview

A preview image of the home page is at `screenshots/home-preview.png`.

To see the full UI live, run `npm run dev` and open http://localhost:3000.

---

## 📄 License

This is a custom-built application for the LaborStay client. All code and content © LaborStay.

---

## 🚀 v2.0 follow-up build (Pieces 13-22)

Implementing the **complete RFQ follow-up prompt** (`laborstay_complete_prompt.txt`).
Sections A-J: ~38 new tables, ~60 new endpoints, ~40 new pages, 20+ integrations.

- [x] **Piece 13** — Foundation: schema v2 (38 tables), scheduler, cache, 2FA + sessions + IP blocking, PDPL data export/deletion, CSV exports, `/health/detailed`, all new env vars
- [x] **Piece 14** — Agreement signing (PDF + gate), expiry timer, waitlist auto-notify, virtual tour, room dimensions, enhanced nearby POIs (A1-A3, B1-B2, B5)
- [x] **Piece 15** — Catering module (B3): backend (10 endpoints, menu/packages/orders/attendance/reports) + 3 frontend pages
- [x] **Piece 16** — Transportation module (B4): backend (14 endpoints) + 3 frontend pages, capacity-aware seat booking + GPS tracking
- [x] **Piece 17** — Worker service requests (12 types), surveys with NPS, renewal flow, notification preferences (C1-C3, H10)
- [x] **Piece 18** — Housekeeping (tasks + recurring schedules with auto-generation), Visitor management (entry/exit logs with search), Staff management (CRUD + attendance + shifts + payroll with NET computation), D4 expiry alerts admin dashboard with cron-driven notifications
- [x] **Piece 19** — Multi-currency (9 currencies + live rates + fallback), corporate accounts with credit limits + bulk booking + monthly invoices, payout requests, ZATCA-compliant VAT report, full P&L/commission/outstanding/refunds dashboards (E1-E5)
- [x] **Piece 20** — Referrals + loyalty tiers (Bronze/Silver/Gold), camp comparison, price alerts with cron matching, auto-computed badges, enhanced maintenance + disputes flow, booking calendars (H1-H9)
- [x] **Piece 21** — Chatbot (WhatsApp + OpenAI), CCTV, access cards + entry/exit logs, biometric enrollment, ERP sync layer (SAP/Odoo/Zoho), multi-company + branches, utility meter tracking with threshold alerts (D5, F4-F6, G1-G3) — all with graceful no-op fallbacks
- [ ] Piece 22 — All admin/owner/worker new pages wired, i18n, final smoke test, README

