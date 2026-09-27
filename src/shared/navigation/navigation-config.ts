import type { TabId, TabItem } from "./types";

export const navigationItems: TabItem[] = [
  { id: "home", href: "/", icon: "home-variant" },
  {
    id: "accounts",
    href: "/accounts",
    icon: "credit-card-chip",
  },
  {
    id: "reports",
    href: "/reports",
    icon: "chart-donut-variant",
  },
  { id: "search", href: "/search", icon: "magnify" },
];

export function getTabFromPathname(pathname: string): TabId {
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/search")) return "search";
  return "home";
}
