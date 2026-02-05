
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { CalculationPackage } from '@/lib/api/calc';

// Register fonts
// Note: In browser context, we need absolute URLs or relative paths that work from public/
Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf' },
    { src: '/fonts/Roboto-Medium.ttf', fontWeight: 500 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Roboto',
    fontSize: 10,
    color: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 500,
    color: '#0f172a',
  },
  date: {
    fontSize: 9,
    color: '#64748b',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: '#0f172a',
    marginBottom: 10,
    backgroundColor: '#f1f5f9',
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    width: 150,
    color: '#64748b',
  },
  value: {
    flex: 1,
    fontWeight: 500,
  },
  totalBox: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
  },
  totalTitle: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 5,
    color: '#10b981',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 700,
    color: '#0f172a',
  },
  scenario: {
    marginBottom: 10,
    padding: 8,
    borderLeft: '2px solid #10b981',
    backgroundColor: '#f0fdf4',
  }
});

interface Props {
  data: CalculationPackage;
  formData: any;
}

export const CalculatorPDF = ({ data, formData }: Props) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Расчёт Landed Cost (TradeLab)</Text>
          <Text style={styles.date}>Дата: {new Date().toLocaleDateString('ru-RU')}</Text>
        </View>
        <Text style={{ fontSize: 10, fontWeight: 500 }}>ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</Text>
      </View>

      {/* Input Params */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Параметры сделки</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Направление:</Text>
          <Text style={styles.value}>Китай → {formData.dest_country}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Incoterms:</Text>
          <Text style={styles.value}>{formData.incoterms}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Вес брутто:</Text>
          <Text style={styles.value}>{formData.weight_gross_kg} кг</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Код ТН ВЭД:</Text>
          <Text style={styles.value}>{formData.hs_code || 'Не указан'}</Text>
        </View>
      </View>

      {/* Totals */}
      <View style={styles.totalBox}>
        <Text style={styles.totalTitle}>Итого (Landed Cost):</Text>
        <Text style={styles.totalAmount}>
          ${data.totals.landed_cost_range_usd?.[0].toLocaleString()} – ${data.totals.landed_cost_range_usd?.[1].toLocaleString()}
        </Text>
        <Text style={{ fontSize: 8, color: '#64748b', marginTop: 5 }}>
          Включает: Стоимость товара, логистику (если применимо), пошлины и НДС.
        </Text>
      </View>

      {/* Components */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Детализация затрат</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Стоимость товара:</Text>
          <Text style={styles.value}>${data.totals.components.product_cost_usd.toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Логистика (вкл. в итог):</Text>
          <Text style={styles.value}>
            {data.totals.components.shipping_usd 
              ? `$${data.totals.components.shipping_usd[0].toLocaleString()} – $${data.totals.components.shipping_usd[1].toLocaleString()}`
              : '$0'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Пошлина:</Text>
          <Text style={styles.value}>
            ${data.totals.components.duty_usd?.[0].toLocaleString()} – ${data.totals.components.duty_usd?.[1].toLocaleString()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>НДС:</Text>
          <Text style={styles.value}>
            ${data.totals.components.vat_usd?.[0].toLocaleString()} – ${data.totals.components.vat_usd?.[1].toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Logistics Details */}
      {data.logistics && data.logistics.scenarios.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Варианты доставки</Text>
          {data.logistics.scenarios.map((s, i) => (
            <View key={i} style={styles.scenario}>
              <Text style={{ fontWeight: 500, fontSize: 11 }}>{s.mode.toUpperCase()} | {s.transit_days_range?.[0]}–{s.transit_days_range?.[1]} дней</Text>
              <Text style={{ fontSize: 9, color: '#047857' }}>
                Цена: ${s.cost_usd_range?.[0]} – ${s.cost_usd_range?.[1]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Disclaimer */}
      <View style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
        <Text style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>
          TradeLab Logistics Calculator. Расчёт носит ознакомительный характер и не является публичной офертой. 
          Данные сформированы на основе текущих рыночных котировок и таможенных правил.
        </Text>
      </View>
    </Page>
  </Document>
);
