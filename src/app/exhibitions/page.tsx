import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ContentList } from "@/components/content/ContentList";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

type ExhibitionsPageProps = {
  searchParams?: {
    city?: string;
    province?: string;
  };
};

export default function ExhibitionsPage({ searchParams }: ExhibitionsPageProps) {
  const city = searchParams?.city;
  const province = searchParams?.province;

  return (
    <AppShell
      title="Выставки"
      description="Календарь отраслевых событий и полезных ссылок."
    >
      <Section title="Обзор">
        {(city || province) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            {city && <div>Фильтр по городу: {city}</div>}
            {province && <div>Фильтр по провинции: {province}</div>}
          </div>
        )}
        <PagePlaceholder
          title="Раздел выставок в разработке"
          description="Скоро добавим каталог выставок с фильтрацией."
        />
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="exhibition" />
      </Section>
    </AppShell>
  );
}
