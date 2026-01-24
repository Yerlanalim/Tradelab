import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { LibraryContent } from "@/components/library/LibraryContent";

export default function LibraryPage() {
  return (
    <AppShell
      title="Библиотека"
      description="Материалы, гайды и шаблоны документов."
    >
      <Section title="Контент" description="Полезный контент по работе с Китаем.">
        <LibraryContent />
      </Section>
    </AppShell>
  );
}
