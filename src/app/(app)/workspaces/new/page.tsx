import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';

export const metadata: Metadata = { title: 'Новое пространство — Tasker' };

export default function NewWorkspacePage() {
  return (
    <main id="main-content" className="flex flex-1 justify-center px-4 py-6 sm:px-6">
      <Card className="w-full max-w-md self-start">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            Новое пространство
          </CardTitle>
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
