import { Switch as HeroSwitch, Input } from "heroui-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from "react-native";

import {
    CONTRIBUTION_MODE_OPTIONS,
    estimateSavingsDraftWithdrawal,
    LIQUIDITY_OPTIONS,
    SAVINGS_PRODUCT_OPTIONS,
    TAX_BASIS_OPTIONS,
    TAX_TREATMENT_OPTIONS,
    type SavingsDetailsDraft,
} from "@/data/model/savings-account";
import { useAppLocalization } from "@/localization/localization-provider";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type SavingsDetailsFormProps = {
  balance: number;
  currencyCode: string;
  value: SavingsDetailsDraft;
  onChange: (value: SavingsDetailsDraft) => void;
};

export function SavingsDetailsForm({
  balance,
  currencyCode,
  value,
  onChange,
}: SavingsDetailsFormProps) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const [showProducts, setShowProducts] = useState(false);
  const productOptions = SAVINGS_PRODUCT_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`accounts.savings.products.${option.value}.label`),
    description: t(`accounts.savings.products.${option.value}.description`),
  }));
  const contributionModeOptions = CONTRIBUTION_MODE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`accounts.savings.contributionModes.${option.value}`),
  }));
  const liquidityOptions = LIQUIDITY_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`accounts.savings.liquidity.${option.value}`),
  }));
  const taxTreatmentOptions = TAX_TREATMENT_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`accounts.savings.taxTreatments.${option.value}`),
  }));
  const taxBasisOptions = TAX_BASIS_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`accounts.savings.taxBases.${option.value}`),
  }));
  const product = productOptions.find(
    (option) => option.value === value.productType,
  )!;
  const estimate = estimateSavingsDraftWithdrawal(balance, value);

  function change<K extends keyof SavingsDetailsDraft>(
    key: K,
    next: SavingsDetailsDraft[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  if (!value.isDetailed) {
    return (
      <View className="pt-1">
        <SavingsModeToggle
          isDetailed={false}
          onChange={(isDetailed) => change("isDetailed", isDetailed)}
        />
      </View>
    );
  }

  return (
    <View className="gap-5 pt-1">
      <SavingsModeToggle
        isDetailed
        onChange={(isDetailed) => change("isDetailed", isDetailed)}
      />

      <View className="gap-2">
        <FieldLabel>{t("accounts.savings.productType")}</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showProducts }}
          onPress={() => setShowProducts((current) => !current)}
          className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3"
        >
          <View className="flex-1 gap-1">
            <Text className="font-manrope-semibold text-sm text-foreground">
              {product.label}
            </Text>
            <Text className="font-sans text-xs leading-4 text-muted">
              {product.description}
            </Text>
          </View>
          <FilledIcon
            name={showProducts ? "close" : "chevron-right"}
            size={20}
          />
        </Pressable>
        {showProducts && (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {productOptions.map((option, index) => {
              const selected = option.value === value.productType;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    change("productType", option.value);
                    setShowProducts(false);
                  }}
                  className={`min-h-16 flex-row items-center gap-3 px-4 py-3 ${index < productOptions.length - 1 ? "border-b border-border" : ""}`}
                >
                  <View className="flex-1 gap-1">
                    <Text className="font-manrope-semibold text-sm text-foreground">
                      {option.label}
                    </Text>
                    <Text className="font-sans text-xs leading-4 text-muted">
                      {option.description}
                    </Text>
                  </View>
                  {selected && (
                    <FilledIcon name="check" size={20} tone="accent" />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <TextField
        label={t("accounts.savings.provider")}
        placeholder={t("accounts.savings.providerPlaceholder")}
        value={value.providerName}
        onChange={(next) => change("providerName", next)}
      />

      <Section title={t("accounts.savings.ownershipSection")}>
        <MoneyField
          currencyCode={currencyCode}
          label={t("accounts.savings.contributedPrincipal")}
          value={value.contributedPrincipal}
          onChange={(next) => change("contributedPrincipal", next)}
        />
        <ChoiceGroup
          label={t("accounts.savings.contributionMethod")}
          options={contributionModeOptions}
          value={value.contributionMode}
          onChange={(next) => change("contributionMode", next)}
        />
        {value.contributionMode !== "lump_sum" && (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <MoneyField
                currencyCode={currencyCode}
                label={t("accounts.savings.monthlyDeposit")}
                value={value.monthlyContribution}
                onChange={(next) => change("monthlyContribution", next)}
              />
            </View>
            {(value.contributionMode === "employer" ||
              value.contributionMode === "mixed") && (
              <View className="flex-1">
                <MoneyField
                  currencyCode={currencyCode}
                  label={t("accounts.savings.employerMonthly")}
                  value={value.employerMonthlyContribution}
                  onChange={(next) =>
                    change("employerMonthlyContribution", next)
                  }
                />
              </View>
            )}
          </View>
        )}
        <RateField
          label={t("accounts.savings.expectedReturn")}
          value={value.expectedAnnualReturnRate}
          onChange={(next) => change("expectedAnnualReturnRate", next)}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label={t("accounts.savings.startDate")}
              placeholder={t("accounts.savings.datePlaceholder")}
              value={value.startDate}
              onChange={(next) => change("startDate", next)}
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t("accounts.savings.maturityDate")}
              placeholder={t("accounts.savings.datePlaceholder")}
              value={value.maturityDate}
              onChange={(next) => change("maturityDate", next)}
            />
          </View>
        </View>
      </Section>

      <Section title={t("accounts.savings.withdrawalSection")}>
        <ChoiceGroup
          label={t("accounts.savings.withdrawalQuestion")}
          options={liquidityOptions}
          value={value.liquidity}
          onChange={(next) => change("liquidity", next)}
        />
        {value.liquidity === "notice" && (
          <NumberField
            label={t("accounts.savings.noticePeriod")}
            placeholder={t("accounts.savings.noticePlaceholder")}
            value={value.withdrawalNoticeDays}
            onChange={(next) => change("withdrawalNoticeDays", next)}
          />
        )}
      </Section>

      <Section title={t("accounts.savings.feesSection")}>
        <Text className="font-sans text-xs leading-5 text-muted">
          {t("accounts.savings.feesHelp")}
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <RateField
              label={t("accounts.savings.annualManagement")}
              value={value.annualManagementFeeRate}
              onChange={(next) => change("annualManagementFeeRate", next)}
            />
          </View>
          <View className="flex-1">
            <RateField
              label={t("accounts.savings.depositFee")}
              value={value.contributionFeeRate}
              onChange={(next) => change("contributionFeeRate", next)}
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <RateField
              label={t("accounts.savings.performanceFee")}
              value={value.performanceFeeRate}
              onChange={(next) => change("performanceFeeRate", next)}
            />
          </View>
          <View className="flex-1">
            <RateField
              label={t("accounts.savings.earlyWithdrawal")}
              value={value.earlyWithdrawalFeeRate}
              onChange={(next) => change("earlyWithdrawalFeeRate", next)}
            />
          </View>
        </View>
      </Section>

      <Section title={t("accounts.savings.taxSection")}>
        <Text className="font-sans text-xs leading-5 text-muted">
          {t("accounts.savings.taxHelp")}
        </Text>
        <TextField
          label={t("accounts.savings.taxJurisdiction")}
          placeholder={t("accounts.savings.taxJurisdictionPlaceholder")}
          value={value.taxJurisdiction}
          onChange={(next) => change("taxJurisdiction", next)}
        />
        <ChoiceGroup
          label={t("accounts.savings.taxTreatment")}
          options={taxTreatmentOptions}
          value={value.taxTreatment}
          onChange={(next) => change("taxTreatment", next)}
        />
        {value.taxTreatment !== "tax_exempt" && (
          <>
            <ChoiceGroup
              label={t("accounts.savings.taxableAmount")}
              options={taxBasisOptions}
              value={value.taxBasis}
              onChange={(next) => change("taxBasis", next)}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <RateField
                  label={
                    value.taxTreatment === "progressive"
                      ? t("accounts.savings.estimatedEffectiveTax")
                      : t("accounts.savings.estimatedTaxRate")
                  }
                  value={value.estimatedTaxRate}
                  onChange={(next) => change("estimatedTaxRate", next)}
                />
              </View>
              <View className="flex-1">
                <MoneyField
                  currencyCode={currencyCode}
                  label={t("accounts.savings.taxFreeAllowance")}
                  value={value.taxFreeAllowance}
                  onChange={(next) => change("taxFreeAllowance", next)}
                />
              </View>
            </View>
          </>
        )}
      </Section>

      <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-manrope-bold text-base text-foreground">
            {t("accounts.savings.fullWithdrawalEstimate")}
          </Text>
          <Text className="font-manrope-bold text-base text-accent">
            {formatCurrency(estimate.estimatedNetWithdrawal, currencyCode)}
          </Text>
        </View>
        <EstimateRow
          label={t("accounts.savings.currentBalance")}
          value={estimate.balance}
          currencyCode={currencyCode}
        />
        <EstimateRow
          label={t("accounts.cards.yourPrincipal")}
          value={estimate.principal}
          currencyCode={currencyCode}
        />
        <EstimateRow
          label={t("accounts.savings.investmentEarnings")}
          value={estimate.earnings}
          currencyCode={currencyCode}
        />
        <EstimateRow
          label={t("accounts.savings.performanceFee")}
          value={-estimate.performanceFee}
          currencyCode={currencyCode}
        />
        <EstimateRow
          label={t("accounts.savings.earlyWithdrawal")}
          value={-estimate.earlyWithdrawalFee}
          currencyCode={currencyCode}
        />
        <EstimateRow
          label={t("accounts.savings.estimatedTax")}
          value={-estimate.estimatedTax}
          currencyCode={currencyCode}
        />
        <Text className="font-sans text-[11px] leading-4 text-muted">
          {t("accounts.savings.annualManagementEstimate", {
            amount: formatCurrency(
              estimate.estimatedAnnualManagementFee,
              currencyCode,
            ),
          })}
        </Text>
      </View>

      <View className="gap-2">
        <FieldLabel>{t("accounts.savings.notesOptional")}</FieldLabel>
        <TextInput
          accessibilityLabel={t("accounts.savings.notesAccessibility")}
          multiline
          maxLength={500}
          onChangeText={(next) => change("notes", next)}
          placeholder={t("accounts.savings.notesPlaceholder")}
          placeholderTextColor={theme.muted}
          style={[
            styles.notes,
            {
              backgroundColor: theme.surface,
              color: theme.foreground,
              direction,
              textAlign: "auto",
              writingDirection: direction,
            },
          ]}
          textAlignVertical="top"
          value={value.notes}
        />
      </View>
    </View>
  );
}

function SavingsModeToggle({
  isDetailed,
  onChange,
}: {
  isDetailed: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t("accounts.savings.detailedTracking")}
      accessibilityHint={t("accounts.savings.detailedTrackingHint")}
      accessibilityState={{ checked: isDetailed }}
      className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-4"
      onPress={() => onChange(!isDetailed)}
    >
      <View className="size-11 items-center justify-center rounded-xl bg-accent/15">
        <FilledIcon name="piggy-bank" size={23} tone="accent" />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-manrope-semibold text-base text-foreground">
          {t("accounts.savings.detailedTracking")}
        </Text>
        <Text className="font-sans text-xs leading-5 text-muted">
          {isDetailed
            ? t("accounts.savings.detailedEnabled")
            : t("accounts.savings.detailedDisabled")}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {Platform.OS === "android" ? (
          <HeroSwitch isSelected={isDetailed} style={{ height: 28, width: 60 }}>
            <HeroSwitch.Thumb style={{ height: 24, width: 36 }} />
          </HeroSwitch>
        ) : (
          <Switch
            thumbColor={isDetailed ? theme.accentForeground : theme.muted}
            trackColor={{
              false: theme.surfaceTertiary,
              true: theme.accent,
            }}
            value={isDetailed}
          />
        )}
      </View>
    </Pressable>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View className="gap-4 border-t border-border pt-4">
      <Text className="font-manrope-bold text-sm text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-manrope-medium text-sm text-muted">{children}</Text>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { direction } = useAppLocalization();

  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        accessibilityLabel={label}
        className="h-14 rounded-2xl bg-surface"
        onChangeText={onChange}
        placeholder={placeholder}
        style={{ direction, textAlign: "auto", writingDirection: direction }}
        value={value}
      />
    </View>
  );
}

function NumberField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { direction } = useAppLocalization();

  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        accessibilityLabel={label}
        className="h-14 rounded-2xl bg-surface"
        keyboardType="decimal-pad"
        onChangeText={onChange}
        placeholder={placeholder}
        style={{ direction, textAlign: "auto", writingDirection: direction }}
        value={value}
      />
    </View>
  );
}

function MoneyField({
  currencyCode,
  label,
  onChange,
  value,
}: {
  currencyCode: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <NumberField
      label={t("accounts.savings.moneyLabel", {
        label,
        currency: currencyCode,
      })}
      onChange={onChange}
      placeholder={t("accounts.savings.zeroAmountPlaceholder")}
      value={value}
    />
  );
}

function RateField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <NumberField
      label={t("accounts.savings.rateLabel", { label })}
      onChange={onChange}
      placeholder={t("accounts.savings.zeroRatePlaceholder")}
      value={value}
    />
  );
}

function ChoiceGroup<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  value: T;
}) {
  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className={`min-h-10 justify-center rounded-xl border px-3 py-2 ${selected ? "border-accent bg-accent/15" : "border-border bg-surface"}`}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={`font-manrope-semibold text-xs ${selected ? "text-accent" : "text-foreground"}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EstimateRow({
  currencyCode,
  label,
  value,
}: {
  currencyCode: string;
  label: string;
  value: number;
}) {
  const { formatCurrency } = useCurrencyFormat();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-sans text-xs text-muted">{label}</Text>
      <Text
        className={`font-manrope-semibold text-xs ${value < 0 ? "text-danger" : "text-foreground"}`}
      >
        {value < 0 ? "−" : ""}
        {formatCurrency(value, currencyCode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notes: {
    borderRadius: 16,
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    minHeight: 104,
    padding: 14,
  },
});
