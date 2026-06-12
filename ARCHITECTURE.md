# RamboFlow - Vollständige Architektur-Dokumentation

**Stand:** 2025-12-25
**Version:** 1.0.0
**Zweck:** Grundlage für zukünftiges Refactoring

---

## Inhaltsverzeichnis

1. [Technologie-Stack](#1-technologie-stack)
2. [Projektstruktur](#2-projektstruktur)
3. [Frontend-Architektur](#3-frontend-architektur)
4. [Backend-Architektur](#4-backend-architektur)
5. [Datenbank-Schema](#5-datenbank-schema)
6. [Externe Integrationen](#6-externe-integrationen)
7. [Funktionsübersicht nach Menübereichen](#7-funktionsübersicht-nach-menübereichen)
8. [Zusammenspiel der Komponenten](#8-zusammenspiel-der-komponenten)

---

## 1. Technologie-Stack

### Frontend
| Technologie | Version | Zweck |
|-------------|---------|-------|
| **React** | 18.3.1 | UI-Framework |
| **TypeScript** | 5.3.3 | Typsicherheit |
| **Vite** | 5.1.4 | Build-Tool & Dev-Server |
| **Tailwind CSS** | 3.4.1 | Styling (Utility-first) |
| **React Router DOM** | 6.22.0 | Client-Side Routing |
| **Lucide React** | 0.344.0 | Icon-Bibliothek |
| **React Big Calendar** | 1.19.4 | Kalenderansicht |
| **Recharts** | 3.4.1 | Diagramme & Charts |
| **date-fns** | 3.3.1 | Datumsverarbeitung |
| **jsPDF** | 3.0.3 | PDF-Generierung |
| **PapaParse** | 5.5.3 | CSV-Import/Export |
| **vite-plugin-pwa** | 0.19.2 | Progressive Web App |

### Backend
| Technologie | Version | Zweck |
|-------------|---------|-------|
| **Node.js** | - | Runtime |
| **Express** | 4.18.2 | Web-Framework |
| **TypeScript** | 5.3.3 | Typsicherheit |
| **PostgreSQL** | via pg 8.11.3 | Datenbank |
| **Zod** | 3.22.4 | Schema-Validierung |
| **JWT** | 9.0.2 | Authentifizierung |
| **bcryptjs** | 2.4.3 | Passwort-Hashing |
| **otplib** | 12.0.1 | TOTP/MFA |
| **web-push** | 3.6.7 | Push-Benachrichtigungen |
| **nodemailer** | 6.9.7 | E-Mail-Versand |
| **node-cron** | 3.0.3 | Geplante Tasks |
| **helmet** | 8.1.0 | Security Headers |
| **express-rate-limit** | 8.2.1 | Rate Limiting |
| **multer** | 2.0.2 | Datei-Uploads |
| **@azure/identity** | 4.13.0 | Microsoft Graph Auth |

---

## 2. Projektstruktur

```
timetracking_app/
├── src/                          # Frontend-Quellcode
│   ├── components/               # React-Komponenten (65+)
│   │   └── portal/              # Kundenportal-Komponenten (12)
│   ├── contexts/                # React Context Provider
│   ├── hooks/                   # Custom React Hooks
│   ├── services/                # API-Client (api.ts)
│   ├── types.ts                 # TypeScript Interfaces
│   ├── utils/                   # Hilfsfunktionen
│   ├── App.tsx                  # Haupt-App-Komponente
│   └── main.tsx                 # Entry Point
├── server/                       # Backend-Quellcode
│   ├── src/
│   │   ├── routes/              # API-Routen (27 Dateien)
│   │   ├── services/            # Business-Logik (10 Services)
│   │   ├── middleware/          # Express Middleware
│   │   ├── config/              # Datenbank & Konfiguration
│   │   └── index.ts             # Server Entry Point
│   └── uploads/                 # Datei-Uploads
├── public/                       # Statische Dateien
├── dist/                         # Frontend Build-Output
└── logs/                         # Log-Dateien
```

---

## 3. Frontend-Architektur

### 3.1 Navigations-Modell

Die Anwendung verwendet ein **Area-basiertes Navigationsmodell** mit drei Hauptbereichen:

```
┌─────────────────────────────────────────────────────────────┐
│                        HEADER                                │
│  [SubView Tabs für aktuelle Area]              [Settings]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                     MAIN CONTENT                             │
│                                                              │
│            (Dynamisch basierend auf Area + SubView)         │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                      BOTTOM NAV                              │
│      [Arbeiten]        [Support]        [Business]          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Hauptbereiche (Areas)

#### **AREA 1: Arbeiten (Time Tracking)**
| SubView | Komponente | Beschreibung |
|---------|------------|--------------|
| `stopwatch` | `Stopwatch.tsx` | Echtzeit-Timer für laufende Arbeit |
| `tasks` | `TaskHub.tsx` | Aufgabenverwaltung mit Zeiterfassung |
| `list` | `TimeEntriesList.tsx` | Liste aller Zeiteinträge mit Bearbeitung |
| `calendar` | `CalendarView.tsx` | Monats-/Wochenansicht mit Drag & Drop |

#### **AREA 2: Support (Ticketsystem)**
| SubView | Komponente | Beschreibung |
|---------|------------|--------------|
| `tickets` | `Tickets.tsx` | Ticket-Management (Dashboard, Liste, Kanban) |
| `devices` | `DevicesView.tsx` | Geräte-/Maschinen-Verwaltung |
| `alerts` | `AlertsView.tsx` | System-Alerts & NinjaRMM-Benachrichtigungen |
| `maintenance` | `MaintenanceView.tsx` | Wartungsankündigungen & -aufgaben |

#### **AREA 3: Business (Analyse & Finanzen)**
| SubView | Komponente | Beschreibung |
|---------|------------|--------------|
| `overview` | `DashboardOverview.tsx` | Bento-Grid KPI-Dashboard (Hero-Kachel mit Live-Timer, KPI-Tiles, letzte Einträge, offene Tickets) |
| `reports` | `ReportsPage.tsx` | Report-Generator (nutzt `ReportAssistant.tsx`), PDF-Export, Approval-Flow |
| `contracts` | `Contracts.tsx` | Vertragsmanagement |
| `billing` | `Finanzen.tsx` | Abrechnungen & sevDesk-Integration |
| `social-media` | `SocialMediaManager.tsx` | Social Media Content-Planung |

### 3.3 Routing-Struktur

```typescript
// Öffentliche Routen (main.tsx)
/approve/:token         → ReportApprovalReview     // Report-Freigabe
/maintenance/approve/:token → MaintenanceApproval  // Wartungs-Freigabe
/portal/*               → CustomerPortal           // Kundenportal

// App-interne Navigation (App.tsx)
// Basiert auf activeArea + activeSubView State
// Keine URL-basierte Navigation für Hauptbereiche
```

### 3.4 Komponenten-Katalog (77 Komponenten)

#### Authentifizierung & Sicherheit
- `Auth.tsx` - Login-Formular
- `ForgotPassword.tsx` - Passwort-Wiederherstellung
- `ResetPassword.tsx` - Passwort zurücksetzen
- `MFASettings.tsx` - Multi-Faktor-Authentifizierung

#### Zeiterfassung
- `Stopwatch.tsx` - Timer mit KI-Beschreibungsgenerierung
- `ManualEntry.tsx` - Manuelle Zeiterfassung
- `TimeEntriesList.tsx` - Listenansicht mit Bulk-Bearbeitung
- `CalendarView.tsx` - Kalender mit react-big-calendar
- `TimePicker.tsx` - Zeitauswahl-Komponente

#### Aufgabenverwaltung
- `TaskHub.tsx` - Aufgaben-Dashboard
- `TaskModal.tsx` - Aufgabe erstellen/bearbeiten
- `TasksOverview.tsx` - Aufgaben-Übersicht

#### Ticketsystem
- `Tickets.tsx` - Container mit View-Modes
- `TicketDashboard.tsx` - Übersichts-Dashboard
- `TicketList.tsx` - Ticket-Liste
- `TicketDetail.tsx` - Detailansicht mit Kommentaren
- `TicketKanban.tsx` - Kanban-Board
- `CreateTicketDialog.tsx` - Ticket-Erstellung
- `TicketSettings.tsx` - Statusse, Typen konfigurieren
- `TicketMergeDialog.tsx` - Tickets zusammenführen

#### Business & Analytics
- `DashboardOverview.tsx` - Bento-Grid KPI-Dashboard (Hero-Kachel, Live-Timer, KPI-Tiles)
- `Finanzen.tsx` - Abrechnungsmodul (Container für `BillingOverview.tsx`)
- `BillingOverview.tsx` - Abrechnungs-Übersicht innerhalb von Finanzen
- `ReportsPage.tsx` - Report-Seite (Container für `ReportAssistant.tsx`)
- `ReportAssistant.tsx` - KI-unterstützte Berichtserstellung + Saved-Reports-Browser + PDF-Export
- `ReportApprovalReview.tsx` - Approval-Flow für eingereichte Reports

#### Kundenportal (12 Komponenten in /portal)
- `CustomerPortal.tsx` - Portal-Container
- `PortalLogin.tsx` - Kunden-Login
- `PortalActivate.tsx` - Portal-Aktivierung
- `PortalLayout.tsx` - Layout-Wrapper
- `PortalTicketList.tsx` - Kunden-Tickets
- `PortalTicketDetail.tsx` - Ticket-Details
- `PortalCreateTicket.tsx` - Ticket erstellen
- `PortalProfile.tsx` - Kundenprofil
- `PortalKnowledgeBase.tsx` - Wissensdatenbank
- `PortalDevices.tsx` - Geräte-Übersicht
- `PortalInvoices.tsx` - Rechnungsansicht
- `PortalWelcomeGuide.tsx` - Onboarding

#### Einstellungen & Management
- `Settings.tsx` - Haupteinstellungen (Tabs: Account, Team, Kunden, Projekte, etc.)
- `Contracts.tsx` - Verträge verwalten
- `CustomerContacts.tsx` - Kontaktpersonen-Verwaltung

#### Integrationen
- `SevdeskSettings.tsx` - sevDesk-Konfiguration
- `SevdeskCustomerImport.tsx` - Kundenimport aus sevDesk
- `SevdeskDocuments.tsx` - Dokumentenansicht
- `NinjaRMMSettings.tsx` - NinjaRMM-Konfiguration
- `ClockodoImport.tsx` - Clockodo-Import
- `AISettings.tsx` - KI-Konfiguration
- `SocialMediaManager.tsx` - Social Media Management

#### UI-Komponenten
- `Navigation.tsx` / `AreaNavigation.tsx` / `DesktopSidebar.tsx` - Navigation
- `Modal.tsx` - Generisches Modal
- `ConfirmDialog.tsx` - Bestätigungsdialog
- `MarkdownEditor.tsx` / `MarkdownRenderer.tsx` - Markdown
- `SwipeableRow.tsx` - Mobile Swipe-Gesten

---

## 4. Backend-Architektur

### 4.1 API-Routen (27 Dateien, 150+ Endpoints)

| Route-Datei | Basis-Pfad | Hauptfunktionen |
|-------------|-----------|-----------------|
| `activities.ts` | `/api/activities` | CRUD für Tätigkeiten |
| `admin.ts` | `/api/admin` | System-Statistiken, User-Management |
| `ai.ts` | `/api/ai` | KI-Konfiguration, Suggestions |
| `auth.ts` | `/api/auth` | Login, Register, JWT |
| `company-info.ts` | `/api/company-info` | Firmendaten |
| `contracts.ts` | `/api/contracts` | Vertragsmanagement |
| `customer-portal.ts` | `/api/customer-portal` | Portal-Auth, MFA |
| `customers.ts` | `/api/customers` | Kundenverwaltung |
| `entries.ts` | `/api/entries` | Zeiteinträge CRUD |
| `features.ts` | `/api/features` | Feature-Packages |
| `import.ts` | `/api/import` | Clockodo-Import |
| `knowledge-base.ts` | `/api/knowledge-base` | KB-Artikel |
| `leads.ts` | `/api/leads` | Lead-Management |
| `maintenance.ts` | `/api/maintenance` | Wartungsankündigungen |
| `mfa.ts` | `/api/mfa` | Multi-Faktor-Auth |
| `ninjarmm.ts` | `/api/ninjarmm` | RMM-Integration |
| `organizations.ts` | `/api/organizations` | Multi-Tenancy |
| `password-reset.ts` | `/api/password-reset` | Passwort-Reset |
| `projects.ts` | `/api/projects` | Projektverwaltung |
| `push.ts` | `/api/push` | Push-Benachrichtigungen |
| `report-approvals.ts` | `/api/report-approvals` | Report-Freigaben |
| `sevdesk.ts` | `/api/sevdesk` | sevDesk-Integration |
| `social-media.ts` | `/api/social-media` | Social Media Posts |
| `tasks.ts` | `/api/tasks` | Aufgabenverwaltung |
| `teams.ts` | `/api/teams` | Team-Management |
| `tickets.ts` | `/api/tickets` | Ticketsystem (40+ Endpoints) |
| `user.ts` | `/api/user` | Benutzerprofil |

### 4.2 Middleware-Stack

```typescript
// Authentifizierung
authenticateToken         // JWT-Validierung
attachOrganization        // Multi-Tenancy Context
requireOrgRole('admin')   // Rollenprüfung (owner/admin/member/viewer)
authenticateCustomerToken // Portal-spezifische Auth

// Sicherheit
authLimiter              // Rate Limiting für Auth-Endpoints
helmet                   // Security Headers
cors                     // CORS-Konfiguration

// Validierung
validate(zodSchema)      // Zod-Schema-Validierung

// Datei-Upload
upload (multer)          // Multipart Form-Data

// Logging
auditLog                 // Aktivitätsprotokollierung
```

### 4.3 Services (10 Module)

| Service | Datei | Funktionen |
|---------|-------|------------|
| **Audit Log** | `auditLog.ts` | Aktivitätsprotokollierung, DSGVO-Export |
| **Contracts** | `contractService.ts` | Vertrags-CRUD, Stunden-Tracking |
| **Email** | `emailService.ts` | E-Mail-Versand, Templates |
| **Microsoft Graph** | `microsoftGraphService.ts` | M365-Integration, E-Mail via Graph API |
| **NinjaRMM** | `ninjarmmService.ts` | RMM-Sync, Geräte, Alerts, OAuth2 |
| **Push Notifications** | `pushNotifications.ts` | Web Push, VAPID |
| **Security** | `securityService.ts` | Brute-Force-Erkennung, Fail2Ban |
| **sevDesk** | `sevdeskService.ts` | Rechnungen, Kunden, Sync |
| **Theme Engine** | `themeSelectionEngine.ts` | Social Media Content-Strategie |

---

## 5. Datenbank-Schema

### 5.1 Übersicht (61+ Tabellen)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CORE (Benutzer & Mandanten)                  │
├─────────────────────────────────────────────────────────────────┤
│ users                 │ Benutzerkonten, MFA, Einstellungen      │
│ organizations         │ Mandanten/Firmen                        │
│ organization_members  │ Mitgliedschaften mit Rollen             │
│ organization_invitations │ Einladungen                          │
│ teams                 │ Team-Strukturen                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    KUNDENVERWALTUNG                             │
├─────────────────────────────────────────────────────────────────┤
│ customers             │ Kunden mit NinjaRMM/sevDesk-Links       │
│ projects              │ Projekte pro Kunde                      │
│ activities            │ Tätigkeitsarten                         │
│ customer_contacts     │ Kontaktpersonen                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ZEITERFASSUNG                                │
├─────────────────────────────────────────────────────────────────┤
│ time_entries          │ Zeiteinträge mit Billable-Flag          │
│ company_info          │ Firmendaten für Reports                 │
│ report_approvals      │ Report-Freigabe-Workflow                │
│ invoice_exports       │ Abrechnungsexporte                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    TICKETSYSTEM                                 │
├─────────────────────────────────────────────────────────────────┤
│ tickets               │ Tickets mit Status, Priorität, SLA      │
│ ticket_comments       │ Kommentare (intern/extern)              │
│ ticket_tags           │ Tags für Tickets                        │
│ ticket_tag_assignments│ Tag-Zuordnungen                         │
│ ticket_tasks          │ Aufgaben innerhalb eines Tickets        │
│ ticket_sequences      │ Ticket-Nummern pro Organisation         │
│ ticket_ai_suggestions │ KI-generierte Vorschläge                │
│ canned_responses      │ Textbausteine                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    NINJARMM INTEGRATION (10 Tabellen)           │
├─────────────────────────────────────────────────────────────────┤
│ ninjarmm_config       │ API-Credentials, Webhook-Einstellungen  │
│ ninjarmm_organizations│ Synchronisierte Organisationen          │
│ ninjarmm_devices      │ Geräteinventar mit IP-Tracking          │
│ ninjarmm_device_ip_history │ IP-Änderungshistorie              │
│ ninjarmm_device_software   │ Software-Inventar                 │
│ ninjarmm_device_os_patches │ Windows-Patches                   │
│ ninjarmm_alerts       │ System- & Sicherheits-Alerts            │
│ ninjarmm_webhook_events    │ Webhook-Ereignisse                │
│ ninjarmm_alert_exclusions  │ Alert-Filterregeln                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    KUNDENPORTAL (6 Tabellen)                    │
├─────────────────────────────────────────────────────────────────┤
│ customer_portal_users │ Portal-Benutzer mit MFA                 │
│ customer_portal_roles │ Rollen & Berechtigungen                 │
│ customer_portal_user_roles │ Rollen-Zuordnungen                │
│ customer_portal_user_devices │ Gerätezuordnungen               │
│ customer_portal_sessions │ Sessions                            │
│ customer_portal_activity_log │ Aktivitätslog                   │
│ portal_trusted_devices     │ Vertrauenswürdige Geräte          │
│ portal_push_subscriptions  │ Push-Abonnements                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    WARTUNGSANKÜNDIGUNGEN                        │
├─────────────────────────────────────────────────────────────────┤
│ maintenance_announcements        │ Wartungsankündigungen        │
│ maintenance_announcement_customers │ Kundenzuordnung & Freigabe │
│ maintenance_announcement_devices │ Gerätezuordnung              │
│ maintenance_templates            │ Vorlagen                     │
│ maintenance_activity_log         │ Aktivitätslog                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    VERTRÄGE                                     │
├─────────────────────────────────────────────────────────────────┤
│ contracts             │ Verträge mit SLA, Inklusivstunden       │
│ contract_positions    │ Vertragspositionen                      │
│ contract_hourly_tracking │ Stundentracking pro Monat           │
│ contract_activity_log │ Änderungshistorie                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    AUFGABEN (TaskHub)                           │
├─────────────────────────────────────────────────────────────────┤
│ tasks                 │ Aufgaben mit Wiederkehrend-Logik        │
│ task_checklist_items  │ Checklisten-Einträge                    │
│ task_comments         │ Kommentare                              │
│ task_activity_log     │ Aktivitätslog                           │
│ task_templates        │ Aufgabenvorlagen                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LEADS                                        │
├─────────────────────────────────────────────────────────────────┤
│ leads                 │ Lead-Pipeline                           │
│ lead_activities       │ Aktivitäten (Anrufe, E-Mails, etc.)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SEVDESK INTEGRATION                          │
├─────────────────────────────────────────────────────────────────┤
│ sevdesk_config        │ API-Token, Einstellungen                │
│ sevdesk_documents     │ Synchronisierte Dokumente (Volltextsuche)│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SOCIAL MEDIA (13 Tabellen)                   │
├─────────────────────────────────────────────────────────────────┤
│ social_media_accounts │ Verbundene Konten                       │
│ social_media_posts    │ Posts mit Planung                       │
│ social_media_post_platforms │ Plattform-spezifische Daten      │
│ social_media_templates │ Post-Vorlagen                          │
│ social_media_hashtag_groups │ Hashtag-Sammlungen               │
│ social_media_queue_settings │ Warteschlangen-Einstellungen     │
│ social_media_content_categories │ Inhaltskategorien            │
│ social_media_autopilot_settings │ Autopilot-Konfiguration      │
│ social_media_competitors │ Wettbewerber-Tracking                │
│ social_media_engagement_settings │ Engagement-Bot              │
│ social_media_engagement_history │ Engagement-Historie          │
│ social_media_stories  │ Story-Beiträge                          │
│ social_media_image_settings │ Bildgenerierung (KI)             │
│ social_media_generated_images │ Generierte Bilder              │
│ social_media_story_templates │ Story-Vorlagen                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SICHERHEIT & SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│ audit_logs            │ Aktivitätsprotokoll                     │
│ security_alerts       │ Sicherheitswarnungen                    │
│ password_reset_tokens │ Passwort-Reset                          │
│ trusted_devices       │ Vertrauenswürdige Geräte (MFA)          │
│ notification_settings │ Benachrichtigungseinstellungen          │
│ push_subscriptions    │ Push-Abonnements                        │
│ ai_config             │ KI-Konfiguration                        │
│ feature_packages      │ Feature-Pakete                          │
│ email_notifications   │ E-Mail-Historie                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Externe Integrationen

### 6.1 NinjaRMM

```
┌──────────────────┐     OAuth2      ┌──────────────────┐
│   RamboFlow      │ ◄────────────► │    NinjaRMM      │
│   Backend        │                 │    API v2        │
│                  │                 │                  │
│  - Organisations │  ◄─── Sync ───► │  - Organizations │
│  - Devices       │  ◄─── Sync ───► │  - Devices       │
│  - Alerts        │  ◄─── Sync ───► │  - Alerts        │
│  - Webhooks      │  ◄─── Push ───  │  - Webhooks      │
└──────────────────┘                 └──────────────────┘

Funktionen:
- OAuth2 Authentifizierung
- Bidirektionale Synchronisation
- Webhook-Empfang für Echtzeit-Alerts
- Alert → Ticket Konvertierung
- IP-Änderungshistorie
- Software-/Patch-Inventar
```

### 6.2 sevDesk

```
┌──────────────────┐    Bearer Token   ┌──────────────────┐
│   RamboFlow      │ ◄───────────────► │    sevDesk       │
│   Backend        │                   │    API v1        │
│                  │                   │                  │
│  - Customers     │  ◄─── Sync ─────► │  - Contacts      │
│  - Invoices      │  ◄─── Sync ─────► │  - Invoices      │
│  - Quotes        │  ◄─── Sync ─────► │  - Orders        │
│  - Vouchers      │  ◄─── Sync ─────► │  - Vouchers      │
│  - Time Billing  │  ───► Create ───► │  - Invoice       │
└──────────────────┘                   └──────────────────┘

Funktionen:
- Kundenimport/-abgleich
- Automatische Rechnungserstellung
- Angebots-Erstellung
- Belegverwaltung
- Volltextsuche in Dokumenten
```

### 6.3 Microsoft 365

```
┌──────────────────┐    Azure AD       ┌──────────────────┐
│   RamboFlow      │ ◄───────────────► │  Microsoft       │
│   Backend        │                   │  Graph API       │
│                  │                   │                  │
│  - E-Mail Send   │  ───► Send ─────► │  - Mail.Send     │
│  - Notifications │                   │                  │
│  - Reports       │                   │                  │
└──────────────────┘                   └──────────────────┘

Funktionen:
- E-Mail-Versand über Microsoft 365
- CC, BCC, Reply-To Support
- Dateianhänge
```

### 6.4 KI-Integration (OpenAI / Anthropic)

```
┌──────────────────┐                   ┌──────────────────┐
│   RamboFlow      │ ◄───────────────► │  OpenAI /        │
│   Backend        │    API Key        │  Anthropic       │
│                  │                   │                  │
│  - Ticket Suggest│  ───► Generate ─► │  - GPT-4         │
│  - Time Describe │  ───► Generate ─► │  - Claude        │
│  - Quote Text    │  ───► Generate ─► │                  │
│  - KB Generate   │  ───► Generate ─► │                  │
│  - Social Posts  │  ───► Generate ─► │                  │
└──────────────────┘                   └──────────────────┘

Funktionen:
- Ticket-Lösungsvorschläge
- Zeiteintrags-Beschreibung generieren
- Angebot-Kopf-/Fußtexte
- Knowledge-Base Artikel aus Tickets
- Social Media Content-Generierung
```

---

## 7. Funktionsübersicht nach Menübereichen

### 7.1 Arbeiten (Time Tracking)

| Funktion | Komponente | API-Endpoint | Datenbank |
|----------|------------|--------------|-----------|
| Timer starten/stoppen | `Stopwatch.tsx` | `POST /api/entries` | `time_entries` |
| Zeiteinträge bearbeiten | `TimeEntriesList.tsx` | `PUT /api/entries/:id` | `time_entries` |
| Bulk-Bearbeitung | `TimeEntriesList.tsx` | `PUT /api/entries/bulk-update` | `time_entries` |
| Kalenderansicht | `CalendarView.tsx` | `GET /api/entries` | `time_entries` |
| KI-Beschreibung | `Stopwatch.tsx` | `POST /api/ai/time-entry/suggest-description` | `ai_config` |
| Aufgaben verwalten | `TaskHub.tsx` | `/api/tasks/*` | `tasks`, `task_*` |
| Timer für Aufgabe | `TaskHub.tsx` | `POST /api/tasks/:id/start-timer` | `time_entries` |

### 7.2 Support (Ticketsystem)

| Funktion | Komponente | API-Endpoint | Datenbank |
|----------|------------|--------------|-----------|
| Ticket erstellen | `CreateTicketDialog.tsx` | `POST /api/tickets` | `tickets` |
| Ticket bearbeiten | `TicketDetail.tsx` | `PUT /api/tickets/:id` | `tickets` |
| Kommentar hinzufügen | `TicketDetail.tsx` | `POST /api/tickets/:id/comments` | `ticket_comments` |
| Tags verwalten | `TicketDetail.tsx` | `/api/tickets/tags/*` | `ticket_tags` |
| SLA-Policies | `TicketSettings.tsx` | `/api/tickets/sla/*` | - |
| Ticket-Aufgaben | `TicketDetail.tsx` | `/api/tickets/:id/tasks` | `ticket_tasks` |
| KI-Vorschläge | `TicketDetail.tsx` | `POST /api/ai/tickets/:id/suggest` | `ticket_ai_suggestions` |
| Geräte ansehen | `DevicesView.tsx` | `GET /api/ninjarmm/devices` | `ninjarmm_devices` |
| Alerts ansehen | `AlertsView.tsx` | `GET /api/ninjarmm/alerts` | `ninjarmm_alerts` |
| Alert → Ticket | `AlertsView.tsx` | `POST /api/ninjarmm/alerts/:id/create-ticket` | `tickets` |
| Wartung planen | `MaintenanceView.tsx` | `/api/maintenance/*` | `maintenance_*` |

### 7.3 Business (Analyse & Finanzen)

| Funktion | Komponente | API-Endpoint | Datenbank |
|----------|------------|--------------|-----------|
| Dashboard-KPIs | `DashboardOverview.tsx` | `GET /api/entries`, `GET /api/tickets` (client-side aggregation) | Aggregation |
| Report erstellen | `ReportsPage.tsx` / `ReportAssistant.tsx` | Clientseitig (jsPDF) | - |
| Report zur Freigabe | `ReportAssistant.tsx` | `POST /api/report-approvals/send` | `report_approvals` |
| Verträge verwalten | `Contracts.tsx` | `/api/contracts/*` | `contracts` |
| Abrechnungen | `Finanzen.tsx` | `/api/sevdesk/*` | `invoice_exports` |
| sevDesk-Sync | `SevdeskSettings.tsx` | `POST /api/sevdesk/sync` | `sevdesk_documents` |
| Social Media | `SocialMediaManager.tsx` | `/api/social-media/*` | `social_media_*` |

### 7.4 Einstellungen

| Funktion | Komponente | API-Endpoint | Datenbank |
|----------|------------|--------------|-----------|
| Profil bearbeiten | `Settings.tsx` | `PUT /api/user/settings` | `users` |
| MFA einrichten | `MFASettings.tsx` | `/api/mfa/*` | `users` |
| Team verwalten | `Settings.tsx` | `/api/organizations/*` | `organization_members` |
| Kunden verwalten | `Settings.tsx` | `/api/customers/*` | `customers` |
| Projekte verwalten | `Settings.tsx` | `/api/projects/*` | `projects` |
| NinjaRMM konfigurieren | `NinjaRMMSettings.tsx` | `/api/ninjarmm/*` | `ninjarmm_config` |
| sevDesk konfigurieren | `SevdeskSettings.tsx` | `/api/sevdesk/*` | `sevdesk_config` |
| KI konfigurieren | `AISettings.tsx` | `/api/ai/config` | `ai_config` |
| Feature-Pakete | `Settings.tsx` | `/api/features/*` | `feature_packages` |

### 7.5 Kundenportal

| Funktion | Komponente | API-Endpoint | Datenbank |
|----------|------------|--------------|-----------|
| Portal-Login | `PortalLogin.tsx` | `POST /api/customer-portal/login` | `customer_contacts` |
| Tickets ansehen | `PortalTicketList.tsx` | `GET /api/customer-portal/tickets` | `tickets` |
| Ticket erstellen | `PortalCreateTicket.tsx` | `POST /api/customer-portal/tickets` | `tickets` |
| Geräte ansehen | `PortalDevices.tsx` | `GET /api/customer-portal/devices` | `ninjarmm_devices` |
| Rechnungen ansehen | `PortalInvoices.tsx` | `GET /api/customer-portal/invoices` | via sevDesk |
| Wissensdatenbank | `PortalKnowledgeBase.tsx` | `GET /api/knowledge-base/public/*` | `knowledge_base_*` |

---

## 8. Zusammenspiel der Komponenten

### 8.1 Zeiterfassung → Abrechnung

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ Stopwatch  │───►│ time_      │───►│ Finanzen   │───►│ sevDesk    │
│ /Manual    │    │ entries    │    │ (Billing)  │    │ Invoice    │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
     │                  │                  │
     ▼                  ▼                  ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│ Project    │    │ Contract   │    │ invoice_   │
│ Customer   │    │ Hourly     │    │ exports    │
└────────────┘    └────────────┘    └────────────┘
```

### 8.2 NinjaRMM Alert → Ticket

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ NinjaRMM   │───►│ Webhook    │───►│ Alert      │───►│ Ticket     │
│ Webhook    │    │ Handler    │    │ Processing │    │ Creation   │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
                        │                  │                  │
                        ▼                  ▼                  ▼
                  ┌────────────┐    ┌────────────┐    ┌────────────┐
                  │ webhook_   │    │ ninjarmm_  │    │ tickets    │
                  │ events     │    │ alerts     │    │            │
                  └────────────┘    └────────────┘    └────────────┘
                        │
                        ▼
                  ┌────────────┐
                  │ Exclusion  │ (Filter-Regeln)
                  │ Check      │
                  └────────────┘
```

### 8.3 Ticket-Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        TICKET LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────┐   ┌───────────┐   ┌─────────┐   ┌──────────┐   ┌────┐│
│  │ NEW  │──►│IN_PROGRESS│──►│ WAITING │──►│ RESOLVED │──►│CLOSE││
│  └──────┘   └───────────┘   └─────────┘   └──────────┘   └────┘│
│      │            │              │              │               │
│      ▼            ▼              ▼              ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    TICKET ACTIONS                         │  │
│  │  - Comments (intern/extern)                               │  │
│  │  - Tags zuweisen                                          │  │
│  │  - Tasks erstellen                                        │  │
│  │  - Zeit erfassen                                          │  │
│  │  - KI-Vorschläge                                          │  │
│  │  - Canned Responses                                       │  │
│  │  - Anhänge hochladen                                      │  │
│  │  - SLA-Tracking                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Multi-Tenancy Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORGANIZATION                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Owner     │  │   Admin     │  │   Member    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  SHARED RESOURCES                          │  │
│  │  - Customers      - Contracts       - NinjaRMM Config     │  │
│  │  - Projects       - Tickets         - sevDesk Config      │  │
│  │  - Activities     - Time Entries    - Feature Packages    │  │
│  │  - Tasks          - Maintenance     - Social Media        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  PORTAL USERS                              │  │
│  │  - customer_contacts → customer_id → organization_id      │  │
│  │  - Separate Auth-Flow (JWT, MFA)                           │  │
│  │  - Eingeschränkte Berechtigungen                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Anhang: Technische Schulden & Refactoring-Kandidaten

### Frontend
1. **Navigation**: Aktuell State-basiert, könnte URL-basiert sein
2. **API-Client**: Monolithische `api.ts` (2500+ Zeilen)
3. **Komponenten**: Einige Komponenten sehr groß (z.B. `NinjaRMMSettings.tsx`)

### Backend
1. **Routen**: Einige Route-Dateien sehr umfangreich (z.B. `ninjarmm.ts`, `tickets.ts`)
2. **Datenbank**: Migrationen in `database.ts` (3000+ Zeilen)
3. **Services**: Könnten feiner granuliert werden

### Allgemein
1. **Fehlerbehandlung**: Unterschiedliche Muster in verschiedenen Dateien
2. **Logging**: Teilweise Console.log, teilweise Datei-basiert
3. **Tests**: Keine automatisierten Tests vorhanden

---

*Diese Dokumentation wurde automatisch erstellt und dient als Grundlage für zukünftige Refactoring-Maßnahmen.*
