-- Database bootstrap only. Tables and seed data belong to backend/internal/db/migrations.
-- Core runs the embedded migration runner before serving requests.
CREATE DATABASE IF NOT EXISTS clawmanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
