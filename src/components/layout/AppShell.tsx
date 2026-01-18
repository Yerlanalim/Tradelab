import type { ReactNode } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { PageHeader } from "@/components/layout/PageHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

type AppShellProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  requireAuth?: boolean;
};

export function AppShell({
  title,
  description,
  actions,
  children,
  requireAuth = true,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--tl-bg-0)] text-[var(--tl-text-inverse)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr_320px]">
        <Sidebar />
        <main className="border-x border-[var(--tl-border-strong)] bg-[var(--tl-bg-1)] text-[var(--tl-text-inverse)]">
          <TopBar />
          <header className="flex items-center justify-between border-b border-[var(--tl-border-strong)] px-6 py-4">
            {title || description ? (
              <PageHeader title={title ?? ""} description={description} />
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              {actions}
              <AuthStatus />
            </div>
          </header>
          <div className="px-6 py-6">
            {requireAuth ? <AuthGate>{children}</AuthGate> : children}
          </div>
        </main>
        <ChatPanel />
      </div>
    </div>
  );
}
