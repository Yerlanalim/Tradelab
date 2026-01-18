import type { Order } from "@/lib/types/core";

const mockOrders: Order[] = [
  {
    id: "o-1001",
    userId: "demo-user",
    productType: "p2",
    status: "done",
    price: 20,
    currency: "USD",
    createdAt: "2026-01-15",
  },
  {
    id: "o-1002",
    userId: "demo-user",
    productType: "p1",
    status: "done",
    price: 20,
    currency: "USD",
    createdAt: "2026-01-14",
  },
];

export async function fetchOrders(): Promise<Order[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mockOrders;
}
