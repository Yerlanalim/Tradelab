export type ProductType = "p1" | "p2" | "p3" | "p4" | "bundle";

export type OrderStatus = "pending" | "processing" | "done" | "failed";

export type ReportStatus = "draft" | "ready" | "processing" | "failed";

export type Order = {
  id: string;
  userId: string;
  productType: ProductType;
  status: OrderStatus;
  price: number;
  currency: "USD" | "KZT";
  createdAt: string;
};

export type Report = {
  id: string;
  orderId: string;
  productType: ProductType;
  title: string;
  status: ReportStatus;
  summary: string;
  createdAt: string;
  pdfUrl?: string;
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  source: "qcc" | "tendata" | "apify";
  score?: number;
};
