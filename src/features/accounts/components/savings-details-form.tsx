import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import {
    CONTRIBUTION_MODE_OPTIONS,
    estimateSavingsDraftWithdrawal,
    LIQUIDITY_OPTIONS,
    SAVINGS_PRODUCT_OPTIONS,
    TAX_BASIS_OPTIONS,
    TAX_TREATMENT_OPTIONS,
    type SavingsDetailsDraft,
} from "@/data/model/savings-account";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import {
  CONTINUOUS,
  FieldInput,
  FormCard,
  FormHelp,
  FormLabel,
  SwitchRow,
  TABULAR,
} from "@/shared/ui/form-ui";

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

  const modeToggle = (
    <FormCard>
      <SwitchRow
        icon="piggy-bank"
        title={t("accounts.savings.detailedTracking")}
        description={
          value.isDetailed
            ? t("accounts.savings.detailedEnabled")
            : t("accounts.savings.detailedDisabled")
        }
        value={value.isDetailed}
        onChange={(isDetailed) => change("isDetailed", isDetailed)}
      />
    </FormCard>
  );

  if (!value.isDetailed) return modeToggle;

  return (
    <View className="gap-3">
      {modeToggle}

      <FormCard>
      <View className="gap-2">
        <FieldLabel>{t("accounts.savings.productType")}</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showProducts }}
          onPress={() => setShowProducts((current) => !current)}
          className="min-h-16 flex-row items-center gap-3 rounded-2xl px-4 py-3"
          style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
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
          <View
            className="overflow-hidden rounded-2xl"
            style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
          >
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
                  className="min-h-16 flex-row items-center gap-3 px-4 py-3"
                  style={{
                    borderBottomWidth:
                      index < productOptions.length - 1
                        ? StyleSheet.hairlineWidth
                        : 0,
                    borderBottomColor: theme.border,
                    backgroundColor: selected
                      ? colorWithAlpha(theme.accent, 0.12)
                      : "transparent",
                  }}
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
      </FormCard>

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
        <FormHelp>{t("accounts.savings.feesHelp")}</FormHelp>
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
        <FormHelp>{t("accounts.savings.taxHelp")}</FormHelp>
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

      <FormCard>
        <View className="gap-1">
          <Text className="font-manrope-semibold text-[13px] leading-[18px] text-muted">
            {t("accounts.savings.fullWithdrawalEstimate")}
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            className="font-manrope-bold text-[28px] leading-[34px] text-accent"
            style={TABULAR}
          >
            {formatCurrency(estimate.estimatedNetWithdrawal, currencyCode)}
          </Text>
        </View>
        <View className="gap-2.5 border-t border-border/70 pt-3">
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
        </View>
        <FormHelp>
          {t("accounts.savings.annualManagementEstimate", {
            amount: formatCurrency(
              estimate.estimatedAnnualManagementFee,
              currencyCode,
            ),
          })}
        </FormHelp>
      </FormCard>

      <FormCard>
        <View className="gap-2">
          <FieldLabel>{t("accounts.savings.notesOptional")}</FieldLabel>
          <FieldInput
            accessibilityLabel={t("accounts.savings.notesAccessibility")}
            multiline
            maxLength={500}
            onChangeText={(next) => change("notes", next)}
            placeholder={t("accounts.savings.notesPlaceholder")}
            style={styles.notes}
            textAlignVertical="top"
            value={value.notes}
          />
        </View>
      </FormCard>
    </View>
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
    <FormCard title={title}>{children}</FormCard>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <FormLabel>{children}</FormLabel>;
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
  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <FieldInput
        accessibilityLabel={label}
        onChangeText={onChange}
        placeholder={placeholder}
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
  return (
    <View className="gap-2">
      <FieldLabel>{label}</FieldLabel>
      <FieldInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        onChangeText={onChange}
        placeholder={placeholder}
        style={TABULAR}
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
              className={`min-h-11 justify-center rounded-xl border-[1.5px] px-3.5 py-2 ${selected ? "border-accent bg-accent/15" : "border-transparent bg-surface-secondary"}`}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={`font-manrope-semibold text-[13px] ${selected ? "text-accent" : "text-foreground"}`}
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
    fontSize: 15,
    height: "auto",
    minHeight: 104,
    paddingVertical: 14,
  },
});
