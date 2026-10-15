import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tasker</CardTitle>
          <CardDescription>Простой таск-трекер для команд</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Рабочие пространства, канбан-доска и список задач. Вход и регистрация появятся на
            следующем этапе.
          </p>
        </CardContent>
        <CardFooter>
          <Button disabled>Войти</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
