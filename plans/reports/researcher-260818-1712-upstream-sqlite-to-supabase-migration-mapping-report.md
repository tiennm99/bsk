# Upstream SQLite to Supabase Postgres Migration Mapping

**Date:** 2026-08-18  
**Upstream:** lds217/BSK-All-in-One-Clinic-Management-System (Java 21 + Netty + SQLite)  
**Target:** /config/workspace/tiennm99dev/bsk (Next.js + Supabase Postgres)

---

## 1. Upstream Table Inventory (SQLite)

Extracted from `/src/main/java/BsK/server/network/handler/ServerHandler.java` via grep analysis of SQL INSERT/UPDATE/SELECT statements.

### 1.1 User Table
**Purpose:** Staff authentication and role management  
**SQL Statements:**
- INSERT: `(user_id, user_name, password, last_name, first_name, role_name, deleted)`
- SELECT: `user_id, user_name, last_name, password, first_name, role_name, deleted FROM User`
- UPDATE: `user_name, password, last_name, first_name, role_name, deleted WHERE user_id`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| user_id | INTEGER/TEXT | Primary key (role field suggests text-based ID) |
| user_name | TEXT | Username; used for login |
| password | TEXT | Plaintext or hashed password |
| last_name | TEXT | Family name |
| first_name | TEXT | Given name |
| role_name | TEXT | Enum-like: admin, doctor, nurse, receptionist, cashier |
| deleted | BOOLEAN/INTEGER | Soft-delete flag (0=active, 1=deleted) |

**Observations:**
- SELECT order: user_id, user_name, last_name, password, first_name, role_name, deleted
- No timestamps (created_at, updated_at)
- Password stored in plaintext (security concern)

---

### 1.2 Customer Table
**Purpose:** Patient/clinic customer records  
**SQL Statements:**
- INSERT: `(customer_last_name, customer_first_name, customer_dob, customer_number, customer_address, customer_gender, cccd_ddcn)`
- SELECT: `customer_last_name, customer_first_name, drive_folder_id FROM Customer WHERE customer_id`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| customer_id | INTEGER | Primary key (auto-increment in queries) |
| customer_last_name | TEXT | Family name |
| customer_first_name | TEXT | Given name |
| customer_dob | LONG/TEXT | Date of birth; stored as epoch millis (getLong in code) |
| customer_number | TEXT | Phone number |
| customer_address | TEXT | Street address |
| customer_gender | TEXT | Enum-like: male, female (Vietnamese system often uses M/F or Nữ/Nam) |
| cccd_ddcn | TEXT | National ID (Căn cước công dân) |
| drive_folder_id | TEXT | Google Drive folder ID for patient media |
| drive_url | TEXT | Google Drive URL (inferred from Checkup table usage) |

**Observations:**
- DOB stored as epoch milliseconds (Java System.currentTimeMillis() pattern)
- Gender likely uses Vietnamese or English labels
- Google Drive integration for patient media storage
- No timestamps

---

### 1.3 Checkup Table
**Purpose:** Visit/examination records  
**SQL Statements:**
- INSERT: `(customer_id, doctor_id, checkup_type, status, queue_number, shift, checkup_date)`
- UPDATE: `suggestion, diagnosis, prescription_id, notes, status, checkup_type, conclusion, reCheckupDate, customer_weight, customer_height, heart_beat, blood_pressure, doctor_ultrasound_id, doctor_id, checkup_date WHERE checkup_id`
- SELECT fields seen: checkup_id, customer_id, checkup_date, status, checkup_type, customer_weight, customer_height, customer_gender, customer_dob

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| checkup_id | INTEGER | Primary key (auto-increment) |
| customer_id | INTEGER | Foreign key → Customer.customer_id |
| doctor_id | INTEGER | Foreign key → Doctor.doctor_id (nullable) |
| checkup_type | TEXT | Exam type (e.g., "general", "ultrasound") |
| status | TEXT | Enum-like: waiting, in_progress, done, or Vietnamese labels (ĐÃ KHÁM, etc.) |
| queue_number | INTEGER | Queue position for the day |
| shift | INTEGER | 1=morning, 2=afternoon, 3=evening (inferred from code: `shift=1,2,3`) |
| checkup_date | LONG/TEXT | Date of visit; stored as epoch millis or TEXT date string |
| suggestion | TEXT | Doctor's recommendation/notes |
| diagnosis | TEXT | Medical diagnosis |
| prescription_id | INTEGER | Foreign key → Prescription table (inferred; not seen in table list) |
| notes | TEXT | Additional clinical notes |
| conclusion | TEXT | Visit conclusion |
| reCheckupDate | LONG/TEXT | Follow-up visit date (epoch millis or date string) |
| customer_weight | DECIMAL | Weight in kg (BigDecimal in code) |
| customer_height | DECIMAL | Height in cm (BigDecimal in code) |
| heart_beat | TEXT | Heart rate (e.g., "72 bpm") |
| blood_pressure | TEXT | Blood pressure (e.g., "120/80") |
| doctor_ultrasound_id | INTEGER | Secondary doctor for ultrasound (nullable) |
| remind_date | LONG | Reminder timestamp (epoch millis) |
| drive_folder_id | TEXT | Google Drive folder for checkup images |
| drive_url | TEXT | Google Drive URL |

**Observations:**
- Vitals (weight, height, BP, HR) stored as denormalized columns (not separate vitals table)
- Dates stored as epoch milliseconds (System.currentTimeMillis())
- Status likely uses Vietnamese labels in production data
- No created_at/updated_at timestamps
- Prescription relationship implied but no prescription_id column definition found

---

### 1.4 Doctor Table
**Purpose:** Clinic staff roster  
**SQL Statements:**
- INSERT: `(doctor_last_name, doctor_first_name, deleted)`
- SELECT: `doctor_last_name || ' ' || doctor_first_name, doctor_id, deleted FROM Doctor ORDER BY doctor_id`
- UPDATE: `doctor_last_name, doctor_first_name, deleted WHERE doctor_id`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| doctor_id | INTEGER | Primary key (auto-increment) |
| doctor_last_name | TEXT | Family name |
| doctor_first_name | TEXT | Given name |
| deleted | BOOLEAN/INTEGER | Soft-delete flag |

**Observations:**
- Simple flat structure; no specialization or role fields
- Concat-concatenated on display (last_name || ' ' || first_name)
- No timestamps

---

### 1.5 Service Table
**Purpose:** Billable services (tests, procedures)  
**SQL Statements:**
- INSERT: `(service_name, service_cost, deleted)`
- SELECT: `service_id, service_name, service_cost, deleted FROM Service`
- UPDATE: `service_name, service_cost, deleted WHERE service_id`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| service_id | TEXT/INTEGER | Primary key (ID in UPDATE suggests TEXT, but type unclear) |
| service_name | TEXT | Service description |
| service_cost | DOUBLE | Price in VND (double precision in setDouble calls) |
| deleted | BOOLEAN/INTEGER | Soft-delete flag |

**Observations:**
- Cost stored as DOUBLE (no currency subdivision)
- No timestamps

---

### 1.6 Medicine Table
**Purpose:** Drug/medicine catalog  
**SQL Statements:**
- INSERT: `(med_name, med_company, med_description, med_unit, med_selling_price, preferred_note, supplement, deleted, route)`
- SELECT via UPDATE: `med_name, med_company, med_description, med_unit, med_selling_price, preferred_note, supplement, deleted, route`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| med_id | INTEGER | Primary key (auto-increment; referenced in OrderItem) |
| med_name | TEXT | Drug name |
| med_company | TEXT | Manufacturer |
| med_description | TEXT | Notes/description |
| med_unit | TEXT | Packaging unit (viên, ống, chai, …) |
| med_selling_price | DOUBLE | Sale price in VND |
| preferred_note | TEXT | Preference notes |
| supplement | BOOLEAN/INTEGER | Is nutritional supplement? |
| deleted | BOOLEAN/INTEGER | Soft-delete flag |
| route | TEXT | Administration route (uống=oral, tiêm=injection, …) |

**Observations:**
- Cost as DOUBLE (no currency subdivision)
- Vietnamese units common in practice
- No cost_price (margin tracking) seen in code

---

### 1.7 MedicineOrder Table
**Purpose:** One payment record per visit (aggregates prescriptions + services)  
**SQL Statements:**
- INSERT v1: `(checkup_id, customer_id, processed_by)`
- INSERT v2: `(checkup_id, customer_id, total_amount, status, payment_status)`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| checkup_id | INTEGER | Primary key or unique key (one order per checkup) |
| customer_id | INTEGER | Foreign key → Customer.customer_id |
| processed_by | INTEGER | Foreign key → User.user_id (nullable) |
| total_amount | DOUBLE | Total invoice amount in VND |
| status | TEXT | Order status (Pending, Completed?) |
| payment_status | TEXT | Enum-like: Unpaid, Paid |

**Observations:**
- Two INSERT variants suggest schema evolved or multiple code paths
- Relationship to checkup is 1:1 (checkup_id as PK)
- No timestamps or payment date

---

### 1.8 OrderItem Table
**Purpose:** Prescribed medicines (line items under MedicineOrder)  
**SQL Statements:**
- INSERT: `(prescription_id, med_id, quantity_ordered, dosage, price_per_unit, total_price, checkup_id, notes)`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| prescription_id | INTEGER | Foreign key (parent invoice); maps to MedicineOrder.prescription_id? |
| med_id | INTEGER | Foreign key → Medicine.med_id |
| quantity_ordered | INTEGER | Quantity prescribed |
| dosage | TEXT | Dosage instructions (e.g., "2 viên × 3 ngày") |
| price_per_unit | DOUBLE | Unit price at time of prescription in VND |
| total_price | DOUBLE | quantity × price_per_unit |
| checkup_id | INTEGER | Foreign key → Checkup.checkup_id (redundant denorm) |
| notes | TEXT | Notes/remarks |

**Observations:**
- prescription_id appears to be an alias or FK to MedicineOrder
- Denormalized checkup_id (also available via prescription_id)
- No line item ID observed; may use (prescription_id, med_id) as composite PK

---

### 1.9 CheckupService Table
**Purpose:** Assigned services (e.g., imaging, lab tests)  
**SQL Statements:**
- INSERT: `(checkup_id, service_id, quantity, total_cost, notes)`
- DELETE: `FROM CheckupService WHERE checkup_id`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| checkup_id | INTEGER | Foreign key → Checkup.checkup_id |
| service_id | TEXT/INTEGER | Foreign key → Service.service_id |
| quantity | INTEGER | Quantity of service |
| total_cost | DOUBLE | quantity × Service.service_cost at time of assign |
| notes | TEXT | Notes |

**Observations:**
- No explicit line item ID; may use (checkup_id, service_id) as composite PK
- Snapshot of cost at assignment time (not reactive to catalog updates)

---

### 1.10 CheckupTemplate Table
**Purpose:** Form templates for checkups (gender-specific, with customizable fields)  
**SQL Statements:**
- INSERT: `(template_gender, template_name, template_title, photo_num, print_type, content, conclusion, suggestion, diagnosis, visible, stt)`
- SELECT: `* FROM CheckupTemplate ORDER BY stt`
- UPDATE: same columns

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| template_id | INTEGER | Primary key (auto-increment) |
| template_gender | TEXT | Enum-like: any, male, female, other |
| template_name | TEXT | Template name |
| template_title | TEXT | Printed report title |
| photo_num | INTEGER | Number of photo fields expected |
| print_type | TEXT | Report layout type |
| content | TEXT | Template content/JSON (not seen in migration but in code) |
| conclusion | TEXT | Conclusion template section |
| suggestion | TEXT | Suggestion/recommendation section |
| diagnosis | TEXT | Diagnosis section |
| visible | BOOLEAN/INTEGER | Is template active? |
| stt | INTEGER | Sort/order index |

**Observations:**
- Template structure for pre-filling visit forms
- Fields likely serialized as JSON or plain text
- No timestamps

---

### 1.11 Clinic Table
**Purpose:** Clinic metadata (singleton)  
**SQL Statements:**
- SELECT: `name, address, phone, prefix FROM Clinic LIMIT 1`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| name | TEXT | Clinic name |
| address | TEXT | Clinic address |
| phone | TEXT | Clinic phone |
| prefix | TEXT | Barcode prefix (for queue tickets) |

**Observations:**
- Singleton pattern (LIMIT 1) suggests only one row expected
- No ID column seen in SELECT
- Used for report headers and barcode generation

---

### 1.12 Provinces Table (Vietnamese Geo)
**Purpose:** Lookup for patient address province/state  
**SQL Statements:**
- SELECT: `code, name FROM provinces ORDER BY name`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| code | TEXT | Province code (PK) |
| name | TEXT | Province name |

**Observations:**
- Static reference data (seeded once)
- Vietnamese administrative divisions

---

### 1.13 Wards Table (Vietnamese Geo)
**Purpose:** Sub-district lookup under province  
**SQL Statements:**
- SELECT: `name FROM wards WHERE province_code = ? ORDER BY name`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| code | TEXT | Ward code (PK) |
| province_code | TEXT | Foreign key → Provinces.code |
| name | TEXT | Ward name |

**Observations:**
- Hierarchical with Provinces
- Vietnamese administrative divisions

---

### 1.14 DailyQueueCounter Table
**Purpose:** Per-day, per-shift queue number allocation  
**SQL Statements:**
- SELECT: `current_count FROM DailyQueueCounter WHERE date = date('now', '+7 hours') AND shift = ?`
- INSERT: `INTO DailyQueueCounter (date, shift, current_count)`

**Inferred Schema:**
| Column | Type | Notes |
|--------|------|-------|
| date | DATE/TEXT | Date (clinic-local, VN timezone +7) |
| shift | INTEGER | 1=morning, 2=afternoon, 3=evening |
| current_count | INTEGER | Next queue number to assign |

**Observations:**
- Composite PK likely (date, shift)
- Incremented atomically for queue assignment
- Uses SQL date() function and timezone math (+7 hours)

---

## 2. Target Schema (Supabase Postgres, bsk.*)

Source: `/supabase/migrations/20260725*.sql`

### 2.1 bsk.app_users (Authentication enrollment)
| Column | Type | Constraints |
|--------|------|-----------|
| user_id | uuid | PK, FK → auth.users(id) ON DELETE CASCADE |
| role | bsk.app_role ENUM | NOT NULL (admin, doctor, nurse, receptionist, cashier, patient) |
| full_name | text | (optional) |
| invited_by | uuid | FK → auth.users(id) (optional) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Note:** Passwords NOT stored here; delegated to Supabase auth.users.

---

### 2.2 bsk.doctors
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| deleted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

---

### 2.3 bsk.customers (Patients)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| dob | date | (optional) |
| gender | text | CHECK (IN ('male', 'female', 'other')) |
| cccd | text | (optional) |
| phone | text | (optional) |
| province_code | text | FK → bsk.provinces(code) ON DELETE SET NULL |
| ward_code | text | FK → bsk.wards(code) ON DELETE SET NULL |
| address_detail | text | (optional) |
| deleted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Notes:**
- DOB as DATE (not epoch millis)
- Google Drive fields dropped (use Supabase Storage instead)
- Province/Ward refactored to hierarchical FKs

---

### 2.4 bsk.checkups
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| customer_id | bigint | NOT NULL FK → customers(id) |
| doctor_id | bigint | FK → doctors(id) (optional) |
| template_id | bigint | FK → checkup_templates(id) (optional) |
| shift_id | smallint | FK → shifts(id) (optional) |
| queue_number | integer | (optional) |
| checkup_date | date | NOT NULL DEFAULT (now() AT TZ 'Asia/Ho_Chi_Minh')::date |
| status | bsk.checkup_status ENUM | NOT NULL DEFAULT 'waiting' (waiting, in_progress, done) |
| checkup_type | text | (optional) |
| symptoms | text | (optional; new field) |
| diagnosis | text | (optional) |
| conclusion | text | (optional) |
| notes | text | (optional) |
| heart_beat | text | (optional) |
| blood_pressure | text | (optional) |
| temperature | numeric(4,1) | (optional; Celsius) |
| weight | numeric(5,2) | (optional; kg) |
| height | numeric(5,2) | (optional; cm) |
| recheck_date | date | (optional) |
| created_by | uuid | FK → auth.users(id) (optional) |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| deleted | boolean | NOT NULL DEFAULT false |

**Notes:**
- Dates stored as DATE (not epoch millis)
- Checkup-local "today" in VN timezone
- Vitals refactored slightly (temperature, weight, height with precision constraints)
- Google Drive fields removed (use checkup_images table instead)
- No prescription_id (OrderItems and CheckupServices link independently)

---

### 2.5 bsk.medicines (Drug catalog)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| name | text | NOT NULL |
| unit | text | (e.g., viên, ống, chai) |
| sale_price | bigint | NOT NULL DEFAULT 0 CHECK (>= 0); VND |
| cost_price | bigint | CHECK (>= 0); VND (optional) |
| company | text | (optional) |
| route | text | (e.g., uống, tiêm) |
| deleted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Notes:**
- Prices stored as INTEGER VND (no subdivision)
- Added cost_price for margin tracking
- Removed med_description and preferred_note (design simplification)

---

### 2.6 bsk.services (Service catalog)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| name | text | NOT NULL |
| price | bigint | NOT NULL DEFAULT 0 CHECK (>= 0); VND |
| deleted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Notes:**
- Price as INTEGER VND (no subdivision)

---

### 2.7 bsk.order_items (Prescribed medicines)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| checkup_id | bigint | NOT NULL FK → checkups(id) ON DELETE CASCADE |
| medicine_id | bigint | NOT NULL FK → medicines(id) |
| quantity | integer | NOT NULL CHECK (> 0) |
| dosage | text | (optional) |
| unit_price | bigint | NOT NULL CHECK (>= 0); VND snapshot |
| line_total | bigint | NOT NULL CHECK (>= 0); VND (computed) |
| notes | text | (optional) |

**Notes:**
- No prescription_id FK; only checkup_id
- Snapshots of pricing at prescription time
- No line-item ID in original; added for referential integrity

---

### 2.8 bsk.checkup_services (Assigned services)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| checkup_id | bigint | NOT NULL FK → checkups(id) ON DELETE CASCADE |
| service_id | bigint | NOT NULL FK → services(id) |
| quantity | integer | NOT NULL CHECK (> 0) |
| unit_price | bigint | NOT NULL CHECK (>= 0); VND snapshot |
| line_total | bigint | NOT NULL CHECK (>= 0); VND (computed) |

**Notes:**
- No notes field (differs from upstream CheckupService.notes)
- Snapshot pricing at assignment time

---

### 2.9 bsk.medicine_orders (Payment record per visit)
| Column | Type | Constraints |
|--------|------|-----------|
| checkup_id | bigint | PK FK → checkups(id) ON DELETE CASCADE |
| payment_status | bsk.payment_status ENUM | NOT NULL DEFAULT 'unpaid' (unpaid, paid) |
| payment_method | text | (optional) |
| processed_by | uuid | FK → auth.users(id) (optional) |
| paid_at | timestamptz | (optional) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Notes:**
- No total_amount (compute from order_items + checkup_services)
- One row per checkup (1:1 relationship)
- No status field (just payment_status)

---

### 2.10 bsk.checkup_templates (Form templates)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| name | text | NOT NULL |
| title | text | (optional) |
| gender | text | NOT NULL DEFAULT 'any' CHECK (IN ('any', 'male', 'female', 'other')) |
| photo_num | integer | NOT NULL DEFAULT 0 CHECK (>= 0) |
| fields | jsonb | NOT NULL DEFAULT '[]' |
| deleted | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Notes:**
- fields stored as JSONB (ordered array of field objects)
- Removed: print_type, content, conclusion, suggestion, diagnosis, visible, stt
  - These are part of the fields JSONB now, or dropped for simplification

---

### 2.11 bsk.clinic_settings (Singleton)
| Column | Type | Constraints |
|--------|------|-----------|
| id | boolean | PK DEFAULT true CHECK (id); ensures only one row |
| name | text | (optional) |
| address | text | (optional) |
| phone | text | (optional) |
| prefix | text | (optional) |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

---

### 2.12 bsk.provinces (Geo reference)
| Column | Type | Constraints |
|--------|------|-----------|
| code | text | PK |
| name | text | NOT NULL |

---

### 2.13 bsk.wards (Geo reference)
| Column | Type | Constraints |
|--------|------|-----------|
| code | text | PK |
| province_code | text | NOT NULL FK → provinces(code) ON DELETE CASCADE |
| name | text | NOT NULL |

---

### 2.14 bsk.shifts (Lookup)
| Column | Type | Constraints |
|--------|------|-----------|
| id | smallint | PK |
| code | text | NOT NULL UNIQUE (morning, afternoon, evening) |
| sort_order | smallint | NOT NULL DEFAULT 0 |

**Pre-seeded:**
- (1, 'morning', 1)
- (2, 'afternoon', 2)
- (3, 'evening', 3)

---

### 2.15 bsk.daily_queue_counters (Per-day queue state)
| Column | Type | Constraints |
|--------|------|-----------|
| day | date | PK part 1 |
| shift_id | smallint | PK part 2, FK → shifts(id) |
| last_number | integer | NOT NULL DEFAULT 0 |

---

### 2.16 bsk.checkup_images (Media metadata)
| Column | Type | Constraints |
|--------|------|-----------|
| id | bigint | PK GENERATED ALWAYS AS IDENTITY |
| checkup_id | bigint | NOT NULL FK → checkups(id) ON DELETE CASCADE |
| storage_path | text | NOT NULL UNIQUE (bsk-checkup-media bucket path) |
| created_by | uuid | FK → auth.users(id) (optional) |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| deleted | boolean | NOT NULL DEFAULT false |

**Notes:**
- Replaces Google Drive integration
- storage_path = {checkup_id}/{uuid}.jpg
- Media stored in bsk-checkup-media Supabase Storage bucket

---

## 3. Field-by-Field Mapping

### 3.1 User → bsk.app_users

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| user_id (TEXT/INT) | app_users.user_id (uuid) | Generate or map from auth.users(id) | Must link to existing Supabase auth.users row; create auth account if needed |
| user_name | — | Dropped | Supabase auth handles email/username |
| password | — | Dropped | Auth delegated to Supabase auth.users |
| last_name + first_name | app_users.full_name (text) | Concat: `${last_name} ${first_name}` | Optional field in target |
| role_name | app_users.role (app_role ENUM) | Case-map: admin→admin, doctor→doctor, nurse→nurse, receptionist→receptionist, cashier→cashier | Must match enum values |
| deleted | — | Dropped | Supabase treats deleted auth.users as deactivated; soft-delete via auth.users.is_deleted if present, or filter at app layer |

**Open Issues:**
- How to link upstream user_id to existing auth.users(id)? Username mapping required.
- What happens to admin users? Should first-sign-in claim_first_admin() be called post-migration?

---

### 3.2 Customer → bsk.customers

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| customer_id (INT) | customers.id (bigint) | Direct copy (or re-key if ID conflicts) | SQLite INT → PG bigint |
| customer_last_name | customers.last_name | Direct | NOT NULL |
| customer_first_name | customers.first_name | Direct | NOT NULL |
| customer_dob (epoch millis) | customers.dob (date) | `FROM_UNIXTIME(dob/1000)::date` or millis→date conversion | Handle NULL |
| customer_gender (M/F or Vietnamese) | customers.gender (text) | Map: M→'male', F→'female', Nữ→'female', Nam→'male', NULL→NULL | CHECK constraint enforces set |
| customer_number | customers.phone | Direct | TEXT → TEXT |
| customer_address | customers.address_detail | Direct | Stored in address_detail (street only, not province/ward) |
| cccd_ddcn | customers.cccd | Direct | National ID field |
| (none) | customers.province_code | Geo lookup | Parse customer_address or prompt migration script to map; see 3.14 below |
| (none) | customers.ward_code | Geo lookup | Parse customer_address or prompt migration script; depends on provinces/wards seeded |
| (none) | customers.deleted | Default to false | Upstream has no deletion flag observed in code |
| drive_folder_id | — | Dropped | Google Drive integration → Supabase Storage (no pre-migration mapping) |
| drive_url | — | Dropped | Same as above |

**Geo Data Gaps:**
- Target expects province_code + ward_code (FK to bsk.provinces/wards)
- Upstream stores only flat address string
- **Mitigation:** Migration script must either (a) parse address, (b) prompt user for manual mapping, or (c) set both to NULL and warn

---

### 3.3 Doctor → bsk.doctors

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| doctor_id (INT) | doctors.id (bigint) | Direct copy (or re-key) | SQLite INT → PG bigint |
| doctor_last_name | doctors.last_name | Direct | NOT NULL |
| doctor_first_name | doctors.first_name | Direct | NOT NULL |
| deleted (0/1) | doctors.deleted (boolean) | Direct | 0→false, 1→true |
| (none) | doctors.created_at | Default now() | Migration timestamp |

**Note:** Straightforward 1:1 mapping.

---

### 3.4 Checkup → bsk.checkups

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| checkup_id (INT) | checkups.id (bigint) | Direct copy (or re-key) | SQLite INT → PG bigint |
| customer_id (INT) | checkups.customer_id (bigint) | Direct or re-key to match bsk.customers.id | FK constraint |
| doctor_id (INT) | checkups.doctor_id (bigint) | Direct or re-key; handle NULL | FK constraint; may be NULL |
| checkup_date (epoch millis or DATE) | checkups.checkup_date (date) | `(epoch_millis/1000)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'` or parse DATE string | Clinic-local date (VN tz) |
| checkup_type (TEXT) | checkups.checkup_type (text) | Direct | General, ultrasound, etc. |
| status (TEXT) | checkups.status (checkup_status ENUM) | Case-map: waiting, in_progress, done, or Vietnamese labels → English enum | Verify Vietnamese labels in production data |
| queue_number (INT) | checkups.queue_number (integer) | Direct | May be NULL |
| shift (INT: 1/2/3) | checkups.shift_id (smallint) | Direct (1→morning, 2→afternoon, 3→evening) | FK to bsk.shifts(id) |
| suggestion | checkups.conclusion (text) | Map to conclusion field (or notes) | Semantics may differ |
| diagnosis | checkups.diagnosis (text) | Direct | Optional |
| notes | checkups.notes (text) | Direct | Optional |
| conclusion | checkups.conclusion (text) | Direct or merge with suggestion | Optional |
| reCheckupDate (epoch millis) | checkups.recheck_date (date) | Same conversion as checkup_date | Optional; follow-up date |
| customer_weight (DECIMAL) | checkups.weight (numeric 5,2) | Direct; assume kg | Optional |
| customer_height (DECIMAL) | checkups.height (numeric 5,2) | Direct; assume cm | Optional |
| heart_beat (TEXT) | checkups.heart_beat (text) | Direct (e.g., "72 bpm") | Optional |
| blood_pressure (TEXT) | checkups.blood_pressure (text) | Direct (e.g., "120/80") | Optional |
| (none) | checkups.temperature (numeric 4,1) | Dropped from upstream; default NULL | If present in actual data, add extraction |
| (none) | checkups.symptoms (text) | Dropped from upstream; default NULL | New field in target; not populated |
| (none) | checkups.template_id (bigint) | Dropped from upstream; default NULL | May need to infer or prompt |
| doctor_ultrasound_id (INT) | — | Dropped | Secondary doctor role not modeled in target |
| prescription_id (INT) | — | Dropped | Link via order_items + checkup_services instead |
| remind_date (epoch millis) | — | Dropped | Not modeled in target; can be re-added if needed |
| drive_folder_id, drive_url | — | Dropped | Use checkup_images table + Supabase Storage |
| deleted (0/1) | checkups.deleted (boolean) | Direct | 0→false, 1→true |
| (none) | checkups.created_by (uuid) | Prompt or infer from audit log | WHO created the record? Migrate from user_id mapping |
| (none) | checkups.created_at | Use now() or parse from source | Migration timestamp or source timestamp |
| (none) | checkups.updated_at | Use now() or parse from source | Post-migration, set to created_at if no update log |

**Issues:**
- status field likely has Vietnamese labels in production (ĐÃ KHÁM, ĐANG KHÁM, etc.); need mapping dict
- checkup_date timezone handling: upstream uses date('now', '+7 hours') → clinic-local date in VN tz
- doctor_ultrasound_id (secondary doctor for ultrasound) has no target; drop or add to notes
- remind_date (reminder epoch millis) dropped; re-add if needed for appointment reminders

---

### 3.5 Medicine → bsk.medicines

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| med_id (INT) | medicines.id (bigint) | Direct copy (or re-key) | SQLite INT → PG bigint |
| med_name | medicines.name | Direct | NOT NULL |
| med_unit (viên, ống, chai, …) | medicines.unit | Direct | Optional |
| med_selling_price (DOUBLE) | medicines.sale_price (bigint) | `ROUND(price * 1)` to nearest VND integer | Store as INTEGER VND; no subdivision |
| med_company | medicines.company | Direct | Optional |
| route (uống, tiêm, …) | medicines.route | Direct | Optional |
| deleted (0/1) | medicines.deleted (boolean) | Direct | 0→false, 1→true |
| med_description, preferred_note, supplement | — | Dropped | Simplification; can re-add if needed |
| (none) | medicines.cost_price (bigint) | Not in upstream; default NULL | New field for margin tracking |
| (none) | medicines.created_at | Use now() | Migration timestamp |

**Note:** Straightforward mapping; price conversion to integer VND is critical.

---

### 3.6 Service → bsk.services

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| service_id (TEXT or INT) | services.id (bigint) | Re-key as bigint IDENTITY | SQLite ID may be TEXT; PG expects bigint |
| service_name | services.name | Direct | NOT NULL |
| service_cost (DOUBLE) | services.price (bigint) | `ROUND(cost * 1)` to nearest VND integer | Store as INTEGER VND |
| deleted (0/1) | services.deleted (boolean) | Direct | 0→false, 1→true |
| (none) | services.created_at | Use now() | Migration timestamp |

---

### 3.7 Medicine Order + Order Item → bsk.order_items + bsk.medicine_orders

**Upstream structure (inferred):**
- MedicineOrder: checkup_id (PK?), customer_id, processed_by, total_amount, status, payment_status
- OrderItem: prescription_id (FK to MedicineOrder), med_id, quantity_ordered, dosage, price_per_unit, total_price, checkup_id, notes

**Target structure:**
- order_items: id (PK), checkup_id (FK), medicine_id, quantity, dosage, unit_price, line_total, notes
- medicine_orders: checkup_id (PK FK), payment_status, payment_method, processed_by, paid_at, created_at

**Mapping:**

| Upstream | Target | Transform | Notes |
|------|------|-----------|-------|
| MedicineOrder.checkup_id | order_items.checkup_id; medicine_orders.checkup_id | Direct | 1:1 checkup ↔ medicine_orders |
| MedicineOrder.customer_id | — | Dropped | Redundant; can be joined via checkup→customer |
| MedicineOrder.processed_by | medicine_orders.processed_by | Direct; FK to auth.users(id) | Requires user_id→auth.users mapping |
| MedicineOrder.total_amount | — | Computed from order_items | SUM(line_total) + SUM(checkup_services.line_total) |
| MedicineOrder.status | — | Dropped | No equivalent in target |
| MedicineOrder.payment_status | medicine_orders.payment_status (ENUM) | Direct: Unpaid→'unpaid', Paid→'paid' | Must match enum |
| (none) | medicine_orders.payment_method | Default NULL or parse from status | Not in upstream MedicineOrder |
| (none) | medicine_orders.paid_at | Infer: if payment_status='paid', use now(); else NULL | Payment timestamp |
| OrderItem.prescription_id | — | Dropped | Use checkup_id instead |
| OrderItem.med_id | order_items.medicine_id | Direct or re-key | FK to bsk.medicines(id) |
| OrderItem.quantity_ordered | order_items.quantity | Direct | NOT NULL CHECK (>0) |
| OrderItem.dosage | order_items.dosage | Direct | Optional |
| OrderItem.price_per_unit | order_items.unit_price (bigint) | Same conversion as medicines.sale_price | INTEGER VND |
| OrderItem.total_price | order_items.line_total (bigint) | Same conversion to INTEGER VND | Verify = quantity × unit_price |
| OrderItem.checkup_id | order_items.checkup_id | Direct (redundant denorm) | FK constraint |
| OrderItem.notes | order_items.notes | Direct | Optional |

**Issues:**
- prescription_id in OrderItem may refer to Checkup.prescription_id (not a separate table)
- payment_status value mapping: verify actual VARCHAR values in production data
- No payment_method in upstream; target defaults NULL
- No paid_at timestamp upstream; infer from payment_status logic

---

### 3.8 Checkup Service → bsk.checkup_services

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| checkup_id | checkup_services.checkup_id | Direct | FK to bsk.checkups(id) |
| service_id (TEXT or INT) | checkup_services.service_id (bigint) | Re-key if TEXT; direct if INT | FK to bsk.services(id) after re-keying |
| quantity (INT) | checkup_services.quantity (integer) | Direct | NOT NULL CHECK (>0) |
| total_cost (DOUBLE) | checkup_services.unit_price (bigint) | Compute: total_cost / quantity, or snapshot from Service catalog | Line unit price (VND integer) |
| (none) | checkup_services.line_total (bigint) | Direct from total_cost after VND conversion | Verify = quantity × unit_price |
| notes | — | Dropped | Not in target checkup_services |

**Note:** No line-item ID in upstream; target adds one (id GENERATED ALWAYS AS IDENTITY).

---

### 3.9 Checkup Template → bsk.checkup_templates

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| template_id (INT) | checkup_templates.id (bigint) | Direct copy (or re-key) | SQLite INT → PG bigint |
| template_name | checkup_templates.name | Direct | NOT NULL |
| template_title | checkup_templates.title | Direct | Optional |
| template_gender | checkup_templates.gender | Direct or map (any, male, female, other) | CHECK constraint |
| photo_num (INT) | checkup_templates.photo_num (integer) | Direct | NOT NULL DEFAULT 0 |
| fields (JSONB or serialized) | checkup_templates.fields (jsonb) | Parse content/print_type/etc. into JSONB array | Complex; may need custom logic |
| print_type, content, conclusion, suggestion, diagnosis, visible, stt | checkup_templates.fields (JSONB) | Collapse into fields JSONB object array | Target design simplifies template structure |
| deleted (0/1) | checkup_templates.deleted (boolean) | Direct | 0→false, 1→true |
| (none) | checkup_templates.created_at | Use now() | Migration timestamp |

**Issue:**
- Upstream has separate columns for content, conclusion, suggestion, diagnosis, print_type, visible, stt
- Target consolidates into a single fields JSONB array
- **Migration:** Serialize upstream columns into JSONB; exact format depends on schema design (ask or infer from app code)

---

### 3.10 Clinic → bsk.clinic_settings

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| name | clinic_settings.name | Direct | Optional (singleton enforces max 1 row) |
| address | clinic_settings.address | Direct | Optional |
| phone | clinic_settings.phone | Direct | Optional |
| prefix | clinic_settings.prefix | Direct | Optional; used for barcode prefix |
| (none) | clinic_settings.id | Set to TRUE | Singleton constraint (CHECK id) |
| (none) | clinic_settings.updated_at | Use now() | Migration timestamp |

**Note:** Only one row expected; insert if none exists.

---

### 3.11 Provinces → bsk.provinces

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| code | provinces.code | Direct | PK |
| name | provinces.name | Direct | NOT NULL |

**Note:** Static reference data; seed from upstream if present, or use default Vietnamese province list.

---

### 3.12 Wards → bsk.wards

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| code | wards.code | Direct | PK |
| province_code | wards.province_code | Direct | FK to provinces(code) |
| name | wards.name | Direct | NOT NULL |

**Note:** Depends on provinces being seeded first.

---

### 3.13 Daily Queue Counter → bsk.daily_queue_counters

| Upstream (SQLite) | Target (Postgres) | Transform | Notes |
|------|------|-----------|-------|
| date | daily_queue_counters.day | Direct (date type) | PK part 1; ensure date format YYYY-MM-DD |
| shift (INT: 1/2/3) | daily_queue_counters.shift_id | Direct | PK part 2; FK to bsk.shifts(id) |
| current_count (INT) | daily_queue_counters.last_number | Direct | Last assigned queue number for the day+shift |

**Note:** Shifts table pre-seeded in target (morning=1, afternoon=2, evening=3).

---

### 3.14 Geo Mapping Workaround (Customers)

**Problem:** Upstream Customer.customer_address is a flat string; target expects province_code + ward_code.

**Options:**
1. **Parse address string:** Use regex/NLP to extract province/ward from customer_address (fragile, error-prone).
2. **Set to NULL:** Migrate address_detail as-is; leave province/ward NULL; prompt admin to fill post-migration (safest).
3. **Fuzzy match:** If provinces/wards are seeded with Vietnamese names, fuzzy-match customer_address against them (moderate effort, moderate error).
4. **Manual mapping file:** Provide CSV of upstream customer_id → (province_code, ward_code) to be applied during migration.

**Recommendation:** **Option 2 (set to NULL)** with warning logged for each customer; post-migration, admin can batch-update via UI or script.

---

## 4. Data Migration Order (FK Dependencies)

**Order to insert/migrate (dependencies first):**

1. **bsk.shifts** ← Pre-seeded (idempotent)
2. **bsk.provinces** ← Static geo data (upstream if present, else seed from standard VN list)
3. **bsk.wards** ← Depends on provinces
4. **bsk.clinic_settings** ← Independent; insert singleton if not exists
5. **bsk.doctors** ← Independent
6. **bsk.medicines** ← Independent
7. **bsk.services** ← Independent
8. **bsk.checkup_templates** ← Independent
9. **auth.users** ← Independent; must pre-create or map existing users
10. **bsk.app_users** ← Depends on auth.users; map from User table
11. **bsk.customers** ← Independent (province/ward_code may be NULL if geo not present)
12. **bsk.checkups** ← Depends on customers, doctors (optional), checkup_templates (optional), shifts, auth.users (created_by)
13. **bsk.daily_queue_counters** ← Depends on shifts; should preserve if historical data needed
14. **bsk.order_items** ← Depends on checkups, medicines; insert from upstream OrderItem
15. **bsk.checkup_services** ← Depends on checkups, services; insert from upstream CheckupService
16. **bsk.medicine_orders** ← Depends on checkups; insert or create from upstream MedicineOrder
17. **bsk.checkup_images** ← Depends on checkups; will be NULL (Google Drive media not migrated; future uploads via Supabase Storage)

---

## 5. Known Gaps and Unmappable Data

### 5.1 Upstream Data with No Target

| Upstream Column/Table | Reason Dropped | Workaround |
|------|------|-----------|
| User.user_name, password | Auth delegated to Supabase auth.users | Pre-create auth users or map via email lookup |
| Customer.drive_folder_id, drive_url | Google Drive → Supabase Storage | Ignore; future uploads via checkup_images + Storage |
| Checkup.doctor_ultrasound_id | Secondary doctor role not modeled | Drop; add note if needed via checkup.notes |
| Checkup.prescription_id | Inferred table; not seen in code | Use order_items.checkup_id + checkup_services.checkup_id instead |
| Checkup.remind_date | Appointment reminder timestamp | Drop; re-add if needed for appointment reminders |
| Medicine.med_description, preferred_note, supplement | Simplification | Drop; can re-add to medicines table if clinically needed |
| Service.notes | Not stored on CheckupService in target | Drop from checkup_services; add to checkup.notes if needed |
| CheckupTemplate: print_type, content, conclusion, suggestion, diagnosis, visible, stt | Consolidated into fields JSONB | Serialize into JSON during migration |

### 5.2 Target Columns with No Source

| Target Column | Upstream Equivalent | Default/Workaround |
|------|------|-----------|
| app_users.invited_by | Not in User table | Set to NULL; indicates first-admin or manual invite |
| customers.province_code, ward_code | Geo not in upstream | Set to NULL; prompt post-migration admin fill-in |
| customers.deleted | No soft-delete in upstream | Default false (all customers active) |
| checkups.symptoms | Not in upstream Checkup | Default NULL; can be filled by clinician post-migration |
| checkups.template_id | Not in upstream Checkup | Infer or default NULL; assign post-migration if needed |
| checkups.created_by | Not in upstream Checkup | Infer from audit log or set to null; critical for audit trail |
| medicines.cost_price | Not in upstream Medicine | Default NULL; can be set post-migration for margin tracking |
| medicine_orders.payment_method | Not in upstream MedicineOrder | Default NULL; set post-migration during payment |
| medicine_orders.paid_at | Not in upstream MedicineOrder | Infer: if payment_status='paid', use now(); else NULL |
| checkup_images (entire table) | Upstream stores Google Drive IDs | Not migrated; future images via Supabase Storage |

### 5.3 Data Semantics & Enum Mappings

**Status Values (Checkup.status):**
- Upstream likely uses Vietnamese labels: ĐÃ KHÁM (done), ĐANG KHÁM (in_progress), CHỜ KHÁM (waiting), etc.
- Target uses English ENUM: 'waiting', 'in_progress', 'done'
- **Migration:** Extract actual status values from production SQLite; build mapping dict before migration.

**Payment Status Values (MedicineOrder.payment_status):**
- Upstream: "Unpaid", "Paid", "Pending"?
- Target ENUM: 'unpaid', 'paid'
- **Migration:** Normalize to lowercase enum values; drop "Pending" or map to 'unpaid'.

**Gender Values (Customer.customer_gender):**
- Upstream likely: M/F or Nữ/Nam or Khác
- Target CHECK: 'male', 'female', 'other'
- **Migration:** Case map M→'male', F→'female', Nữ→'female', Nam→'male', else→'other'

**Date/Timestamp Formats:**
- Upstream: Epoch milliseconds (Java System.currentTimeMillis())
- Target: ISO 8601 date (YYYY-MM-DD) and timestamptz
- **Migration:** Divide millis by 1000, convert to timestamp, apply TZ offset, extract date for DATE columns.

---

## 6. Critical Migration Script Considerations

### 6.1 ID Re-keying Strategy

**Issue:** Upstream uses INT primary keys; target uses BIGINT GENERATED ALWAYS AS IDENTITY.

**Option A: Preserve IDs (Simple)**
- Insert with explicit ID: `INSERT INTO customers (id, ...) VALUES (upstream_id, ...)`
- Requires disabling PG's identity auto-generation or using explicit sequence manipulation
- Pro: Checkup.customer_id, Medicine.med_id references remain valid
- Con: ID gaps/sparsity if upstream has deletions; less idiomatic for BIGINT IDENTITY

**Option B: Re-key IDs (Clean)**
- Let PG auto-generate new BIGINT IDs
- Create upstream_id → new_id mapping table
- Update all FKs in subsequent inserts (order_items.medicine_id, checkups.doctor_id, etc.)
- Pro: Clean BIGINT IDENTITY sequences; no gaps
- Con: More complex; requires mapping table and multi-pass migration

**Recommendation:** **Option A (preserve IDs)** for simplicity if upstream has <9B rows and contiguous IDs.

### 6.2 Timezone Handling

**Upstream:** Uses SQL `date('now', '+7 hours')` for clinic-local date in Vietnam timezone (UTC+7).

**Target:** Uses `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` for same effect.

**During Migration:**
- When converting Checkup.checkup_date (epoch millis), apply timezone offset:
  ```
  (to_timestamp(epoch_millis / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ```
- When converting Checkup.reCheckupDate, same logic.
- Ensure queue counters (DailyQueueCounter.date) are preserved exactly; they're keyed by clinic-local date.

### 6.3 User/Auth Integration

**Upstream:** User.user_id is just a column; no external auth system.

**Target:** user_id must FK to auth.users(id), which is a Supabase-managed UUID.

**Strategy:**
1. Before migration, create auth.users rows for each upstream User:
   - Email: infer from user_name + domain (e.g., username@clinic.local)
   - Confirm user_id (uuid) from Supabase auth.users
2. Build mapping: upstream.user_id → auth.users(id)
3. During migration, use mapped auth.users(id) for bsk.app_users.user_id

**First Admin:**
- After migration, if no admin exists in bsk.app_users, call `bsk.claim_first_admin(first_auth_user_id)`
- Alternatively, insert manually: `INSERT INTO bsk.app_users (user_id, role) VALUES (uuid, 'admin')`

### 6.4 Geo Data (Provinces/Wards)

**Upstream:** Does not explicitly store province/ward codes; Customer has flat address string.

**Target:** Requires bsk.provinces + bsk.wards seeded; Customer.province_code FK.

**Strategy:**
1. Seed bsk.provinces + bsk.wards from standard Vietnamese administrative data (available in public datasets or hard-code).
2. During Customer migration, set province_code + ward_code to NULL.
3. Post-migration, prompt admin to bulk-update customers with geolocation (via UI or script).

---

## 7. Unresolved Questions

1. **Actual Status Values:** What are the exact VARCHAR values for Checkup.status in production SQLite? (e.g., "ĐÃ KHÁM" vs "DONE" vs "Completed")
   - **Impact:** Enum mapping for Checkup.status
   - **Resolution:** Run `SELECT DISTINCT status FROM Checkup` on upstream database

2. **User ID Format:** Is upstream User.user_id an INTEGER or TEXT/VARCHAR?
   - **Impact:** FK mapping to auth.users(uuid)
   - **Resolution:** Inspect upstream schema or sample data

3. **Checkup.prescription_id Semantics:** Is prescription_id a column in the actual Checkup table, or inferred from code?
   - **Impact:** Whether to preserve or drop during migration
   - **Resolution:** Inspect actual upstream SQLite schema (e.g., via `.schema Checkup` in sqlite3)

4. **Google Drive Media:** Are any Google Drive IDs (drive_folder_id, drive_url) actually populated in production?
   - **Impact:** Whether to archive them or ignore
   - **Resolution:** Run `SELECT COUNT(*) FROM Checkup WHERE drive_folder_id IS NOT NULL` on upstream

5. **Appointment Reminders:** Is Checkup.remind_date used for appointment scheduling/notifications?
   - **Impact:** Whether to preserve or drop
   - **Resolution:** Check app code for remind_date usage

6. **Payment Dates:** When was an order marked paid? Upstream MedicineOrder has payment_status but no paid_at timestamp.
   - **Impact:** medicine_orders.paid_at will be inferred or NULL
   - **Resolution:** Inspect audit logs or payment records in upstream if available

7. **Clinic Settings:** Is the Clinic table definitely singleton, or can there be multiple clinic records?
   - **Impact:** Migration INSERT strategy
   - **Resolution:** Run `SELECT COUNT(*) FROM Clinic` on upstream

---

## 8. Summary of Key Transforms

| Upstream → Target | Type | Complexity | Notes |
|------|------|-----------|-------|
| SQLite INT → PG BIGINT | Type | Low | Lossless; handle NULL |
| Epoch millis → DATE/TIMESTAMPTZ | Type + TZ | Medium | Apply TZ offset for VN clinic-local dates |
| User.user_id → auth.users(id) | Schema | High | Requires pre-creating auth users; mapping table needed |
| Customer.address_string → province_code + ward_code | Geo | High | No direct mapping; set NULL and prompt post-migration |
| Checkup.status (Vietnamese?) → ENUM (English) | Enum | Medium | Build mapping dict from production data |
| Google Drive IDs → Supabase Storage | Storage | N/A | Not migrated; future uploads via checkup_images + bucket |
| CheckupTemplate columns → fields JSONB | Schema | Medium | Serialize content/conclusion/etc. into JSON array |
| MedicineOrder + OrderItem → order_items + medicine_orders | Schema | High | One-to-many unwinding; FK relationship changes |

---

## 9. Migration Script Pseudocode Outline

```sql
-- 1. Pre-migration: Create auth.users for all upstream users (external step)
-- 2. Pre-migration: Seed bsk.provinces + bsk.wards (idempotent, already in migrations)
-- 3. Pre-migration: Seed bsk.shifts (already in migrations)
-- 4. Disable triggers/RLS for bulk insert (if needed)

BEGIN TRANSACTION;

-- 5. Migrate static/reference data
INSERT INTO bsk.clinic_settings (id, name, address, phone, prefix) 
  SELECT true, name, address, phone, prefix FROM sqlite_source.clinic 
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, address = EXCLUDED.address, 
    phone = EXCLUDED.phone, prefix = EXCLUDED.prefix;

-- 6. Migrate doctors
INSERT INTO bsk.doctors (id, first_name, last_name, deleted, created_at)
  SELECT doctor_id, doctor_first_name, doctor_last_name, deleted, now()
  FROM sqlite_source.doctor;

-- 7. Migrate medicines
INSERT INTO bsk.medicines (id, name, unit, sale_price, cost_price, company, route, deleted, created_at)
  SELECT med_id, med_name, med_unit, 
         CAST(ROUND(med_selling_price) AS bigint), 
         NULL, med_company, route, deleted, now()
  FROM sqlite_source.medicine;

-- 8. Migrate services
INSERT INTO bsk.services (id, name, price, deleted, created_at)
  SELECT service_id, service_name, 
         CAST(ROUND(service_cost) AS bigint), 
         deleted, now()
  FROM sqlite_source.service;

-- 9. Migrate checkup templates
INSERT INTO bsk.checkup_templates (id, name, title, gender, photo_num, fields, deleted, created_at)
  SELECT template_id, template_name, template_title, template_gender, photo_num,
         -- Serialize fields: [{label, value, type}] from columns
         jsonb_build_array(
           jsonb_build_object('name', 'content', 'value', content),
           jsonb_build_object('name', 'conclusion', 'value', conclusion),
           jsonb_build_object('name', 'suggestion', 'value', suggestion),
           jsonb_build_object('name', 'diagnosis', 'value', diagnosis)
         ),
         deleted, now()
  FROM sqlite_source.checkup_template;

-- 10. Migrate app users (requires auth.users pre-created; use mapping table)
INSERT INTO bsk.app_users (user_id, role, full_name, created_at)
  SELECT auth_mapping.auth_id, 
         CASE WHEN upstream_user.role_name = 'admin' THEN 'admin'::bsk.app_role
              WHEN upstream_user.role_name = 'doctor' THEN 'doctor'::bsk.app_role
              -- ... map others
              ELSE 'receptionist'::bsk.app_role END,
         CONCAT(upstream_user.last_name, ' ', upstream_user.first_name),
         now()
  FROM sqlite_source.user AS upstream_user
  JOIN id_mapping.user_to_auth AS auth_mapping 
    ON upstream_user.user_id = auth_mapping.upstream_id;

-- 11. Migrate customers (province/ward_code = NULL for now)
INSERT INTO bsk.customers (id, first_name, last_name, dob, gender, cccd, phone, 
                           province_code, ward_code, address_detail, deleted, created_at)
  SELECT customer_id, customer_first_name, customer_last_name,
         CASE WHEN customer_dob IS NOT NULL 
              THEN (to_timestamp(customer_dob / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date 
              ELSE NULL END,
         CASE WHEN customer_gender IN ('M', 'Nam') THEN 'male'
              WHEN customer_gender IN ('F', 'Nữ') THEN 'female'
              ELSE 'other' END,
         cccd_ddcn, customer_number, 
         NULL, NULL,  -- province/ward to be filled post-migration
         customer_address, false, now()
  FROM sqlite_source.customer;

-- 12. Migrate checkups
INSERT INTO bsk.checkups (id, customer_id, doctor_id, template_id, shift_id, queue_number,
                          checkup_date, status, checkup_type, symptoms, diagnosis, conclusion, notes,
                          heart_beat, blood_pressure, temperature, weight, height, recheck_date,
                          created_by, created_at, updated_at, deleted)
  SELECT checkup_id, customer_id, doctor_id, NULL, shift, queue_number,
         CASE WHEN checkup_date IS NOT NULL
              THEN (to_timestamp(checkup_date / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              ELSE (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date END,
         CASE WHEN status = 'ĐÃ KHÁM' THEN 'done'::bsk.checkup_status
              WHEN status = 'ĐANG KHÁM' THEN 'in_progress'::bsk.checkup_status
              ELSE 'waiting'::bsk.checkup_status END,
         checkup_type, NULL, diagnosis, conclusion, notes, 
         heart_beat, blood_pressure, NULL, customer_weight, customer_height,
         CASE WHEN reCheckupDate IS NOT NULL
              THEN (to_timestamp(reCheckupDate / 1000) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              ELSE NULL END,
         NULL,  -- created_by to be filled from audit or default
         now(), now(), false
  FROM sqlite_source.checkup;

-- 13. Migrate daily queue counters (preserve if exists)
INSERT INTO bsk.daily_queue_counters (day, shift_id, last_number)
  SELECT date, shift, current_count
  FROM sqlite_source.daily_queue_counter
  WHERE shift IN (1, 2, 3)
  ON CONFLICT (day, shift_id) DO NOTHING;

-- 14. Migrate order items
INSERT INTO bsk.order_items (checkup_id, medicine_id, quantity, dosage, unit_price, line_total, notes)
  SELECT checkup_id, med_id, quantity_ordered, dosage,
         CAST(ROUND(price_per_unit) AS bigint),
         CAST(ROUND(total_price) AS bigint),
         notes
  FROM sqlite_source.order_item;

-- 15. Migrate checkup services
INSERT INTO bsk.checkup_services (checkup_id, service_id, quantity, unit_price, line_total)
  SELECT checkup_id, service_id, quantity,
         CAST(ROUND(total_cost / quantity) AS bigint),
         CAST(ROUND(total_cost) AS bigint)
  FROM sqlite_source.checkup_service;

-- 16. Migrate/create medicine orders (aggregate from order_items)
INSERT INTO bsk.medicine_orders (checkup_id, payment_status, payment_method, processed_by, paid_at, created_at)
  SELECT DISTINCT checkup_id, 
         CASE WHEN payment_status = 'Paid' THEN 'paid'::bsk.payment_status
              ELSE 'unpaid'::bsk.payment_status END,
         NULL, NULL,
         CASE WHEN payment_status = 'Paid' THEN now() ELSE NULL END,
         now()
  FROM sqlite_source.medicine_order
  ON CONFLICT (checkup_id) DO NOTHING;

COMMIT;

-- 17. Re-enable triggers/RLS

-- 18. Verify row counts
SELECT 'bsk.doctors' AS table_name, COUNT(*) FROM bsk.doctors
UNION ALL
SELECT 'bsk.customers', COUNT(*) FROM bsk.customers
UNION ALL
SELECT 'bsk.checkups', COUNT(*) FROM bsk.checkups
UNION ALL
SELECT 'bsk.order_items', COUNT(*) FROM bsk.order_items;
```

---

## 10. Summary & Recommendations

### Do/Don't

✅ **DO:**
- Preserve checkup IDs (customer_id, doctor_id, medicine_id all reference checkup_id)
- Migrate soft-delete flags (deleted boolean)
- Snapshot service/medicine prices in order_items/checkup_services at migration time
- Set province_code + ward_code to NULL; post-migration admin fill
- Build a status mapping dict from actual production Checkup.status values
- Test timezone conversion on a sample checkup_date (ensure clinic-local date is preserved)

❌ **DON'T:**
- Migrate Google Drive IDs/URLs (no target mapping; ignore gracefully)
- Use plaintext passwords from User.password (auth delegated to Supabase)
- Re-key bigint IDs unless absolutely necessary (preserves referential integrity)
- Assume status values are English (inspect production data first)
- Forget to create auth.users rows before migrating User table

### Migration Phases

1. **Phase 0 (Pre-migration):** Create auth.users for all staff; build user_id→uuid mapping.
2. **Phase 1 (Reference Data):** Migrate doctors, medicines, services, templates, clinic_settings, provinces, wards, shifts.
3. **Phase 2 (Core):** Migrate customers, checkups, daily_queue_counters.
4. **Phase 3 (Billing):** Migrate order_items, checkup_services, medicine_orders.
5. **Phase 4 (Verification):** Validate row counts, FK integrity, sample data accuracy.
6. **Phase 5 (Post-migration):** Prompt admin to fill geo data (province_code, ward_code); re-enable RLS; smoke test UI.

### Timeline Estimate

- **Simple clinic (<10K checkups):** 1–2 hours dev + 30 min execution
- **Medium clinic (10K–100K checkups):** 2–4 hours dev + 2–3 hours execution (testing, re-tries)
- **Large clinic (>100K checkups):** 4–8 hours dev + 4–6 hours execution + post-migration QA

---

**End of Report**

**Prepared by:** Technical Analyst (Researcher agent)  
**Date:** 2026-08-18  
**Report Path:** `/config/workspace/tiennm99dev/bsk/plans/reports/researcher-260818-1712-upstream-sqlite-to-supabase-migration-mapping-report.md`
