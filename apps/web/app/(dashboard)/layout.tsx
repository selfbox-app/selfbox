import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { headers } from 'next/headers';
import { AppSidebar } from '@/components/app-sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <AppSidebar user={session.user} />
      <main className="ml-72 min-h-screen">
        {children}
      </main>
    </div>
  );
}
