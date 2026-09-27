import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { View } from "react-native";
import type { AccountPeriod } from "../types";

const periods: AccountPeriod[] = ["Daily", "Weekly", "Monthly", "Yearly"];

export function AccountPeriodSelector({
  blurTarget,
  value,
  onChange,
}: {
  blurTarget?: RefObject<View | null>;
  value: AccountPeriod;
  onChange: (value: AccountPeriod) => void;
}) {
  const { t } = useTranslation();
  const labels: Record<AccountPeriod, string> = {
    Daily: t("accounts.details.periods.daily"),
    Weekly: t("accounts.details.periods.weekly"),
    Monthly: t("accounts.details.periods.monthly"),
    Yearly: t("accounts.details.periods.yearly"),
  };
  const periodOptions = periods.map((period) => ({
    label: labels[period],
    value: period,
  }));

  return (
    <GlassSegmentedControl
      accessibilityLabel={t("accounts.details.periods.accessibilityLabel")}
      blurTarget={blurTarget}
      onChange={onChange}
      options={periodOptions}
      value={value}
    />
  );
}
