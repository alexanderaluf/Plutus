export type IconOption = { name: string; label: string };

/**
 * Section keys match `iconPicker.groups.*` translations. Apart from
 * `accounts`, every section mirrors one default category so each category
 * has a focused set of icons to choose from.
 */
export type IconGroupKey =
  | "accounts"
  | "groceries"
  | "bills"
  | "rent"
  | "housing"
  | "utilities"
  | "food"
  | "shopping"
  | "car"
  | "travel"
  | "entertainment"
  | "health"
  | "education"
  | "business"
  | "investments"
  | "savings"
  | "salary"
  | "gifts"
  | "others";

export type IconGroup = { key: IconGroupKey; icons: IconOption[] };

function iconLabel(name: string) {
  return name
    .replace(/^material:/, "")
    .split(/[_-]+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function materialIcons(names: string[]): IconOption[] {
  return names.map((name) => ({
    name: `material:${name}`,
    label: iconLabel(name),
  }));
}

// Each section leads with the icon its default category uses. Only Material
// names listed here are bundled: run `node scripts/generate-material-icons.mjs`
// after editing this file.
export const ICON_GROUPS: IconGroup[] = [
  {
    key: "accounts",
    icons: [
      { name: "bank", label: "Bank" },
      { name: "credit-card", label: "Card" },
      { name: "cash", label: "Cash" },
      { name: "wallet", label: "Wallet" },
      { name: "piggy-bank", label: "Savings" },
      { name: "currency-exchange", label: "Currency" },
      ...materialIcons([
        "account_balance",
        "account_balance_wallet",
        "credit_card",
        "payments",
        "paid",
        "attach_money",
        "euro",
        "currency_pound",
        "currency_yen",
        "currency_bitcoin",
        "contactless",
        "point_of_sale",
        "send_money",
        "swap_horiz",
      ]),
    ],
  },
  {
    key: "groceries",
    icons: materialIcons([
      "shopping_cart",
      "shopping_basket",
      "grocery",
      "local_convenience_store",
      "nutrition",
      "egg",
      "bakery_dining",
      "set_meal",
      "cookie",
      "local_drink",
      "liquor",
      "kitchen",
      "soap",
      "cleaning_services",
      "storefront",
      "eco",
    ]),
  },
  {
    key: "bills",
    icons: [
      ...materialIcons([
        "description",
        "receipt_long",
        "receipt",
        "request_quote",
        "event_repeat",
        "calendar_month",
        "subscriptions",
        "mail",
        "mobile",
        "wifi",
        "tv",
        "notifications_active",
      ]),
      { name: "bell", label: "Reminders" },
      { name: "clock", label: "Scheduled payments" },
    ],
  },
  {
    key: "rent",
    icons: [
      { name: "home", label: "Home" },
      ...materialIcons([
        "house",
        "apartment",
        "key",
        "real_estate_agent",
        "door_front",
        "contract",
        "location_city",
        "holiday_village",
        "cottage",
        "bed",
        "garage",
      ]),
    ],
  },
  {
    key: "housing",
    icons: materialIcons([
      "apartment",
      "home_work",
      "chair",
      "weekend",
      "bed",
      "kitchen",
      "bathtub",
      "shower",
      "yard",
      "roofing",
      "construction",
      "handyman",
      "plumbing",
      "home_repair_service",
      "light",
      "local_laundry_service",
    ]),
  },
  {
    key: "utilities",
    icons: materialIcons([
      "lightbulb",
      "bolt",
      "water_drop",
      "gas_meter",
      "electric_meter",
      "propane_tank",
      "local_fire_department",
      "thermostat",
      "ac_unit",
      "heat_pump",
      "power",
      "router",
      "phone_enabled",
      "delete",
      "recycling",
    ]),
  },
  {
    key: "food",
    icons: [
      ...materialIcons(["restaurant"]),
      { name: "food", label: "Dining" },
      { name: "coffee", label: "Coffee" },
      ...materialIcons([
        "lunch_dining",
        "dinner_dining",
        "breakfast_dining",
        "local_cafe",
        "local_bar",
        "fastfood",
        "local_pizza",
        "ramen_dining",
        "rice_bowl",
        "kebab_dining",
        "icecream",
        "cake",
        "sports_bar",
        "wine_bar",
        "takeout_dining",
        "moped",
      ]),
    ],
  },
  {
    key: "shopping",
    icons: [
      ...materialIcons(["shopping_bag"]),
      { name: "shopping", label: "Shopping" },
      ...materialIcons([
        "local_mall",
        "store",
        "checkroom",
        "diamond",
        "watch",
        "eyeglasses",
        "laptop_mac",
        "headphones",
        "devices",
        "toys",
        "sell",
        "package_2",
        "local_shipping",
      ]),
    ],
  },
  {
    key: "car",
    icons: [
      { name: "car", label: "Car" },
      ...materialIcons([
        "directions_car",
        "local_gas_station",
        "ev_station",
        "local_parking",
        "car_repair",
        "tire_repair",
        "car_crash",
        "local_car_wash",
        "toll",
        "two_wheeler",
        "local_taxi",
        "directions_bus",
        "train",
        "subway",
        "pedal_bike",
        "electric_scooter",
      ]),
    ],
  },
  {
    key: "travel",
    icons: materialIcons([
      "flight",
      "flight_takeoff",
      "luggage",
      "hotel",
      "beach_access",
      "travel_explore",
      "map",
      "explore",
      "passport",
      "directions_boat",
      "sailing",
      "hiking",
      "camping",
      "car_rental",
      "photo_camera",
      "landscape",
      "tour",
    ]),
  },
  {
    key: "entertainment",
    icons: [
      ...materialIcons([
        "sports_esports",
        "movie",
        "theaters",
        "live_tv",
        "music_note",
        "headphones",
        "celebration",
        "nightlife",
        "festival",
        "attractions",
        "local_activity",
        "confirmation_number",
        "stadium",
        "sports_soccer",
        "casino",
        "palette",
      ]),
      { name: "camera", label: "Photography" },
      { name: "photo-library", label: "Media" },
      { name: "format-paint", label: "Art & hobbies" },
      { name: "weather-night", label: "Nightlife" },
    ],
  },
  {
    key: "health",
    icons: materialIcons([
      "health_and_safety",
      "local_hospital",
      "medical_services",
      "medication",
      "local_pharmacy",
      "vaccines",
      "stethoscope",
      "dentistry",
      "ophthalmology",
      "psychology",
      "monitor_heart",
      "emergency",
      "healing",
      "fitness_center",
      "exercise",
      "spa",
      "self_care",
    ]),
  },
  {
    key: "education",
    icons: [
      ...materialIcons([
        "school",
        "menu_book",
        "auto_stories",
        "library_books",
        "local_library",
        "backpack",
        "calculate",
        "science",
        "history_edu",
        "edit_note",
        "draw",
        "computer",
        "code",
        "translate",
        "quiz",
        "cast_for_education",
      ]),
      { name: "experiment", label: "Lab" },
    ],
  },
  {
    key: "business",
    icons: materialIcons([
      "business_center",
      "work",
      "store",
      "domain",
      "badge",
      "groups",
      "handshake",
      "campaign",
      "analytics",
      "inventory_2",
      "local_shipping",
      "print",
      "call",
      "laptop_mac",
      "request_quote",
    ]),
  },
  {
    key: "investments",
    icons: [
      ...materialIcons([
        "trending_up",
        "show_chart",
        "candlestick_chart",
        "monitoring",
        "query_stats",
        "pie_chart",
        "donut_large",
        "timeline",
        "account_balance",
        "currency_bitcoin",
        "real_estate_agent",
        "diamond",
        "workspace_premium",
      ]),
      { name: "trending-up", label: "Growth" },
    ],
  },
  {
    key: "savings",
    icons: [
      ...materialIcons(["savings"]),
      { name: "piggy-bank", label: "Piggy bank" },
      { name: "shield-check", label: "Emergency fund" },
      { name: "trophy", label: "Goals" },
      ...materialIcons([
        "flag",
        "target",
        "rocket_launch",
        "lock",
        "verified_user",
        "beach_access",
        "home",
        "directions_car",
        "school",
        "child_care",
        "star",
      ]),
    ],
  },
  {
    key: "salary",
    icons: [
      { name: "bank", label: "Salary" },
      ...materialIcons([
        "work",
        "badge",
        "payments",
        "paid",
        "attach_money",
        "account_balance_wallet",
        "business_center",
        "receipt_long",
        "price_check",
        "credit_score",
        "add_card",
        "calendar_month",
        "trophy",
      ]),
    ],
  },
  {
    key: "gifts",
    icons: materialIcons([
      "redeem",
      "featured_seasonal_and_gifts",
      "celebration",
      "cake",
      "volunteer_activism",
      "favorite",
      "local_florist",
      "diamond",
      "toys",
      "child_care",
      "family_restroom",
      "pets",
      "mood",
      "handshake",
    ]),
  },
  {
    key: "others",
    icons: [
      ...materialIcons([
        "info",
        "category",
        "more_horiz",
        "label",
        "bookmark",
        "star",
        "flag",
        "event",
        "person",
        "group",
        "family_restroom",
        "child_care",
        "pets",
        "content_cut",
        "local_laundry_service",
        "public",
      ]),
      { name: "help", label: "Other" },
      { name: "account", label: "Personal" },
      { name: "backup", label: "Backup" },
    ],
  },
];

export const ICONS = ICON_GROUPS.flatMap((group) => group.icons);
