const staffPages = new Set(["/dashboard", "/dashboard/orders", "/dashboard/orders?status=served", "/dashboard/ready"]);
const kitchenPages = new Set(["/dashboard/kitchen"]);

export function dashboardMenuForRole<T extends { href: string }>(items: T[], role?: string): T[] {
  if (role === "admin") return items;
  if (role === "staff") return items.filter((item) => staffPages.has(item.href));
  if (role === "kitchen_staff") return items.filter((item) => kitchenPages.has(item.href));
  return [];
}
