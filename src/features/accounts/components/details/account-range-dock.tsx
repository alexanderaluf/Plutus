import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ViewInstance } from "react-native";
import type { AccountPeriod } from "../../types";

/** A period granularity, or the account's whole history. */
export type AccountRangeChoice = AccountPeriod | "All";

const choices: AccountRangeChoice[] = [
  "Daily",
  "Weekly",
  "Monthly",
  "Yearly",
  "All",
];

/**
 * The floating glass control at the bottom of the account page. It chooses
 * how much time one step of the period navigator covers.
 */
export function AccountRangeDock({
  blurTarget,
  value,
  onChange,
  monthIsCycle = false,
}: {
  blurTarget?: RefObject<ViewInstance | null>;
  value: AccountRangeChoice;
  onChange: (value: AccountRangeChoice) => void;
  /** A card with a payday steps by billing cycle instead of calendar month. */
  monthIsCycle?: boolean;
}) {
  const { t } = useTranslation();
  const labels: Record<AccountRangeChoice, string> = {
    Daily: t("accounts.details.segments.day"),
    Weekly: t("accounts.details.segments.week"),
    Monthly: monthIsCycle
      ? t("accounts.details.segments.cycle")
      : t("accounts.details.segments.month"),
    Yearly: t("accounts.details.segments.year"),
    All: t("accounts.details.segments.all"),
  };

  return (
    <GlassSegmentedControl
      accessibilityLabel={t("accounts.details.periods.accessibilityLabel")}
      blurTarget={blurTarget}
      fitLabels
      minHeight={48}
      onChange={onChange}
      options={choices.map((choice) => ({
        label: labels[choice],
        value: choice,
      }))}
      tabPaddingHorizontal={4}
      textSize={13}
      value={value}
    />
  );
}
