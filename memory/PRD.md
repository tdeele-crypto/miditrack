# MediTrack - Product Requirements Document

## Original Problem Statement
Medicine management app to track medicine stock, create weekly dosage schedules, set reorder reminders with status indicators, and support PIN/biometric login. Must support Danish and English.

## Core Requirements
- PIN-code authentication with email-based reset
- Medicine inventory tracking (name, dosage, stock, reminders)
- Weekly schedule with different doses per day and time of day (Morning, Noon, Evening, Night)
- Status indicators (green/yellow/red) for medicine stock levels
- Downloadable PDF of weekly schedule (landscape)
- Dark theme, Danish/English language support
- Automatic stock deduction (no "mark as taken" button)
- User switching on login screen with "Save user" checkbox

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI + MongoDB
- **PDF**: jsPDF (client-side generation)
- **i18n**: Custom translation system (da/en)

## What's Been Implemented (as of March 2026)
- [x] User registration with PIN (4-digit)
- [x] Email-based login (POST /api/auth/login-email)
- [x] User switching: saved users on login screen, click to enter PIN
- [x] "Gem bruger" (Save user) checkbox
- [x] PIN reset via email (Resend integration)
- [x] Medicine CRUD with stock tracking and status indicators
- [x] Weekly schedule with per-day dosing
- [x] Time slots (Morning, Noon, Evening, Night)
- [x] Dashboard with week overview and week navigation
- [x] Medicine form with start date, cancel date, end date and repeat interval
- [x] **Refactored Schedule form with Special Ordination workflow:**
  - Special Ordination button placed directly under medicine dropdown
  - Time-of-day selection (Morgen, Middag, Aften, Nat) inside the ordination popup
  - Normal time slot dropdown and day-dose inputs hidden when ordination is active
  - Can save schedule entry with only special ordination (no day-doses required)
  - Time-of-day persists correctly when editing existing ordinations
- [x] **Dashboard shows special ordinations** on their active dates based on start_date, end_date, and repeat pattern (daily/weekly/biweekly/monthly)
- [x] Printable weekly schedule view (mobile-responsive card layout + desktop table)
- [x] PDF download (jsPDF, landscape A4)
- [x] Dark theme
- [x] Danish/English language support
- [x] Settings page (profile, language, logout)

## Key API Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/login-email
- POST /api/auth/request-pin-reset
- POST /api/auth/confirm-pin-reset
- GET/POST /api/medicines/{user_id}
- PUT/DELETE /api/medicines/{user_id}/{medicine_id}
- GET/POST /api/schedule/{user_id}
- PUT/DELETE /api/schedule/{user_id}/{entry_id}
- GET /api/timeslots/{user_id}

## DB Collections
- users: user_id, name, email, pin_hash, language
- medicines: medicine_id, user_id, name, dosage, stock_count, reminder_days_before
- schedule_entries: entry_id, user_id, medicine_id, slot_id, day_doses, special_ordination
- time_slots: slot_id, user_id, name, time, order
- pin_resets: email, reset_code, expires_at, used

## Backlog
- P1: End-to-end regression testing of entire app
- P1: Verify PDF download functionality
- P1: Biometric login (WebAuthn API for web, or native when ported)
- P2: Port to React Native/Expo
- P2: Native push notifications for reminders
- P3: Extract helper components from Schedule.js/Medicines.js into shared/ directory
