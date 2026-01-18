import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { ContentList } from "@/components/content/ContentList";

export default function ZonesPage() {
  return (
    <AppShell
      title="Торговые зоны"
      description="Справочник торговых зон и экспортных хабов."
    >
      <Section title="Обзор">
        <PagePlaceholder />
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="zone" />
      </Section>
    </AppShell>
  );
}
