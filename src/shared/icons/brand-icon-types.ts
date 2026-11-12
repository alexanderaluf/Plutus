/** A react-native-svg element: [tag, props, children?]. */
export type BrandSvgNode =
  | string
  | [string, Record<string, string | number>]
  | [string, Record<string, string | number>, BrandSvgNode[]];

export type BrandSvgTree = {
  viewBox: string;
  fill: string;
  children: BrandSvgNode[];
};

export type BrandIcon = {
  slug: string;
  label: string;
  /** Original brand colors, shown in the icon picker. */
  colored: BrandSvgTree;
  /**
   * Single ink (`currentColor`), tinted with the record color in the app.
   * Omitted when it is `colored` with every paint set to one ink; use
   * `brandMonoTree` to read it.
   */
  mono?: BrandSvgTree;
};

export type BrandIconCategory =
  | "payments"
  | "shopping"
  | "food"
  | "subscriptions"
  | "ai"
  | "cloud"
  | "services"
  | "travel"
  | "cars"
  | "telecom"
  | "tech"
  | "gaming";

export type BrandIconGroup = {
  category: BrandIconCategory;
  icons: BrandIcon[];
};
