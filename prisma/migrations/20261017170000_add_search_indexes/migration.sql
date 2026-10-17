-- Триграммы для поиска по части названия (ILIKE '%q%'): палитра Cmd+K, список задач, документы.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Document_titleKey_trgm_idx" ON "Document" USING GIN ("titleKey" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Task_title_trgm_idx" ON "Task" USING GIN ("title" gin_trgm_ops);
