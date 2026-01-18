import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ContentList } from "@/components/content/ContentList";
import ChinaManufacturingMap from "@/components/map/ChinaManufacturingMap";

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
        <div className="h-[70vh] min-h-[520px] max-h-[780px] overflow-hidden rounded-2xl border border-white/10 ui-glass-panel">
          <ChinaManufacturingMap className="h-full" />
        </div>
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="map" />
      </Section>
    </AppShell>
  );
}
