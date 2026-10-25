const staffPages = new Set(["/dashboard/orders", "/dashboard/payments", "/dashboard/ready"]);
const kitchenPages = new Set(["/dashboard/kitchen"]);

export function dashboardMenuForRole<T extends { href: string }>(items: T[], role?: string): T[] {
  if (role === "admin") return items.filter(item => ["/dashboard", "/dashboard/menus", "/dashboard/ingredients", "/dashboard/tables", "/dashboard/addons", "/dashboard/reports", "/dashboard/users"].includes(item.href));
  if (role === "staff") return items.filter((item) => staffPages.has(item.href));
  if (role === "kitchen_staff") return items.filter((item) => kitchenPages.has(item.href));
  return [];
}

export function dashboardHomeForRole(role: string): string {
  if (role === "admin") return "/dashboard";
  if (role === "staff") return "/dashboard/orders";
  if (role === "kitchen_staff") return "/dashboard/kitchen";
  return "/access-denied";
}
