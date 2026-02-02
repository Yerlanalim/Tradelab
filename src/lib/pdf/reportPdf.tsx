import path from "path";
import fs from "fs";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";

// Register fonts for Cyrillic support
const fontsDir = path.join(process.cwd(), "public", "fonts");

// Disable hyphenation for Cyrillic
Font.registerHyphenationCallback((word) => [word]);

try {
  Font.register({
    family: 'Open Sans',
    fonts: [
      { src: path.join(fontsDir, 'OpenSans-Regular.ttf') },
      { src: path.join(fontsDir, 'OpenSans-Bold.ttf'), fontWeight: 700 },
    ],
  });
  console.log("[PDF] Open Sans registered successfully");
} catch (error: any) {
  console.error("[PDF] Failed to register fonts:", error.message);
}

export type ReportPdfPayload = {
  reportId: string;
  title: string;
  summary?: string;
  items?: {
    name: string;
    platform: string;
    price_range?: string;
    moq?: string;
    location?: string;
    link?: string;
    risk_level?: string;
  }[];
  meta?: Record<string, string>;
  source?: string;
  limitation?: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Open Sans",
    color: "#0f172a",
  },
  header: {
    fontSize: 20,
    marginBottom: 8,
    fontWeight: "bold",
  },
  subheader: {
    fontSize: 10,
    marginBottom: 20,
    color: "#64748b",
  },
  sectionTitle: {
    fontSize: 12,
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    color: "#0f766e",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
  },
  paragraph: {
    marginBottom: 8,
    lineHeight: 1.5,
  },
  metaRow: {
    marginBottom: 4,
    flexDirection: "row",
  },
  metaLabel: {
    fontWeight: "bold",
    width: 120,
  },
  itemBox: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#cbd5e1",
  },
  itemName: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
  },
  itemDetail: {
    fontSize: 9,
    color: "#475569",
    marginBottom: 2,
  },
  riskLow: { borderLeftColor: "#22c55e" },
  riskMedium: { borderLeftColor: "#eab308" },
  riskHigh: { borderLeftColor: "#ef4444" },
});

const buildDocument = ({
  reportId,
  title,
  summary,
  items,
  meta,
  source,
  limitation,
}: ReportPdfPayload) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>{title}</Text>
      <Text style={styles.subheader}>Отчет TradeLab · ID {reportId} · Сформирован {new Date().toLocaleDateString('ru-RU')}</Text>

      {summary && (
        <>
          <Text style={styles.sectionTitle}>Сводка анализа</Text>
          <Text style={styles.paragraph}>{summary}</Text>
        </>
      )}

      {meta && Object.keys(meta).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Параметры и метрики</Text>
          {Object.entries(meta).map(([key, value]) => (
            <Text key={key} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{key}:</Text> {value}
            </Text>
          ))}
        </>
      )}

      {items && items.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Найденные поставщики ({items.length})</Text>
          {items.map((item, idx) => {
            const riskStyle = item.risk_level === 'low' ? styles.riskLow : 
                              item.risk_level === 'medium' ? styles.riskMedium : 
                              item.risk_level === 'high' ? styles.riskHigh : {};
            
            return (
              <View key={idx} style={[styles.itemBox, riskStyle]}>
                <Text style={styles.itemName}>{idx + 1}. {item.name}</Text>
                <Text style={styles.itemDetail}>Площадка: {item.platform} | Локация: {item.location ?? "Китай"}</Text>
                <Text style={styles.itemDetail}>Цена: {item.price_range ?? "по запросу"} | MOQ: {item.moq ?? "N/A"}</Text>
                {item.risk_level && (
                  <Text style={styles.itemDetail}>
                    Уровень риска: {item.risk_level === 'low' ? "Низкий" : item.risk_level === 'medium' ? "Средний" : "Высокий"}
                  </Text>
                )}
                {item.link && <Text style={[styles.itemDetail, { color: "#0284c7" }]}>Ссылка: {item.link}</Text>}
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.sectionTitle}>Техническая информация</Text>
      <Text style={styles.paragraph}>Источник: {source ?? "LLM Web Search (Alibaba, Made-in-China)"}</Text>
      <Text style={styles.paragraph}>
        Ограничения: {limitation ?? "Данные собраны автоматически и требуют верификации перед оплатой заказа."}
      </Text>

      <Text style={styles.sectionTitle}>Дисклеймер</Text>
      <Text style={styles.paragraph}>
        TradeLab не несет ответственности за достоверность данных, предоставляемых сторонними площадками. 
        Результат является аналитическим прогнозом на основе доступной в сети интернет информации.
      </Text>
    </Page>
  </Document>
);

// Note: We need a View component for the structure above. 
// Adding View to imports is necessary.
// I'll update the whole file logic.

export async function generateReportPdf(payload: ReportPdfPayload) {
  console.log("[PDF] generateReportPdf called with:", { 
    reportId: payload.reportId, 
    title: payload.title,
    itemsCount: payload.items?.length ?? 0 
  });
  try {
    const result = await renderToBuffer(buildDocument(payload));
    console.log("[PDF] renderToBuffer completed, buffer length:", result.length);
    return result;
  } catch (renderError) {
    console.error("[PDF] renderToBuffer failed:", renderError);
    throw renderError;
  }
}
