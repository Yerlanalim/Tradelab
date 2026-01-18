import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export default function SettingsPage() {
  return (
    <AppShell
      title="Настройки"
      description="Профиль пользователя и параметры платформы."
    >
      <Section title="Обзор">
        <PagePlaceholder />
      </Section>
    </AppShell>
  );
}
