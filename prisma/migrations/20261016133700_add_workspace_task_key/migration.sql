-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "taskKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_taskKey_key" ON "Workspace"("taskKey");

-- Вручную: ключ задач существующим пространствам. Новым его проставляет сервис пространств
-- (suggestTaskKey из названия), здесь — упрощённо из slug: первые 4 латинские буквы/цифры
-- в верхнем регистре, префикс W, если начинается не с буквы, при конфликте — цифра (TSK2, TSK3…).
DO $$
DECLARE
    ws RECORD;
    base TEXT;
    candidate TEXT;
    attempt INT;
BEGIN
    FOR ws IN SELECT "id", "slug" FROM "Workspace" WHERE "taskKey" IS NULL ORDER BY "createdAt", "id" LOOP
        base := upper(regexp_replace(ws."slug", '[^a-zA-Z0-9]', '', 'g'));
        IF base !~ '^[A-Z]' THEN
            base := 'W' || base;
        END IF;
        base := left(base, 4);
        IF length(base) < 2 THEN
            base := rpad(base, 2, 'X');
        END IF;

        candidate := base;
        attempt := 1;
        WHILE EXISTS (SELECT 1 FROM "Workspace" WHERE "taskKey" = candidate) LOOP
            attempt := attempt + 1;
            candidate := left(base, 10 - length(attempt::text)) || attempt::text;
        END LOOP;

        UPDATE "Workspace" SET "taskKey" = candidate WHERE "id" = ws."id";
    END LOOP;
END;
$$;
