# GG Manager — Amalga oshirilgan ishlar bo‘yicha to‘liq hisobot

## 1. Loyiha haqida qisqa ma'lumot

Ushbu loyiha **Game Club boshqaruv tizimi** sifatida monorepo formatida qurildi. Arxitektura 3 asosiy ilovadan iborat:

- `apps/server` — NestJS backend (PostgreSQL + Prisma)
- `apps/admin` — Electron + React + Tailwind admin panel
- `apps/client` — Tauri (Rust + React) kiosk/shell client

Qo‘shimcha ravishda:
- `docker-compose.yml` orqali PostgreSQL infra
- root workspace scriptlari va CI jarayoni
- real-time WS kanallari (admin/client)
- monitoring va Telegram alerting

---

## 2. Monorepo tuzilmasi va boshlang‘ich infra

### Amalga oshirilgan ishlar

- Monorepo papkalar tuzilmasi to‘liq shakllantirildi.
- Root darajada `package.json` (workspace) qo‘shildi.
- Root `README.md` yangilandi (dev setup va smoke/test bo‘limlari bilan).
- `docker-compose.yml` orqali PostgreSQL 16 konteyneri, healthcheck, volume va port mapping yo‘lga qo‘yildi.

### Qanday amalga oshirildi

- Har bir app alohida package sifatida (`apps/server`, `apps/admin`, `apps/client`) boshqarildi.
- Root scriptlar orqali umumiy boshqaruv qo‘shildi (`server:dev`, `admin:dev`, `client:dev`, `db:up`, `smoke`, `typecheck`, `test`).

---

## 3. Backend (NestJS + Prisma) — asosiy platforma

### 3.1 Prisma schema va DB modeli

#### Amalga oshirilgan ishlar

Prisma schema to‘liq kengaytirildi va biznes modelga moslashtirildi:

- Enumlar:
  - `MachineStatus`
  - `SessionStatus`
  - `Role`
  - `TariffType`
  - `OperatorLogType`
- Modellar:
  - `Computer`, `Account`, `Session`, `Tariff`, `HardwareSnapshot`
  - `Operator`, `OperatorLog`, `PromoCode`, `ClientEvent`, `License`
- Relatsiyalar va indekslar ishlab chiqildi.
- `OperatorLog` uchun reverse relationlar (`Account`, `Session`) qo‘shildi.
- Faza 2 doirasida `Computer` modeliga per-PC threshold fieldlar qo‘shildi:
  - `warnCpuTemp`
  - `warnGpuTemp`
  - `warnRamUsage`
  - `warnDiskUsage`
- Migratsiya yaratildi va qo‘llandi (`computer_hw_thresholds`).

#### Qanday amalga oshirildi

- `apps/server/prisma/schema.prisma` iterativ yangilandi.
- `prisma migrate dev` orqali migration yaratildi va bazaga qo‘llandi.
- Prisma client regenerate qilindi.

---

### 3.2 Type safety va env boshqaruvi

#### Amalga oshirilgan ishlar

- TS strict rejimi ushlab turildi (`strict`, `exactOptionalPropertyTypes`, va boshqalar).
- Nest decoratorlar uchun `experimentalDecorators` va `emitDecoratorMetadata` aktiv holatga keltirildi.
- `env.ts` Zod validatsiyasi kengaytirildi.
- Quyidagi yangi env parametrlari qo‘shildi:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_OWNER_CHAT_ID`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `JWT_ACCESS_TTL`
  - `JWT_REFRESH_TTL`

#### Qanday amalga oshirildi

- Konfiguratsiya markazlashgan holda `ConfigModule.forRoot(validate: parseEnv)` orqali ishlatildi.
- `apps/server/.env.example` real ishga tushirishga mos holatda to‘ldirildi.

---

### 3.3 Billing & Pricing Engine

#### Amalga oshirilgan ishlar

- Pricing engine yozildi (`quoteBestTariff`):
  - Hourly vs Package tanlovi
  - Night tariff window (`22:00–08:00`)
  - package only if cheaper qoidasi
- `BillingService` yozildi:
  - quote hisoblash
  - top-up
  - 100000 UZS da +30 bonus minute
- Pullik operatsiyalar `OperatorLog` ga yoziladigan qilindi.

#### Qanday amalga oshirildi

- Tariflar DB’dan olinadi, kontekstga ko‘ra filterlanadi.
- Narxlar `Prisma.Decimal` bilan hisoblanadi.
- Top-up transaction sifatida (`$transaction`) bajariladi.

---

### 3.4 Session management

#### Amalga oshirilgan ishlar

- `SessionsService`:
  - `startSession`
  - `extendSession`
- Session boshlanishida:
  - balansdan yechish
  - session yaratish
  - computer status `ACTIVE` qilish
- Session uzaytirishda:
  - qo‘shimcha charge
  - `endsAt` update
  - revision increment
- `OperatorLog` yozuvlari qo‘shildi (`SESSION_START`, `SESSION_EXTEND`).

#### Qanday amalga oshirildi

- Barcha kritik amallar transaction ichida bajariladi.
- Realtime event bus orqali adminga update push qilinadi.

---

## 4. Real-time qatlam (WebSocket)

### 4.1 Admin gateway

#### Amalga oshirilgan ishlar

- `/admin` gateway:
  - snapshot push
  - machine-update push
  - hardware-alert push
  - start/extend/lock/reboot command handling
- `MachineView` modelida:
  - `activeSessionId`
  - snapshot hardware qiymatlari

### 4.2 Client gateway

#### Amalga oshirilgan ishlar

- `/client` gateway:
  - `register`
  - `heartbeat`
  - `snapshot`
  - `ack`
- Snapshot kelganda:
  - `HardwareSnapshot` yoziladi
  - computer status/lastSeen yangilanadi
  - critical holatda ERROR + alert trigger

### 4.3 Faza 1 — command ACK/retry

#### Amalga oshirilgan ishlar

- Admin commandlarga `commandId` qo‘shildi.
- Client message schema’ga `ack` qo‘shildi.
- `CommandTrackerService` yozildi:
  - timeout: 2s
  - retry: 3 urinish
  - state tracking
- Admin WS’ga `command-result` event qo‘shildi.
- Admin UI’da pending/sent/acked/failed holatlar toast bilan ko‘rsatildi.

#### Qanday amalga oshirildi

- Server lock/reboot ni bevosita `sendCommand` emas, tracker orqali dispatch qiladi.
- Client commandni bajargandan keyin ACK yuboradi.
- ACK kelmasa retry va yakunda failed holat qaytadi.

---

## 5. Auth + RBAC (Faza 3)

### Amalga oshirilgan ishlar

Backendda to‘liq auth qatlam qo‘shildi:

- `AuthModule` yaratildi.
- `POST /auth/login`
- `POST /auth/refresh`
- `JwtAuthGuard`, `RolesGuard`, `Roles` decorator
- WS handshake token validatsiyasi (`/admin?token=`)
- Seed operatorlar (owner/admin/operator)

Admin frontendda:
- `AuthProvider`
- `Login` sahifasi
- token asosida WS ulanish
- logout oqimi
- `AccountPicker` (typeahead) orqali `/accounts/search`

### Qanday amalga oshirildi

- Tokenlar `@nestjs/jwt` bilan sign/verify qilinadi.
- Parollar `bcryptjs` orqali tekshiriladi.
- REST endpointlar guardlar bilan himoyalandi.
- Admin gateway connection vaqtida JWT tekshiradi va role asosida ruxsat beradi.

---

## 6. Billing/Cashier yakunlash (Faza 4)

### Amalga oshirilgan ishlar

Yangi endpointlar:

- `GET /billing/tariffs`
- `POST /billing/tariffs`
- `PUT /billing/tariffs/:id`
- `DELETE /billing/tariffs/:id`
- `POST /billing/topup`
- `POST /billing/promo/apply`

Yangi service:
- `PromoService` (promo tekshirish, usage limit, expire check, apply, log)

Admin UI:
- `TariffsPage` (CRUD)
- `CashierPage` (top-up + optional promo)
- Dashboard ichida sahifalar navigatsiyasi (`grid/cashier/tariffs`)

### Qanday amalga oshirildi

- Inputlar Zod bilan parse qilinadi.
- Access role bo‘yicha ajratildi (`OWNER|ADMIN|OPERATOR`).
- UI fetch wrapper bilan bearer token orqali API bilan ishlaydi.

---

## 7. Monitoring va alertlar (Faza 5)

### Amalga oshirilgan ishlar

- `AlertDedupeService` qo‘shildi (default 5 min cooldown).
- Telegram service’da `sendHardwareAlert` va `sendServerAlert` dedupe bilan ishlaydi.
- `ServerHealthService` qo‘shildi:
  - har 30s `SELECT 1`
  - xatoda Telegram alert
- Global exception filter:
  - `TelegramExceptionFilter`
  - 5xx xatolarni Telegramga yuboradi.

### Qanday amalga oshirildi

- `ScheduleModule` cron ishlarini boshqaradi.
- Filter `main.ts` da `useGlobalFilters(...)` orqali global ro‘yxatdan o‘tkazildi.

---

## 8. Tauri client hardening (Faza 6)

### 8.1 Tauri client ichki funksiyalar

#### Amalga oshirilgan ishlar

- Kiosk mode UI (fullscreen, decorations off, alwaysOnTop, skipTaskbar)
- Security hooks:
  - Alt+Tab, Alt+F4, Win key bloklash
  - Task Manager killer loop
- LAN sync (`tokio-tungstenite`):
  - register/heartbeat/snapshot
  - command qabul qilish
  - lock/reboot real execute
  - ACK yuborish
- Snapshotlar `sysinfo` asosida real CPU/RAM/Disk qiymatlarini yuboradi.

### 8.2 USB hardening

#### Amalga oshirilgan ishlar

- USB monitor arrival eventlarni ushlaydi.
- Whitelist bo‘lmagan device uchun `Disable-PnpDevice` chaqirish qo‘shildi.

### 8.3 Tashqi watchdog service

#### Amalga oshirilgan ishlar

- `apps/client/src-watchdog` alohida Rust crate yaratildi.
- `windows-service` asosida service process yozildi.
- U `gg_manager_client.exe` processini tekshiradi va kerak bo‘lsa relaunch qiladi.
- Scriptlar qo‘shildi:
  - `apps/client/scripts/install-watchdog.ps1`
  - `apps/client/scripts/uninstall-watchdog.ps1`

---

## 9. Infra, testlar va CI (Faza 7)

### Amalga oshirilgan ishlar

- Root workspace scriptlar qo‘shildi.
- `apps/server` uchun Jest infra qo‘shildi:
  - `jest.config.cjs`
  - `test/pricing.engine.spec.ts`
  - `test/billing.service.spec.ts`
  - `test/admin-ws.e2e.spec.ts`
- CI pipeline qo‘shildi:
  - `.github/workflows/ci.yml`
  - postgres service, typecheck, test run

### Qanday amalga oshirildi

- `ts-jest` bilan TS testlar ishlatiladi.
- GitHub Actions’da env va postgres service berilgan.

---

## 10. Qo‘shimcha endpointlar va operatsion qo‘llab-quvvatlash

- `GET /accounts/search` endpoint (AccountPicker uchun)
- `GET /usb-whitelist` endpoint (auth + role guard bilan)
- `ws-smoke-test.js` yangilandi (auth + commandId/ack flow)

---

## 11. Verifikatsiya (bajarilgan tekshiruvlar)

### Server
- `npm run typecheck` — muvaffaqiyatli
- `npm test` — muvaffaqiyatli (3 suite, 4 test)

### Admin
- `npm run typecheck` — muvaffaqiyatli

### Client
- `apps/client/src-tauri` da `cargo check` — muvaffaqiyatli
- `apps/client/src-watchdog` da `cargo check` — muvaffaqiyatli

### Smoke
- WS smoke test orqali admin->server->client command oqimi tekshirilgan.

---

## 12. Hozirgi yakuniy holat

Closing Plan’dagi barcha 7 faza bajarilgan holatga keltirildi:

1. Command ACK + retry + feedback — ✅
2. Sysinfo + thresholds + migration — ✅
3. JWT + RBAC + WS token + frontend auth — ✅
4. Billing/Cashier CRUD + promo — ✅
5. Telegram dedupe + health + exception filter — ✅
6. Watchdog service + USB disable — ✅
7. Monorepo scripts + testlar + CI — ✅

---

## 13. Keyingi tavsiya etiladigan ishlar (post-implementation)

- Production uchun seeded user parollarini majburiy almashtirish.
- JWT secretlarni secret manager orqali boshqarish.
- `admin-ws.e2e.spec.ts` ni real integration testga kengaytirish.
- USB whitelistni DB/API orqali dinamik boshqarishga o‘tkazish.
- Promocode ni pricing engine context bilan chuqurroq integratsiya qilish (session-level charge modeli bilan).

