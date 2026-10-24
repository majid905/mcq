-- =====================================================================
-- MCQ Exam Platform — MySQL 8.4 LTS schema (source of truth)
-- Engine InnoDB, charset utf8mb4, collation utf8mb4_unicode_ci
-- Times are UTC DATETIME(3). IDs BIGINT UNSIGNED (sent as strings in JSON).
-- Apply: mysql -u root -p mcq < database/schema.sql ; then `prisma db pull`
-- =====================================================================

CREATE DATABASE IF NOT EXISTS mcq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mcq;
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Users & auth
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone            VARCHAR(14)  NOT NULL,              -- 01XXXXXXXXX (11 digits) stored normalized
  phone_verified_at DATETIME(3) NULL,
  name             VARCHAR(100) NOT NULL,
  password_hash    VARCHAR(255) NULL,
  google_sub       VARCHAR(64)  NULL,
  avatar_url       VARCHAR(500) NULL,
  district_id      SMALLINT UNSIGNED NULL,             -- 1..64, see districts
  target_node_ids  JSON NULL,                          -- selected exam categories (taxonomy ids)
  locale           ENUM('bn','en') NOT NULL DEFAULT 'bn',
  theme            ENUM('system','light','dark') NOT NULL DEFAULT 'system',
  status           ENUM('active','banned','deleted') NOT NULL DEFAULT 'active',
  trial_used       TINYINT(1) NOT NULL DEFAULT 0,
  device_resets_30d TINYINT UNSIGNED NOT NULL DEFAULT 0,
  failed_logins    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until     DATETIME(3) NULL,
  last_active_at   DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_google (google_sub),
  KEY ix_users_district (district_id),
  KEY ix_users_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE districts (
  id        SMALLINT UNSIGNED NOT NULL,
  name_bn   VARCHAR(50) NOT NULL,
  name_en   VARCHAR(50) NOT NULL,
  division  VARCHAR(30) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE user_devices (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  device_id       VARCHAR(128) NOT NULL,               -- app-generated UUID stored in secure storage
  kind            ENUM('mobile','web') NOT NULL,
  platform        ENUM('android','ios','web') NOT NULL,
  model           VARCHAR(100) NULL,
  app_version     VARCHAR(20)  NULL,
  push_token      VARCHAR(255) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at    DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_device (user_id, device_id),
  KEY ix_device_active (user_id, kind, is_active),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  device_row_id BIGINT UNSIGNED NOT NULL,
  family_id     CHAR(36) NOT NULL,                     -- rotation family; reuse => revoke family
  token_hash    CHAR(64) NOT NULL,                     -- sha256
  expires_at    DATETIME(3) NOT NULL,
  revoked_at    DATETIME(3) NULL,
  replaced_by   BIGINT UNSIGNED NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rt_hash (token_hash),
  KEY ix_rt_family (family_id),
  KEY ix_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rt_device FOREIGN KEY (device_row_id) REFERENCES user_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- OTP codes live in Redis only (otp:{phone}, 5 min TTL, attempt counter).

-- ---------------------------------------------------------------------
-- 2. Taxonomy & questions
-- ---------------------------------------------------------------------
CREATE TABLE taxonomy_nodes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id   INT UNSIGNED NULL,
  type        ENUM('category','subject','chapter','topic') NOT NULL,
  name_bn     VARCHAR(150) NOT NULL,
  name_en     VARCHAR(150) NOT NULL,
  slug        VARCHAR(160) NOT NULL,
  path        VARCHAR(255) NOT NULL,                   -- materialized path "/1/12/130/" for subtree queries
  depth       TINYINT UNSIGNED NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  icon        VARCHAR(50) NULL,
  question_count INT UNSIGNED NOT NULL DEFAULT 0,      -- published questions in subtree (worker-maintained)
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tax_slug (parent_id, slug),
  KEY ix_tax_parent (parent_id, sort_order),
  KEY ix_tax_path (path),
  CONSTRAINT fk_tax_parent FOREIGN KEY (parent_id) REFERENCES taxonomy_nodes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE source_exams (                            -- e.g. "45th BCS Preliminary", "Sonali Bank SO 2023"
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  name_bn     VARCHAR(200) NOT NULL,
  name_en     VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) NOT NULL,
  year        SMALLINT UNSIGNED NOT NULL,
  held_on     DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_slug (slug),
  KEY ix_source_cat_year (category_id, year),
  CONSTRAINT fk_source_cat FOREIGN KEY (category_id) REFERENCES taxonomy_nodes(id)
) ENGINE=InnoDB;

CREATE TABLE questions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  body            MEDIUMTEXT NOT NULL,                 -- sanitized HTML (rich text, KaTeX markup, <img> R2 urls)
  body_text       TEXT NOT NULL,                       -- plain text for hash/search/SEO
  options         JSON NOT NULL,                       -- [{"key":"a","html":"..."},{"key":"b",...}] 4–5 items
  correct_option  CHAR(1) NOT NULL,                    -- 'a'..'e'
  explanation     MEDIUMTEXT NULL,
  difficulty      TINYINT UNSIGNED NOT NULL DEFAULT 3, -- 1..5
  status          ENUM('draft','in_review','published','archived') NOT NULL DEFAULT 'draft',
  source_exam_id  INT UNSIGNED NULL,
  source_year     SMALLINT UNSIGNED NULL,
  primary_node_id INT UNSIGNED NOT NULL,               -- main topic (for stats); all tags in question_tags
  slug            VARCHAR(200) NULL,                   -- public SEO url
  content_hash    CHAR(64) NOT NULL,                   -- sha256 of normalized body_text + options
  is_premium      TINYINT(1) NOT NULL DEFAULT 0,
  times_answered  INT UNSIGNED NOT NULL DEFAULT 0,     -- worker-maintained
  times_correct   INT UNSIGNED NOT NULL DEFAULT 0,
  created_by      INT UNSIGNED NULL,                   -- admins.id
  reviewed_by     INT UNSIGNED NULL,
  published_at    DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_q_hash (content_hash),
  UNIQUE KEY uq_q_slug (slug),
  KEY ix_q_status_node (status, primary_node_id, id),
  KEY ix_q_source (source_exam_id),
  KEY ix_q_year (source_year),
  KEY ix_q_updated (updated_at),
  CONSTRAINT fk_q_node FOREIGN KEY (primary_node_id) REFERENCES taxonomy_nodes(id),
  CONSTRAINT fk_q_source FOREIGN KEY (source_exam_id) REFERENCES source_exams(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE question_tags (
  question_id BIGINT UNSIGNED NOT NULL,
  node_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (question_id, node_id),
  KEY ix_qt_node (node_id, question_id),
  CONSTRAINT fk_qt_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_qt_node FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE search_outbox (                           -- worker syncs to Meilisearch
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  action      ENUM('upsert','delete') NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_outbox_pending (processed_at, id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Exams
-- ---------------------------------------------------------------------
CREATE TABLE exams (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type              ENUM('live','model','previous_year') NOT NULL DEFAULT 'live',
  category_id       INT UNSIGNED NOT NULL,
  title_bn          VARCHAR(255) NOT NULL,
  title_en          VARCHAR(255) NOT NULL,
  slug              VARCHAR(255) NOT NULL,
  description       TEXT NULL,
  syllabus          JSON NULL,                         -- [{"node_id":12,"label":"বাংলা","questions":35,"marks":35}]
  blueprint         JSON NULL,                         -- auto-generate rules
  source_exam_id    INT UNSIGNED NULL,                 -- for previous_year papers
  start_at          DATETIME(3) NULL,                  -- NULL for anytime model/previous_year
  end_at            DATETIME(3) NULL,
  duration_sec      INT UNSIGNED NOT NULL,
  question_count    SMALLINT UNSIGNED NOT NULL,
  mark_per_question DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  negative_mark     DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  total_marks       DECIMAL(6,2) NOT NULL,
  pass_marks        DECIMAL(6,2) NULL,
  is_premium        TINYINT(1) NOT NULL DEFAULT 1,
  shuffle_questions TINYINT(1) NOT NULL DEFAULT 1,
  shuffle_options   TINYINT(1) NOT NULL DEFAULT 1,
  result_publish_at DATETIME(3) NULL,                  -- default end_at + 5 min
  status            ENUM('draft','scheduled','running','ended','merit_published','cancelled') NOT NULL DEFAULT 'draft',
  paper_version     INT UNSIGNED NOT NULL DEFAULT 1,
  paper_url         VARCHAR(500) NULL,                 -- CDN url of paper JSON
  participant_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by        INT UNSIGNED NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_slug (slug),
  KEY ix_exam_list (category_id, type, status, start_at),
  KEY ix_exam_start (status, start_at),
  CONSTRAINT fk_exam_cat FOREIGN KEY (category_id) REFERENCES taxonomy_nodes(id),
  CONSTRAINT fk_exam_source FOREIGN KEY (source_exam_id) REFERENCES source_exams(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE exam_questions (
  exam_id     BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL,
  section_node_id INT UNSIGNED NULL,                   -- subject section for breakdown
  PRIMARY KEY (exam_id, question_id),
  UNIQUE KEY uq_eq_pos (exam_id, position),
  KEY ix_eq_question (question_id),
  CONSTRAINT fk_eq_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_eq_q FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;

CREATE TABLE exam_reminders (
  user_id  BIGINT UNSIGNED NOT NULL,
  exam_id  BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (exam_id, user_id),
  KEY ix_rem_user (user_id),
  CONSTRAINT fk_rem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rem_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Attempts (big table) — monthly RANGE partitions on started_at
--    MySQL rules: no foreign keys on/to partitioned tables; every unique
--    key must include started_at. Integrity enforced in application code.
--    One-attempt-per-live-exam enforced by Redis SETNX att:lock:{exam}:{user}
--    + check query before insert.
-- ---------------------------------------------------------------------
CREATE TABLE attempts (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  exam_id          BIGINT UNSIGNED NULL,               -- NULL for practice/custom
  kind             ENUM('live','live_practice','model','previous_year','custom','quick_practice') NOT NULL,
  question_ids     JSON NULL,                          -- set for custom/quick_practice (ordered)
  answers          JSON NULL,                          -- {"<question_id>":"a", ...} canonical, unshuffled
  status           ENUM('in_progress','submitted','scored','expired') NOT NULL DEFAULT 'in_progress',
  started_at       DATETIME(3) NOT NULL,
  submitted_at     DATETIME(3) NULL,
  time_taken_sec   INT UNSIGNED NULL,
  total_questions  SMALLINT UNSIGNED NOT NULL,
  correct_count    SMALLINT UNSIGNED NULL,
  wrong_count      SMALLINT UNSIGNED NULL,
  skipped_count    SMALLINT UNSIGNED NULL,
  score            DECIMAL(7,2) NULL,
  section_scores   JSON NULL,                          -- [{"node_id":12,"correct":30,"wrong":3,"score":28.5}]
  rank_overall     INT UNSIGNED NULL,
  rank_district    INT UNSIGNED NULL,
  percentile       DECIMAL(5,2) NULL,
  district_id      SMALLINT UNSIGNED NULL,             -- snapshot for district merit
  focus_loss_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  client_platform  ENUM('android','ios','web') NULL,
  shuffle_seed     INT UNSIGNED NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, started_at),
  KEY ix_att_user (user_id, started_at),
  KEY ix_att_exam_score (exam_id, status, score),
  KEY ix_att_exam_user (exam_id, user_id)
) ENGINE=InnoDB
PARTITION BY RANGE COLUMNS (started_at) (
  PARTITION p2026_11 VALUES LESS THAN ('2026-12-01'),
  PARTITION p2026_12 VALUES LESS THAN ('2027-01-01'),
  PARTITION p2027_01 VALUES LESS THAN ('2027-02-01'),
  PARTITION p2027_02 VALUES LESS THAN ('2027-03-01'),
  PARTITION p2027_03 VALUES LESS THAN ('2027-04-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);
-- Scheduler job `partitions:ensure` runs daily: REORGANIZE PARTITION pmax INTO
-- (next month, pmax) so 3 future months always exist. See database/partition-maintenance.sql.

-- ---------------------------------------------------------------------
-- 5. Learning data (worker-maintained aggregates)
-- ---------------------------------------------------------------------
CREATE TABLE user_topic_stats (
  user_id    BIGINT UNSIGNED NOT NULL,
  node_id    INT UNSIGNED NOT NULL,
  attempted  INT UNSIGNED NOT NULL DEFAULT 0,
  correct    INT UNSIGNED NOT NULL DEFAULT 0,
  last_at    DATETIME(3) NULL,
  PRIMARY KEY (user_id, node_id),
  KEY ix_uts_weak (user_id, attempted, correct)
) ENGINE=InnoDB;

CREATE TABLE user_daily_stats (
  user_id    BIGINT UNSIGNED NOT NULL,
  day        DATE NOT NULL,                            -- Asia/Dhaka calendar day
  answered   INT UNSIGNED NOT NULL DEFAULT 0,
  correct    INT UNSIGNED NOT NULL DEFAULT 0,
  exams      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  points     INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
) ENGINE=InnoDB;

CREATE TABLE user_streaks (
  user_id        BIGINT UNSIGNED NOT NULL,
  current_streak SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  best_streak    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_day       DATE NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_streak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bookmarks (
  user_id     BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, question_id),
  KEY ix_bm_user_time (user_id, created_at),
  CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bm_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_wrong_questions (                    -- revision list; removed after 2 consecutive correct
  user_id      BIGINT UNSIGNED NOT NULL,
  question_id  BIGINT UNSIGNED NOT NULL,
  wrong_times  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  correct_streak TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_wrong_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, question_id),
  KEY ix_uwq_user_time (user_id, last_wrong_at)
) ENGINE=InnoDB;

CREATE TABLE question_reports (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  reason      ENUM('wrong_answer','typo','wrong_explanation','duplicate','other') NOT NULL,
  message     VARCHAR(1000) NULL,
  status      ENUM('open','accepted','rejected') NOT NULL DEFAULT 'open',
  resolved_by INT UNSIGNED NULL,
  resolution_note VARCHAR(1000) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_once (question_id, user_id, reason),
  KEY ix_report_status (status, created_at),
  CONSTRAINT fk_rep_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Billing
-- ---------------------------------------------------------------------
CREATE TABLE packages (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name_bn       VARCHAR(150) NOT NULL,
  name_en       VARCHAR(150) NOT NULL,
  description   TEXT NULL,
  features      JSON NULL,                             -- ["সব লাইভ এক্সাম","আনলিমিটেড প্র্যাকটিস"]
  category_ids  JSON NULL,                             -- NULL = all-access
  duration_days SMALLINT UNSIGNED NOT NULL,
  price_bdt     DECIMAL(10,2) NOT NULL,
  compare_at_bdt DECIMAL(10,2) NULL,                   -- strike-through price
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  is_featured   TINYINT(1) NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE coupons (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(40) NOT NULL,
  type           ENUM('percent','fixed') NOT NULL,
  value          DECIMAL(10,2) NOT NULL,
  max_discount_bdt DECIMAL(10,2) NULL,
  package_ids    JSON NULL,                            -- NULL = any package
  usage_limit    INT UNSIGNED NULL,
  per_user_limit SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  used_count     INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at      DATETIME(3) NULL,
  ends_at        DATETIME(3) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_code (code)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  package_id      INT UNSIGNED NOT NULL,
  coupon_id       INT UNSIGNED NULL,
  amount_bdt      DECIMAL(10,2) NOT NULL,              -- after discount
  discount_bdt    DECIMAL(10,2) NOT NULL DEFAULT 0,
  gateway         ENUM('bkash','sslcommerz','manual') NOT NULL,
  merchant_tran_id CHAR(26) NOT NULL,                  -- our ULID sent to gateway
  gateway_tran_id VARCHAR(100) NULL,                   -- gateway's id
  status          ENUM('initiated','pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'initiated',
  gateway_payload JSON NULL,                           -- last validation response
  paid_at         DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_merchant (merchant_tran_id),
  UNIQUE KEY uq_pay_gateway (gateway, gateway_tran_id),
  KEY ix_pay_user (user_id, created_at),
  KEY ix_pay_status (status, created_at),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_pay_pkg FOREIGN KEY (package_id) REFERENCES packages(id),
  CONSTRAINT fk_pay_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  package_id  INT UNSIGNED NULL,                       -- NULL for trial
  payment_id  BIGINT UNSIGNED NULL,
  source      ENUM('payment','trial','manual') NOT NULL,
  category_ids JSON NULL,                              -- copied from package; NULL = all-access
  starts_at   DATETIME(3) NOT NULL,
  ends_at     DATETIME(3) NOT NULL,
  granted_by  INT UNSIGNED NULL,                       -- admin for manual
  note        VARCHAR(255) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_payment (payment_id),              -- idempotency: one subscription per payment
  KEY ix_sub_user_end (user_id, ends_at),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_sub_pkg FOREIGN KEY (package_id) REFERENCES packages(id),
  CONSTRAINT fk_sub_pay FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;

CREATE TABLE coupon_redemptions (
  coupon_id  INT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (coupon_id, payment_id),
  KEY ix_cr_user (coupon_id, user_id),
  CONSTRAINT fk_cr_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_cr_pay FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. Engagement & content
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NULL,                    -- NULL = broadcast (fan-out on read via broadcast_id)
  type        ENUM('exam_reminder','result','subscription','report','broadcast','system') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(1000) NOT NULL,
  deep_link   VARCHAR(300) NULL,
  read_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_noti_user (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE user_notification_prefs (
  user_id       BIGINT UNSIGNED NOT NULL,
  exam_reminder TINYINT(1) NOT NULL DEFAULT 1,
  result        TINYINT(1) NOT NULL DEFAULT 1,
  subscription  TINYINT(1) NOT NULL DEFAULT 1,
  promotional   TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE banners (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(150) NOT NULL,
  image_url   VARCHAR(500) NOT NULL,
  deep_link   VARCHAR(300) NULL,
  category_ids JSON NULL,
  starts_at   DATETIME(3) NULL,
  ends_at     DATETIME(3) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE app_settings (
  `key`       VARCHAR(80) NOT NULL,
  value       JSON NOT NULL,
  is_public   TINYINT(1) NOT NULL DEFAULT 0,           -- exposed by GET /settings/public
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. Admin, RBAC, audit, imports
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(50) NOT NULL,                    -- super_admin, content_manager, moderator, support, accountant
  permissions JSON NOT NULL,                           -- ["questions.read","questions.write","exams.publish",...]
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_name (name)
) ENGINE=InnoDB;

CREATE TABLE admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret   VARCHAR(64) NULL,                      -- encrypted at rest (app-level AES-GCM)
  role_id       SMALLINT UNSIGNED NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email),
  CONSTRAINT fk_admin_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    INT UNSIGNED NULL,
  action      VARCHAR(80) NOT NULL,                    -- question.update, exam.publish, user.reset_device ...
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(40) NOT NULL,
  before_data JSON NULL,
  after_data  JSON NULL,
  ip          VARCHAR(45) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id, created_at),
  KEY ix_audit_admin (admin_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE import_jobs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id      INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  mapping       JSON NULL,                             -- column → field
  default_status ENUM('draft','in_review','published') NOT NULL DEFAULT 'in_review',
  status        ENUM('uploaded','validating','validated','importing','done','failed') NOT NULL DEFAULT 'uploaded',
  total_rows    INT UNSIGNED NOT NULL DEFAULT 0,
  imported_rows INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_rows INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows   INT UNSIGNED NOT NULL DEFAULT 0,
  error_file_url VARCHAR(500) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at   DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_import_admin (admin_id, created_at),
  CONSTRAINT fk_import_admin FOREIGN KEY (admin_id) REFERENCES admins(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. Seed essentials
-- ---------------------------------------------------------------------
INSERT INTO roles (name, permissions) VALUES
 ('super_admin',     JSON_ARRAY('*')),
 ('content_manager', JSON_ARRAY('questions.read','questions.write','questions.import','taxonomy.write','exams.read','exams.write','exams.publish','reports.read')),
 ('moderator',       JSON_ARRAY('questions.read','questions.review','reports.read','reports.resolve')),
 ('support',         JSON_ARRAY('users.read','users.reset_device','payments.read','reports.read')),
 ('accountant',      JSON_ARRAY('payments.read','payments.refund','packages.write','coupons.write','reports.revenue'));

INSERT INTO app_settings (`key`, value, is_public) VALUES
 ('min_supported_version', JSON_OBJECT('android','1.0.0','ios','1.0.0'), 1),
 ('maintenance',           JSON_OBJECT('enabled',false,'message_bn','','message_en',''), 1),
 ('free_live_exams_per_month', CAST('4' AS JSON), 1),
 ('free_practice_per_day', CAST('50' AS JSON), 1),
 ('free_search_answers_per_day', CAST('10' AS JSON), 1),
 ('trial_days',            CAST('7' AS JSON), 1),
 ('submit_grace_sec',      CAST('60' AS JSON), 0),
 ('merit_publish_delay_sec', CAST('300' AS JSON), 0);
