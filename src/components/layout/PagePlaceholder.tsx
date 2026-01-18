import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type PagePlaceholderProps = {
  title?: string;
  description?: string;
};

export function PagePlaceholder({
  title = "Раздел в разработке",
  description = "Скоро добавим контент и основной функционал.",
}: PagePlaceholderProps) {
  return (
    <Card title={title} description={description}>
      <div className="flex flex-col gap-3 text-sm text-white/70">
        <p>Раздел в разработке. Здесь появится основной функционал.</p>
        <div>
          <Button variant="secondary">Скоро</Button>
        </div>
      </div>
    </Card>
  );
}
