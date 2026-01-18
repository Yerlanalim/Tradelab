import type { Report } from "@/lib/types/core";

const mockReports: Report[] = [
  {
    id: "1",
    orderId: "o-1001",
    productType: "p2",
    title: "Экспортный профиль • Shenzhen YK",
    status: "ready",
    summary: "Экспорт активен, релевантность средняя.",
    createdAt: "2026-01-15",
    pdfUrl: "/mock/report-1.pdf",
  },
  {
    id: "2",
    orderId: "o-1002",
    productType: "p1",
    title: "Проверка компании • USCC",
    status: "ready",
    summary: "Компания активна, риски низкие.",
    createdAt: "2026-01-14",
    pdfUrl: "/mock/report-2.pdf",
  },
  {
    id: "3",
    orderId: "o-1003",
    productType: "p3",
    title: "Поиск поставщиков • LED Lighting",
    status: "processing",
    summary: "Сбор 30 релевантных поставщиков.",
    createdAt: "2026-01-13",
  },
];

export async function fetchReports(): Promise<Report[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return mockReports;
}

export async function fetchReportById(id: string): Promise<Report | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockReports.find((report) => report.id === id) ?? null;
}
