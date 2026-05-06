# GG Manager — To'liq imkoniyatlar bo'yicha yakuniy hisobot

## 1) Loyiha maqsadi

**GG Manager** — bu game club/internet cafe uchun markazlashgan boshqaruv platformasi.
Tizim klubdagi barcha PC'larni, sessiyalarni, billingni, operator amallarini, real-time monitoringni va avariya holatlarini bitta ekotizimda boshqaradi.

Platforma 3 asosiy ilovadan iborat:

- `apps/server` — NestJS backend (PostgreSQL + Prisma)
- `apps/admin` — Electron + React admin dashboard
- `apps/client` — Tauri (Rust + React) kiosk/shell client

Qo'shimcha yordamchi komponentlar:

- Docker asosida PostgreSQL
- Telegram bot orqali alert/report
- Windows watchdog service
- Monorepo scripts + Jest + GitHub Actions CI

---

## 2) Arxitektura va texnologik stack

### Backend (Server)
- **NestJS 11**
- **Prisma ORM**
- **PostgreSQL**
- **WebSocket (`ws`)** adapter
- **Zod** orqali env va payload validatsiya
- **JWT auth + RBAC**
- **Telegraf** (Telegram bot)
- **Schedule/Cron** servislar

### Admin
- **Electron** (desktop shell)
- **React + TypeScript**
- **Vite**
- **Tailwind CSS**
- **Framer Motion** animatsiya
- **Lucide-react** ikonlar

### Client
- **Tauri**
- **Rust** (`winapi`, `tokio`, `tokio-tungstenite`, `sysinfo`)
- **React + TS** frontend shell
- Windows API hooklar (kiosk/security)

---

## 3) Ma'lumotlar bazasi (Prisma) — to'liq domen modeli

Tizim quyidagi asosiy entity'larni boshqaradi:

- **Computer** — klubdagi PC metadata va holat
- **Account** — mijoz hisob yozuvi (balance, bonus)
- **Session** — o'yin seansi (start/end/status)
- **Tariff** — narx modellari (hourly/package/night/bonus)
- **HardwareSnapshot** — clientdan keluvchi telemetriya
- **Operator** — xodimlar (OWNER/ADMIN/OPERATOR)
- **OperatorLog** — operatsion audit trail
- **PromoCode** — promo logikasi
- **ClientEvent** — client eventlar
- **License** — litsenziya ma'lumotlari

Enumlar:
- `MachineStatus`
- `SessionStatus`
- `Role`
- `TariffType`
- `OperatorLogType`

Faza 2 kengaytmasi:
- `Computer.warnCpuTemp`
- `Computer.warnGpuTemp`
- `Computer.warnRamUsage`
- `Computer.warnDiskUsage`

Bu fieldlar per-PC threshold sifatida ishlaydi.

---

## 4) Auth, xavfsizlik va ruxsatlar

## 4.1 JWT Auth
Mavjud endpointlar:
- `POST /auth/login`
- `POST /auth/refresh`

Natija:
- `accessToken`
- `refreshToken`
- `user` (id/username/role)

## 4.2 RBAC
Guardlar:
- `JwtAuthGuard`
- `RolesGuard`

Role decorator:
- `@Roles('OWNER'|'ADMIN'|'OPERATOR')`

REST endpointlar role bo'yicha himoyalangan.

## 4.3 Admin WebSocket handshake auth
Admin websocket ulanishi token bilan tekshiriladi:
- `ws://.../admin?token=<JWT>`

Token yaroqsiz bo'lsa ulanish rad etiladi.

## 4.4 Seed operatorlar
Tizim boshlanishida (agar yo'q bo'lsa):
- `owner / owner123`
- `admin / admin123`
- `operator / operator123`

---

## 5) Realtime platforma (WebSocket) imkoniyatlari

## 5.1 `/admin` gateway
Admin panel uchun:
- boshlang'ich `snapshot`
- `machine-update`
- `hardware-alert`
- `command-result`

Admin yuboradigan commandlar:
- `startSession`
- `extendTime`
- `lock`
- `reboot`

## 5.2 `/client` gateway
Client agentlar uchun:
- `register`
- `heartbeat`
- `snapshot`
- `ack`

Clientlar online/offline holati serverda avtomatik kuzatiladi.

## 5.3 Command ACK + Retry tizimi
Faza 1 bo'yicha to'liq ishlaydi:
- Har command `commandId` bilan yuboriladi
- Client bajarilgach `ack` qaytaradi (`success/failed`)
- ACK bo'lmasa retry (3 urinish, 2 soniya timeout)
- Admin `command-result` orqali yakuniy statusni oladi:
  - `sent`
  - `acked`
  - `failed`

---

## 6) Sessions va PC boshqaruvi

Session oqimi:
- `startSession`
  - tariff quote
  - balansdan yechish
  - session ochish
  - computer statusni `ACTIVE` qilish
  - operator log yozish
- `extendSession`
  - qo'shimcha quote
  - balansdan yechish
  - `endsAt` uzaytirish
  - operator log yozish

Har amaldan keyin realtime `machine-update` push qilinadi.

---

## 7) Billing, cashier va tarif tizimi

## 7.1 Pricing engine
Qo'llab-quvvatlanadi:
- **Hourly vs Package** tanlovi
- **Night window** (`22:00 -> 08:00`)
- package faqat haqiqatan arzon bo'lsa ustunlik

## 7.2 Top-up bonus logika
- `>= 100000` top-up bo'lsa `+30 bonus minutes`

## 7.3 Endpointlar
- `GET /billing/tariffs`
- `POST /billing/tariffs`
- `PUT /billing/tariffs/:id`
- `DELETE /billing/tariffs/:id`
- `POST /billing/topup`
- `POST /billing/promo/apply`

## 7.4 Promo qo'llash
- promo mavjudligi
- expiration
- max uses
- usage increment
- bonusPercent / bonusMinutes qo'llash
- operator logga yozish

## 7.5 Audit
Har pul/sessiya buyruqlari `OperatorLog`da saqlanadi.

---

## 8) Admin Dashboard — UI/UX imkoniyatlari

Admin interfeys hozir quyidagilarni beradi:

- To'liq ruscha operatsion UI
- 100 ta PC uchun compact grid
- Status ranglari:
  - `Свободно`
  - `Занято`
  - `Не в сети`
- Holat ikonlari:
  - `Monitor`
  - `MonitorOff`
  - `AlertTriangle`
- Hover quick-actions:
  - Start (`Play`)
  - Stop (`Square`, UI placeholder)
  - Extend (`Clock`)
  - Lock (`Lock`)
  - Reboot (`RefreshCw`)
  - Shutdown (`Power`, server tomonda hali active emas)
- Filter panel:
  - `Все`
  - `Свободные`
  - `Занятые`
  - `Ошибки`
- Command Timeline (o'ng panel): oxirgi 10 buyruq
  - `Отправлено`
  - `Выполнено`
  - `Ошибка`
- Navigatsiya:
  - `Панель`
  - `Пользователи`
  - `Биллинг`
  - `Настройки`
  - `Тарифы`
- Cashier sahifasi
- Tariff CRUD sahifasi
- Account picker/typeahead
- Toast va modal flow
- Framer Motion transitionlar
- Dark high-tech theme (Slate + Blue accent)

---

## 9) Client Shell — UX lifecycle imkoniyatlari

Client shell to'liq ekranli kiosk uslubga o'tkazilgan.

State'lar:
- `LockedScreen` (login)
- `ActiveSession`
- `WarningScreen` (10 min yoki kam)
- `ExpiredScreen`

Qo'shimcha UX:
- Server aloqasi yo'qolsa qizil banner:
  - `Связь с сервером потеряна, повторная попытка...`
- Visual timer ranglari:
  - >30 min — yashil
  - <15 min — sariq/oranj
  - <5 min — qizil
- Launcher placeholder (gaming tile'lar)
- Ruscha lokalizatsiya
- Smooth transitionlar

---

## 10) Client Rust agent imkoniyatlari

## 10.1 LAN sync
- serverga websocket ulanish
- register/heartbeat/snapshot yuborish
- server commandlarini qabul qilish
- lock/reboot commandni OS darajasida bajarish
- ACK qaytarish

## 10.2 Security hooks
- Alt+Tab, Alt+F4, Win key bloklash hooklari
- Task Manager killer loop

## 10.3 USB monitoring
- Device arrival event capture
- whitelistga tushmagan qurilma uchun PowerShell orqali `Disable-PnpDevice` urinish

## 10.4 Real hardware telemetry
`sysinfo` orqali:
- CPU usage
- RAM usage
- Disk usage

Eslatma:
- Windowsda GPU temp / aniq CPU temp support cheklangan bo'lishi mumkin.

---

## 11) Alerting va observability

## 11.1 Telegram bot
Imkoniyatlar:
- `/status` komandasi
- Kunlik report (`00:00`, Asia/Tashkent)
  - tushum
  - eng band PC
  - operator activity
- hardware alert
- server alert

## 11.2 Alert dedupe
- 5 daqiqa cooldown
- bir xil alert spam bo'lishining oldini oladi

## 11.3 Health watcher
- har 30 sekund DB check (`SELECT 1`)
- xatoda Telegram server alert
- tiklanganda "restored" alert

## 11.4 Global exception filter
- 5xx exceptionlar Telegramga yuboriladi

---

## 12) Infra, build, deployment imkoniyatlari

## 12.1 Monorepo scripts
Root scriptlar:
- `server:dev`
- `admin:dev`
- `client:dev`
- `db:up`
- `smoke`
- `typecheck`
- `test`

## 12.2 Docker DB
- postgres container orqali tez local deploy

## 12.3 Tauri build
- Client uchun tayyor installer/exe chiqarish mumkin

## 12.4 Watchdog Windows service
Alohida crate:
- `apps/client/src-watchdog`

Scriptlar:
- `apps/client/scripts/install-watchdog.ps1`
- `apps/client/scripts/uninstall-watchdog.ps1`

---

## 13) Test va sifat nazorati

## 13.1 Type safety
- server strict tsconfig
- admin/client typecheck

## 13.2 Jest testlar
`apps/server/test`:
- `pricing.engine.spec.ts`
- `billing.service.spec.ts`
- `admin-ws.e2e.spec.ts` (minimal placeholder)

## 13.3 Smoke test
- `apps/server/scripts/ws-smoke-test.js`
- auth + ws + command ack oqimini tekshiradi

## 13.4 CI
- `.github/workflows/ci.yml`
- Node setup
- postgres service
- typecheck + test

---

## 14) Qo'shimcha endpointlar

- `GET /accounts/search` — AccountPicker uchun
- `GET /usb-whitelist` — USB whitelist olish (auth + role)

---

## 15) Tizimdagi amaliy operatsion oqim (E2E)

1. Operator admin panelga JWT login qiladi.
2. Admin dashboard realtime snapshot oladi.
3. Client PC'lar register/heartbeat/snapshot yuboradi.
4. Operator session/buyruq yuboradi (`commandId`).
5. Server dispatch + tracker/retry qiladi.
6. Client commandni bajarib ACK qaytaradi.
7. Admin timeline/toast orqali yakuniy holatni ko'radi.
8. Billing va loglar DB'da saqlanadi.
9. Hardware/server muammo bo'lsa Telegram alert ketadi.

---

## 16) Hozirgi real cheklovlar (transparent holat)

- `Shutdown` tugmasi UI'da bor, server command sifatida hali to'liq implement qilinmagan.
- `Users` va `Settings` bo'limlari navigatsiyada bor, to'liq biznes funktsiyasi hali kengaytiriladi.
- `admin-ws.e2e.spec.ts` hozircha placeholder test.
- Client frontend connection banner `navigator.onLine` asosida; websocket-level granular reconnect statusini yanada chuqurlashtirish mumkin.
- Windows telemetriyada GPU/CPU temp hardware-vendorga bog'liq cheklovlarga ega.

---

## 17) Productionga chiqarishdan oldin majburiy tavsiyalar

- Seed user parollarini almashtirish.
- JWT secretlarni strong random qiymatlarga o'tkazish.
- `localhost` URLlarni LAN/IP yoki config/env asosiga o'tkazish.
- TLS/reverse-proxy qatlamini qo'shish.
- DB backup/restore protsedurasini rasmiylashtirish.
- `admin-ws.e2e` testni real integration scenario bilan to'ldirish.

---

## 18) Xulosa

GG Manager hozirgi holatda quyidagi sinfdagi tizimga aylangan:

- **Realtime PC monitoring platformasi**
- **Session/billing automation engine**
- **Operator audit-log tizimi**
- **Auth + RBAC himoyalangan admin boshqaruv paneli**
- **Kiosk client + OS-level command execution**
- **Telegram alerting va health observability**
- **CI/test/build workflow bilan qo'llab-quvvatlangan monorepo**

Ya'ni loyiha MVPdan ancha yuqori darajada: real klubda pilot va bosqichli production uchun tayyor bazaviy platforma shakllangan.
