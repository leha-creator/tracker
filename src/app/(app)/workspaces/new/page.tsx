import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';

export const metadata: Metadata = { title: 'Новое пространство — Tasker' };

export default function NewWorkspacePage() {
  return (
    <main className="flex flex-1 justify-center p-6">
      <Card className="w-full max-w-md self-start">
        <CardHeader>
          <CardTitle>Новое пространство</CardTitle>
          <CardDescription>
            Вы станете владельцем и сможете пригласить в пространство участников.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </main>
  );
}
