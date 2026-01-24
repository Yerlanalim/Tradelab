import { AppShell } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { ContentList } from "@/components/content/ContentList";

type ExhibitionsPageProps = {
  searchParams?: Promise<{
    city?: string;
    province?: string;
  }>;
};

export default async function ExhibitionsPage({ searchParams }: ExhibitionsPageProps) {
  const resolvedParams = (await searchParams) ?? {};
  const city = resolvedParams.city;
  const province = resolvedParams.province;

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
      </Section>
      <Section title="Контент" className="mt-6">
        <ContentList type="exhibition" tags={[city, province].filter(Boolean) as string[]} />
      </Section>
    </AppShell>
  );
}
