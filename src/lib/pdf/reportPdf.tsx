import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  renderToBuffer,
} from "@react-pdf/renderer";

export type ReportPdfPayload = {
  reportId: string;
  title: string;
  summary?: string;
  meta?: Record<string, string>;
  source?: string;
  limitation?: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    fontSize: 20,
    marginBottom: 12,
  },
  subheader: {
    fontSize: 12,
    marginBottom: 16,
    color: "#334155",
  },
  sectionTitle: {
    fontSize: 12,
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    color: "#0f766e",
  },
  paragraph: {
    marginBottom: 6,
    lineHeight: 1.4,
  },
  metaRow: {
    marginBottom: 4,
  },
});

const buildDocument = ({
  reportId,
  title,
  summary,
  meta,
  source,
  limitation,
}: ReportPdfPayload) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>{title}</Text>
      <Text style={styles.subheader}>Отчет TradeLab · ID {reportId}</Text>

      {summary && (
        <>
          <Text style={styles.sectionTitle}>Сводка</Text>
          <Text style={styles.paragraph}>{summary}</Text>
        </>
      )}

      {meta && Object.keys(meta).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Параметры</Text>
          {Object.entries(meta).map(([key, value]) => (
            <Text key={key} style={styles.metaRow}>
              {key}: {value}
            </Text>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Источник</Text>
      <Text style={styles.paragraph}>{source ?? "TradeLab (демо-данные)"}</Text>

      <Text style={styles.sectionTitle}>Ограничение</Text>
      <Text style={styles.paragraph}>
        {limitation ??
          "Отчет носит информационный характер и требует проверки источников."}
      </Text>

      <Text style={styles.sectionTitle}>Дисклеймер</Text>
      <Text style={styles.paragraph}>
        Отчет сформирован на основе источников данных TradeLab. Результаты носят
        информационный характер и не являются гарантией.
      </Text>
    </Page>
  </Document>
);

export async function generateReportPdf(payload: ReportPdfPayload) {
  return renderToBuffer(buildDocument(payload));
}
