import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * GitHub App ещё не подключён к Tasker. Владельцу пространства — кто это делает,
 * администратору ресурса — ссылка на мастер в админке.
 */
export function GithubNotConfigured({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub ещё не подключён к Tasker</CardTitle>
        <CardDescription>
          Чтобы владельцы пространств могли подключать свои репозитории, администратор ресурса один
          раз создаёт приложение GitHub для Tasker.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {isAdmin ? (
          <Link href="/admin/integrations" className="text-primary hover:underline">
            Создать GitHub App в админке
          </Link>
        ) : (
          <p className="text-muted-foreground">
            Обратитесь к администратору Tasker. После этого здесь появится кнопка «Установить GitHub
            App» — с ней вы выберете аккаунт или организацию и репозитории.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
