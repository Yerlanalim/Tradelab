import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ContentList } from "@/components/content/ContentList";
import { MapInteractive } from "@/components/map/MapInteractive";

export default function MapPage() {
  return (
    <AppShell
      title="Карта производителей"
      description="Регионы, специализации и рекомендации."
    >
      <Section
        title="Карта"
        description="Выберите отрасль, провинцию или город, чтобы увидеть специализацию."
      >
        <MapInteractive />
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="map" />
      </Section>
    </AppShell>
  );
}
