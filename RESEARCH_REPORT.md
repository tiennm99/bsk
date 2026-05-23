# BSK Clinic Management System — Technical Research Report

## 1. Project Overview & Purpose

**Purpose:** All-in-one clinic management system targeting small-to-medium private clinics in Vietnam (particularly obstetrics/gynecology based on folder naming "ANH SIEU AM" = ultrasound imaging).

**Problem Solved:** Centralizes patient check-ups, medical records, medicine/service inventory, staff management, billing, and ultrasound/imaging workflows in a single application.

**Target Users:** Clinic staff (doctors, nurses, cashiers, receptionists), clinic administrators. Vietnamese locale (localized labels, Vietnamese timezone UTC+7 handling, Google Drive integration for patient file archival).

**Current State:** 
- Active but immature (v1.0-SNAPSHOT, 160 commits, 0 stars)
- **Minimal documentation** (README: "I will write readme later I promise")
- No formal license specified in repository
- Last activity suggests project is in active development as of Aug 2025
- Deployable as standalone Java applications (client + server JARs)

---

## 2. Tech Stack

### **Build & Languages**
- **Primary Language:** Java 21 (Maven project, JDK 21)
- **Build Tool:** Maven 3.x (pom.xml present)
- **Deployment Scripts:** PowerShell, Batch (Windows-focused distribution)

### **Backend (Server)**
- **Networking:** Netty 4.1.116 (TCP, WebSocket, HTTP handlers)
  - Custom packet-based protocol over Netty channels
  - HTTP + WebSocket server for client communication
  - Idle state handler, connection lifecycle management
- **Database:** SQLite 3.47.1.0 (local file-based, `database/BSK.db`)
  - WAL mode (Write-Ahead Logging) for durability
  - Pragmas: `synchronous=EXTRA`, `journal_mode=WAL`, `fullfsync=ON`
  - HikariCP 3.x connection pooling (10 concurrent connections max)
  - Periodic WAL checkpoints (every 5 minutes)
- **Persistence:** Direct JDBC SQL queries (no ORM), prepared statements
- **External Integrations:**
  - **Google Drive API v3** (OAuth 2.0) for patient file cloud storage
  - File storage paths: `image/checkup_media/` (local), Google Drive (remote)

### **Frontend (Client)**
- **UI Framework:** Swing (Java desktop GUI)
  - Custom components: rounded buttons, panels, date pickers
  - JDatePicker 1.3.4, SwingX 1.6.1
- **Image/Media Handling:**
  - WebCam-capture 0.3.12 (camera integration)
  - JavaCV 1.5.10, OpenCV 4.9.0 (image processing, ultrasound capture)
  - FFmpeg 6.1.1 (video encoding)
  - Barcode4J 2.1 (QR/barcode generation)
- **Reporting:** JasperReports 7.0.3 (PDF/print generation for invoices, prescriptions, ultrasound reports)
- **State Management:** LocalStorage class (client-side persistence, likely serialization)
- **Logging:** Log4j2 2.24.3, SLF4J 2.0.16

### **Common Libraries**
- **Serialization:** Gson 2.11.0 (JSON)
- **Annotations:** Lombok 1.18.36 (Java boilerplate reduction)
- **Reflection:** ClassGraph 4.8.179 (annotation scanning)

### **Architecture Pattern**
- **Client-Server Model:** Monolithic, two-tier (Swing client ↔ Netty server)
- **Data Transport:** Custom packet protocol (serialized objects + metadata headers)
- **No REST/GraphQL:** Proprietary TCP/WebSocket packet format

---

## 3. Feature Inventory

### **Authentication & Access Control**
- User login/logout with role-based access (RBAC)
- Roles: (inferred from code) Doctor, Nurse, Cashier, Administrator, Staff
- Session management (SessionManager tracks authenticated clients by channel ID)
- User registration workflow

### **Patient Management**
- Patient registration (name, DOB, ID/CCCD, address, phone, weight, height, gender)
- Patient history/records view (all past check-ups)
- Patient search and lookup
- Re-check-up scheduling (with reminder dates)
- Patient folder creation in Google Drive (one folder per patient)

### **Check-Up / Appointment Workflow**
- Queue management (shift-based: multiple shifts per day)
- Check-up scheduling by doctor and check-up type
- Check-up status tracking (Pending, In Progress, Completed/ĐÃ KHÁM, etc.)
- Queue number assignment (formatted as 2-digit numbers)
- Daily queue counter per shift

### **Medical Records & Diagnosis**
- Checkup recording (date, doctor, type, diagnosis, suggestion, notes)
- Clinical vitals entry (heart beat, blood pressure, height, weight)
- Conclusion/summary fields
- Re-check-up date scheduling
- Patient ID verification (CCCD/passport field)

### **Ultrasound/Imaging Module** ("ANH SIEU AM")
- Live ultrasound capture via webcam/USB device
- Image and video storage per patient/check-up
- Barcode/QR code generation for ultrasound images
- Ultrasound report printing with JasperReports
- Folder organization: `image/checkup_media/{checkup_id}/`
- Drive URL storage (Google Drive integration)

### **Medicine & Prescription Management**
- Medicine catalog (name, company, unit, selling price, route, supplement flag)
- Prescription templates (pre-filled diagnosis/medicine lists)
- Medicine order creation (MedicineOrder + OrderItem join tables)
- Dosage and quantity recording
- Medicine invoice printing

### **Services & Billing**
- Service catalog (name, cost)
- Service assignment to check-ups (CheckupService table)
- Medicine and service pricing
- Invoice generation and printing
- Payment tracking (payment_status field on orders)

### **Staff Management**
- Doctor management (add/edit/delete, full name, soft delete)
- User management (username, password, role, first/last name)
- Staff assignment to check-ups

### **Reporting & Analytics**
- Dashboard page (DashboardPage.java)
- Historical data viewer (DataViewerDialog)
- Excel export (ExcelExporter, ExcelExportDialog)
- JasperReports-based PDF printing (invoices, ultrasound results, medicine prescriptions)
- Print dialogs for barcode/QR codes

### **Administrative Tools**
- Clinic information management (name, address, phone, prefix/title)
- Template management (check-up templates per gender)
- Data management UI (doctors, medicines, services, users)
- Settings dialog (clinic details, Google Drive config, server address/port)
- Server dashboard (ServerDashboard.java) with logging, database backup/restore, Google Drive status

### **Communication**
- Simple chat dialog (SimpleChatDialog.java) — inferred minimal messaging

### **Backup & Cloud Integration**
- Google Drive OAuth 2.0 integration (auto-upload patient files)
- Database backup/restore utilities (server dashboard)
- Local image storage + cloud redundancy

---

## 4. Data Model

### **Core Entities (Inferred from SQL & Entity Classes)**

#### **User Management**
- **User** (user_id, user_name, password, last_name, first_name, role_name, deleted)
- **Role** (role_name, permissions) — RBAC

#### **Staff**
- **Doctor** (doctor_id, doctor_last_name, doctor_first_name, deleted)

#### **Patient/Customer**
- **Customer** (customer_id, customer_last_name, customer_first_name, customer_dob, customer_number, customer_address, customer_gender, cccd_ddcn, customer_weight, customer_height, drive_folder_id, drive_url)

#### **Medical Records**
- **Checkup** (checkup_id, customer_id, doctor_id, checkup_date, checkup_type, status, queue_number, shift, suggestion, diagnosis, notes, conclusion, reCheckupDate, heart_beat, blood_pressure, customer_weight, customer_height, prescription_id, drive_folder_id, doctor_ultrasound_id)
- **PatientHistory** (checkup_date, checkup_id, suggestion, diagnosis, prescription_id, notes, checkup_type, conclusion, reCheckupDate, doctor_name, customer_height, customer_weight, heart_beat, blood_pressure)

#### **Medicine & Prescriptions**
- **Medicine** (med_id, med_name, med_company, med_description, med_unit, med_price, med_selling_price, med_preferred_note, med_supplement, med_route, deleted)
- **MedicineOrder** (prescription_id, checkup_id, customer_id, total_amount, status, payment_status, processed_by)
- **OrderItem** (prescription_id, med_id, quantity_ordered, dosage, price_per_unit, total_price, checkup_id, notes)

#### **Services**
- **Service** (service_id, service_name, service_cost, deleted)
- **CheckupService** (checkup_id, service_id, quantity, total_cost, notes)

#### **Templates & Configuration**
- **CheckupTemplate** (template_id, template_gender, template_name, template_title, photo_num, ...)
- **Clinic** (name, address, phone, prefix)
- **DailyQueueCounter** (date, shift, current_count)
- **Provinces** (code, name) — Vietnamese location data
- **Wards** (province_code, name) — Vietnamese location data

### **Relationships**
```
Customer 1──M Checkup
Doctor 1──M Checkup
Checkup 1──1 MedicineOrder
Checkup 1──M OrderItem
Checkup 1──M CheckupService
Medicine 1──M OrderItem
Service 1──M CheckupService
```

---

## 5. Architecture & Key Flows

### **Overall Architecture**
- **Monolithic Client-Server:** Single Swing desktop app (client) communicates with single Netty-based server
- **No Layering:** Service layer, DAO, and business logic mixed in ServerHandler (3252 lines)
- **Stateless Server Processing:** Each client connection handled in-thread; session state in SessionManager

### **Authentication Flow**
1. Client sends `LoginRequest` (username, password)
2. Server queries User table, validates credentials
3. If valid: SessionManager creates session, responds with `LoginSuccessResponse`
4. Client stores session token in LocalStorage
5. All subsequent requests include session ID; server validates via SessionManager

### **Check-Up Recording Flow**
1. Client → `AddCheckupRequest` (customer, doctor, checkup data, vitals, diagnosis)
2. Server inserts into Checkup table, creates MedicineOrder placeholder
3. Server broadcasts queue update to all connected clients
4. Clients refresh queue views in real-time
5. Google Drive folder created automatically if enabled

### **Ultrasound Capture Flow**
1. Client captures image/video via webcam → stored as `IMG_{checkup_id}_{timestamp}.jpg/png` or `VID_{checkup_id}_{timestamp}.mp4`
2. Stored locally in `image/checkup_media/{checkup_id}/` on client machine
3. Optional: Uploaded to Google Drive via OAuth
4. Barcode/QR code generated for ultrasound image
5. JasperReports template used for ultrasound report printing

### **Data Synchronization**
- **No real-time sync between clients** beyond queue updates
- Each client query hits server immediately (no caching layer)
- Queue updates broadcast to all clients on checkup creation/status change
- Google Drive serves as source-of-truth for archived patient files

### **Real-Time Features**
- **Queue Broadcasting:** ServerHandler.broadcastQueueUpdate() sends GetCheckUpQueueUpdateRequest to all authenticated clients
- **Ping/Pong:** Heartbeat mechanism (PingRequest/PongResponse) for connection keep-alive
- **WebSocket Support:** Netty configured with WebSocketServerProtocolHandler (though unclear if actively used)

### **External Integrations**
- **Google Drive OAuth 2.0:** GoogleDriveServiceOAuth class handles auth, folder creation, file uploads
- **Printing:** JasperReports templates in `src/main/resources/print_forms/` for invoices, prescriptions, ultrasound results
- **QR Codes:** Server-side QR generation via QRCodeGenerator utility

### **Error Handling**
- Custom exception types: NetworkException, SQL exceptions → ErrorResponse packets
- Logging via Log4j2 (distributed across client/server)
- No transaction rollback (SQLite default auto-commit behavior)

---

## 6. UI/UX Notes

### **Desktop Application**
- **Framework:** Swing (Windows/Linux/Mac compatible, though Windows-optimized build scripts suggest primary target = Windows)
- **Language:** Vietnamese UI labels throughout (login: "Đăng nhập", passwords: "Mật khẩu", buttons: "Lưu", etc.)
- **Design Patterns:**
  - MainFrame: Root container
  - CardLayout-like page switching (LoginPage → DashboardPage → CheckUpPage, etc.)
  - JTable-based data grids (queue, history, medicine, services)
  - Modal dialogs for data entry (AddDialog, MedicineDialog, ServiceDialog, TemplateDialog)

### **Key Pages**
1. **LoginPage** — Username/password, background image tint, "Đăng nhập" header
2. **LandingPage** — Initial navigation menu
3. **QueueViewPage** — Shift-based patient queue with call/action buttons
4. **CheckUpPage** — Medical record input (vitals, diagnosis, medicine, ultrasound capture)
5. **DashboardPage** — Stats and overview
6. **DataDialog** — Administrative panels (doctor, medicine, service, user management)
7. **SettingsDialog** — Clinic config, server address, Google Drive root folder

### **Accessibility Notes**
- No explicit accessibility features noted (no screen reader support, no keyboard shortcuts documented)
- Vietnamese fonts embedded (`SVN-Arial`, `Times New Roman` in resources/fonts/)
- Heavy reliance on mouse/UI interaction; desktop-only (no mobile)

### **Visual Components**
- Custom RoundedButtonUI, RoundedPanel for modern appearance
- Icons in `src/main/resources/assets/icon/` (add, edit, delete, dashboard, settings, printer, google-drive, etc.)
- GIF animation for heart beat pulse indicator

---

## 7. Notable Code & Design Choices

### **Positive Patterns**
1. **Entity Classes with Lombok:** Doctor, Medicine, Patient use @Data, @AllArgsConstructor to reduce boilerplate
2. **Packet-Based Protocol:** Clean abstraction for network communication (request/response pairs, Gson serialization)
3. **SQLite WAL + Durability:** DatabaseManager implements robust power-loss protection (PRAGMA synchronous=EXTRA, periodic checkpoints)
4. **HikariCP Pool:** Connection pooling prevents resource exhaustion
5. **Google Drive Integration:** OAuth 2.0 with folder-per-patient isolation is well-architected for cloud redundancy

### **Problematic Patterns**
1. **Monolithic ServerHandler (3252 lines):** All business logic in one class, no service layer separation
2. **String-Based Data Serialization:** Pipe-delimited arrays split on `|` and `\|` throughout (fragile, no null safety)
3. **No ORM/QueryDSL:** Raw SQL strings embedded in code (SQLi-resistant via PreparedStatement but verbose)
4. **Weak Transaction Model:** SQLite auto-commit per statement, no explicit transaction management
5. **Client Storage Uncertainty:** LocalStorage class implementation unclear; likely simple Java serialization (no encryption)
6. **Test Coverage:** Skipped in pom.xml (maven-surefire-plugin: skipTests=true)
7. **UI Logic Mixed with Network Calls:** Client UI pages directly invoke ClientHandler network methods (tight coupling)

### **Critical Files Worth Replicating**
- `/src/main/java/BsK/server/database/DatabaseManager.java` — SQLite durability configuration (WAL, pragmas)
- `/src/main/java/BsK/server/network/handler/ServerHandler.java` — Message dispatch logic (though needs refactoring)
- `/src/main/java/BsK/server/service/GoogleDriveServiceOAuth.java` — OAuth 2.0 file storage pattern
- `/src/main/java/BsK/common/packet/Packet.java` + `PacketSerializer.java` — Network protocol abstraction
- `/config/config.properties` — Externalized configuration example (clinic name, server port, Google Drive root folder)
- `/src/main/resources/print_forms/` — JasperReports templates for medical documents

### **Codebase Statistics**
- **171 Java files** (~20K lines estimated)
- **54 packet request types** + equivalent response types
- **18+ UI pages/dialogs** (Swing components)

---

## 8. License & Attribution

### **License Status**
**No explicit license found in repository.** 
- No LICENSE file present
- No COPYING, COPYRIGHT, or license header in source files
- README silent on licensing
- **Assumption:** Default copyright (all rights reserved) unless stated otherwise

### **Attribution Requirements for Educational Fork**
If rewriting, **you should:**
1. Confirm license status with original author (lds217) via GitHub issue
2. If copyright is asserted, include a LICENSE file (MIT/Apache 2.0 recommended for open-source) or add copyright attribution header:
   ```
   Original work: BSK Clinic Management System by lds217
   Repository: https://github.com/lds217/BSK-All-in-One-Clinic-Management-System
   License: [To be determined by original author]
   
   This fork is a derivative work for educational purposes.
   ```
3. Include a NOTICE file naming original author and year (2025 based on commit timestamps)

### **Third-Party Dependencies**
**Must retain attributions for:**
- Netty (Apache License 2.0)
- Gson (Apache License 2.0)
- Lombok (MIT License)
- JasperReports (LGPL 2.1)
- OpenCV (Apache License 2.0)
- SQLite (Public Domain)
- Log4j2 (Apache License 2.0)

---

## 9. What's NOT Obvious from README

### **Deployment Model**
- **Not a web app:** Desktop application with embedded server (two separate JARs: `bsk-server`, `bsk-client`)
- **Network Architecture:** Server runs on clinic LAN; clients connect via TCP to `server.address:server.port` (default 127.0.0.1:1999)
- **Database:** Single SQLite file on server machine (`database/BSK.db`); no separate database server
- **Auto-Update Mechanism:** PowerShell scripts (`update_server_script.ps1`, `update_client_script.ps1`) check remote version JSON and auto-replace JARs

### **Operational Requirements**
- **Admin Dashboard:** Separate Swing window on server (`ServerDashboard.java`) for monitoring:
  - Active client connections
  - Database backup/restore
  - Google Drive sync status
  - Real-time server logs
- **File Storage:** Ultrasound images stored on server file system + optionally Google Drive
- **Google Drive Dependency:** If enabled, requires valid OAuth service account JSON (not included in repo)
- **Configuration Management:** External `config/config.properties` file (overrides bundled defaults)

### **Clinic-Specific Customization**
- **Vietnamese Locale:** Hard-coded for Vietnam timezone (UTC+7), Vietnamese labels, Vietnamese province/ward data
- **Clinic Branding:** Configurable clinic name, address, phone, prefix (stored in Clinic table + config.properties)
- **Role-Based Access:** Role names stored as strings in database, not enum (flexible but error-prone)

### **Data Flow Quirks**
- **Patient Registration:** Creates entry in Customer table; automatically creates Google Drive folder (if enabled)
- **Check-Up Status:** Status field stores Vietnamese strings ("ĐÃ KHÁM" = checked, "CHỜ KHÁM" = waiting)
- **Queue Number:** Formatted as 2-digit zero-padded integers per shift per day
- **Image Storage:** Client stores images locally first, then optionally syncs to Google Drive via server

### **Known Limitations**
- **No Offline Mode:** Client requires live network connection to server
- **No Data Replication:** SQLite is single-file; no built-in backup between server restarts
- **Concurrency:** HikariCP max 10 connections; contention likely with >10 simultaneous users
- **No API/Mobile:** Desktop-only; no REST API or mobile app
- **String-Based Protocol:** Slower than binary formats; UTF-8 encoding assumed throughout

---

## 10. Unresolved Questions

1. **License Status:** Is the project open-source, proprietary, or available under a specific license?
2. **LocalStorage Implementation:** What serialization format is used for client-side storage? Is it encrypted?
3. **WebSocket Usage:** Netty is configured with WebSocketServerProtocolHandler, but are WebSockets actively used or just prepared?
4. **Transaction Rollback:** How are partial failures handled (e.g., checkup created but medicine order insert fails)?
5. **Scalability:** Why HikariCP max 10 connections? What happens when clinic expands beyond 10 simultaneous users?
6. **Payment Integration:** Payment_status field exists but no integration with payment gateways is visible. Is manual entry only?
7. **HIPAA/GDPR Compliance:** Storing medical records in Google Drive—what compliance framework applies?
8. **Test Suite:** Why are tests skipped? Are there test classes or is testing deferred?

---

## Summary

BSK is a **feature-rich but architecturally monolithic clinic management system** optimized for small Vietnamese clinics needing integrated patient, medicine, service, and ultrasound management. Its primary strengths are **comprehensive domain coverage** (queues, imaging, invoicing, Google Drive sync) and **robust SQLite durability configuration**. Primary weaknesses are **poor code organization** (ServerHandler god class), **lack of abstraction layers**, **string-based data serialization**, and **minimal documentation**. 

For an educational Next.js rewrite, retain: the packet protocol abstraction, SQLite durability patterns, Google Drive OAuth flow, and JasperReports approach for medical documents. Refactor away: monolithic handlers into modular services, string parsing into type-safe DTO layers, and Swing into modern web UI.

**No explicit license** means confirmation with original author is mandatory before public redistribution.
