import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { ContentList } from "@/components/content/ContentList";

export default function LibraryPage() {
  return (
    <AppShell
      title="Библиотека"
      description="Материалы, гайды и шаблоны документов."
    >
      <Section title="Обзор" description="Полезный контент по работе с Китаем.">
        <PagePlaceholder />
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="library" />
      </Section>
    </AppShell>
  );
}
