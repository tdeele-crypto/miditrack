# MediTrack - Medication Tracking App PRD

## Original Problem Statement
Build a medication tracking mobile app prototype with:
- Medicine inventory management with stock tracking
- Weekly schedule for medications at different time slots (Morning, Noon, Evening, Night)
- Status indicators: Green (OK), Yellow (under 1 month), Red (within reminder period)
- PIN code authentication with email-based reset
- User profile with name and email
- Multi-language support (Danish + English)
- Dark theme

## User Personas
1. **Primary User**: People managing multiple daily medications who need:
   - Easy inventory tracking
   - Visual low-stock alerts
   - Simple scheduling system
   - Reminders to reorder medicine

## Core Requirements (Static)
- PIN-based authentication (4 digits)
- Medicine CRUD with stock tracking
- Time slot management (Morgen, Middag, Aften, Nat)
- Weekly schedule with day selection
- Status indicators (green/yellow/red)
- Take medicine logging with undo
- Language switching (DA/EN)
- Dark theme UI

## Architecture
- **Frontend**: React 19 + Tailwind CSS
- **Backend**: FastAPI + MongoDB
- **Auth**: PIN-based (hashed with SHA256)
- **Email**: Resend API (for PIN reset)
- **Styling**: Custom dark theme with Outfit font

## What's Been Implemented ✅
**Date: March 2026**

### Backend API
- User registration/login with PIN
- PIN reset via email (Resend integration ready)
- Medicine CRUD with automatic status calculation
- Time slots (auto-created on registration)
- Schedule entries management
- Medicine logging (take/undo)
- Language preference storage

### Frontend
- Auth screens (register, login, PIN reset)
- Dashboard with week view and today's schedule
- Medicine list with status badges
- Schedule management with day selection
- Settings with language switcher
- Bottom navigation
- Full Danish + English translations

### Testing
- 100% backend tests passed (18/18)
- 95% frontend tests passed

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- [x] User authentication
- [x] Medicine inventory
- [x] Weekly schedule
- [x] Status indicators
- [x] Language support

### P1 (Important) - Future
- [ ] Resend API key configuration for email
- [ ] Edit time slot times
- [ ] Stock adjustment history
- [ ] Export data

### P2 (Nice to Have) - Future
- [ ] Push notifications (PWA/Native)
- [ ] Biometric authentication
- [ ] Medicine images/icons
- [ ] Multiple user profiles
- [ ] Dark/Light theme toggle

## Next Tasks
1. Configure Resend API key for production email
2. Convert to React Native/Expo for Google Play
3. Add push notification support
4. Implement biometric login

## Technical Debt
- None significant

## Deployment Notes
- Web prototype ready for testing
- For Google Play: Convert to React Native or wrap as PWA
