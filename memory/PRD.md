# MediTrack - Product Requirements Document

## Original Problem Statement
Medicine management app that tracks stock, weekly schedules with dosing times (Morning, Noon, Evening, Night), expiry status indicators, stock reminders, PIN/biometric login, and email-based PIN reset.

## User Personas
- Primary: Danish-speaking users managing multiple medications
- Needs: Reliable stock tracking, printable schedules, multi-device access

## Core Requirements
- PIN-based authentication with email reset
- Medicine inventory with stock tracking & expiry indicators
- Weekly schedule with time-of-day slots and per-day dosing
- Special ordinations (date-based recurring schedules) with customizable dose (whole/half pills)
- Downloadable PDF weekly schedule (server-side, reportlab)
- Automatic nightly stock deduction (cron at 23:00) with email notification for low stock
- Dark theme, Danish/English language support
- Medicine unit types: Piller, Stk, Enheder
- Dosage units preserved as-is (mg, mcg, g) everywhere

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn/UI, lucide-react, react-i18next
- Backend: FastAPI, Pydantic, MongoDB (motor), reportlab (PDF)
- Deployment: Contabo VPS (Ubuntu 24.04), Nginx, systemd, cron
- Domain: meditrack.deele.dk (with SSL/HTTPS via Let's Encrypt)
- Email: Resend API

## Architecture
```
/opt/meditrack/ (production at meditrack.deele.dk)
/app/ (development)
├── backend/server.py (all routes, models, PDF gen, cron, email notifications)
├── frontend/src/
│   ├── components/ (Dashboard, Medicines, Schedule, PrintSchedule, Settings, AuthScreen, Navigation)
│   ├── context/AppContext.js
│   └── i18n/translations.js
```

## Key API Endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/login-email
- POST /api/auth/request-pin-reset, /api/auth/confirm-pin-reset
- CRUD /api/medicines/{user_id} (with unit field: piller/stk/enheder)
- CRUD /api/schedule/{user_id} (with special_ordination.whole/half)
- GET /api/schedule/{user_id}/pdf
- POST /api/schedule/{user_id}/email-pdf
- GET /api/cron/update-stocks (unauthenticated, nightly cron, sends low-stock emails)

## DB Schema
- users: { user_id, pin_hash, name, email, language, created_at }
- medicines: { medicine_id, user_id, name, dosage, unit, stock_count, reminder_days_before, stock_updated_at, ... }
- schedule_entries: { entry_id, user_id, medicine_id, slot_id, day_doses, special_ordination: {start_date, end_date, repeat, whole, half} }
- time_slots: { slot_id, user_id, name, time, order }

## What's Implemented
- Full auth system (PIN, email login, reset)
- Medicine CRUD with unit types (piller/stk/enheder)
- Dosage units (mg, mcg, g) preserved as-is everywhere
- Schedule with per-day dosing and special ordinations with customizable dose
- Dashboard with week navigation showing correct dose per ordination
- PDF download (server-side reportlab) with correct ordination doses
- Stock chart modal
- Automatic stock deduction cron endpoint with email notifications
- Resend email integration (configured)
- Domain: meditrack.deele.dk with HTTPS/SSL
- Deployed on Contabo VPS with Nginx, systemd, cron

## Pending
- P0: Deploy latest code to Contabo server (git pull + restart)
- P0: Set up cron job on server for 23:00 stock updates
- P1: Biometric login
- P2: React Native/Expo port
- P3: Google Drive/iCloud backup
- P3: Native push notifications
- P3: Refactor large components
