-- AlterEnum
-- Новые типы уведомлений GitHub — только в конец enum (порядок значений не меняется).
-- PostgreSQL 17 допускает несколько ADD VALUE в одной миграции.
ALTER TYPE "NotificationType" ADD VALUE 'pr_linked';
ALTER TYPE "NotificationType" ADD VALUE 'pr_merged';
ALTER TYPE "NotificationType" ADD VALUE 'pr_review';
