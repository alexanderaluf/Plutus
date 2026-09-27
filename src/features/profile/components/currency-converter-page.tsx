import { EdgeToEdgeScrollView } from "@/shared/ui/edge-to-edge-layout";
import { Button, Input } from "heroui-native";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import { convertCurrency } from "@/data/model/exchange-rate";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { currencies, type CurrencyOption } from "../data/currencies-data";
import { useProfiles } from "../profile-provider";
import { CurrencySelectorSheet } from "./currency-selector-sheet";

type CurrencySide = "from" | "to";

function findCurrency(code: string) {
  return currencies.find((currency) => currency.code === code);
}

function CurrencyPanel({
  accessibilityLabel,
  amount,
  currency,
  label,
  loading,
  onChangeAmount,
  onSelectCurrency,
}: {
  accessibilityLabel: string;
  amount: string;
  currency: CurrencyOption;
  label: string;
  loading: boolean;
  onChangeAmount: (value: string) => void;
  onSelectCurrency: () => void;
}) {
  return (
    <View className="min-w-0 flex-1 gap-3 rounded-[24px] bg-surface p-4">
      <Text className="font-manrope-semibold text-xs text-muted">{label}</Text>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center justify-between rounded-2xl bg-surface-secondary px-3 py-2"
        onPress={onSelectCurrency}
        style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
      >
        <View className="min-w-0 flex-1">
          <Text className="font-manrope-bold text-base text-foreground">
            {currency.code}
          </Text>
          <Text className="font-sans text-xs text-muted" numberOfLines={1}>
            {currency.name}
          </Text>
        </View>
        <FilledIcon name="chevron-right" size={20} tone="muted" />
      </Pressable>
      <Input
        accessibilityLabel={label}
        className="h-16 rounded-2xl bg-surface-secondary px-3 text-left font-manrope-bold text-xl"
        containerClassName="w-full"
        keyboardType="decimal-pad"
        onChangeText={onChangeAmount}
        placeholder={loading ? "…" : "0"}
        value={amount}
      />
    </View>
  );
}

export function CurrencyConverterPage() {
  const { t } = useTranslation();
  const { activeProfile } = useProfiles();
  const { document, ensureExchangeRates } = useLocalData();
  const profileCurrency = activeProfile.currencyCode.toUpperCase();
  const fallbackCurrency = currencies[0];
  const [fromCode, setFromCode] = useState(profileCurrency);
  const [toCode, setToCode] = useState(profileCurrency);
  const [amount, setAmount] = useState("1");
  const [activeSide, setActiveSide] = useState<CurrencySide>("from");
  const [rate, setRate] = useState<number | null>(1);
  const [rateDate, setRateDate] = useState("");
  const [isCached, setIsCached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectorSide, setSelectorSide] = useState<CurrencySide | null>(null);
  const requestId = useRef(0);

  const loadRate = useEffectEvent(
    async (currentRequest: number, sourceCode: string, targetCode: string) => {
      setError("");
      setIsCached(false);
      setRateDate("");

      if (sourceCode === targetCode) {
        setRate(1);
        setIsLoading(false);
        return;
      }

      setRate(null);
      setIsLoading(true);
      try {
        const snapshot = await ensureExchangeRates(sourceCode);
        if (currentRequest !== requestId.current) return;
        const nextRate = snapshot.rates[targetCode];
        if (!nextRate)
          throw new Error(t("converter.noRate", { currency: targetCode }));
        setRate(nextRate);
        setRateDate(snapshot.date);
      } catch (reason: unknown) {
        if (currentRequest !== requestId.current) return;
        const saved = selectExchangeRates(document, sourceCode);
        const savedRate = saved?.rates[targetCode];
        if (saved && savedRate) {
          setRate(savedRate);
          setRateDate(saved.date);
          setIsCached(true);
          setError(t("converter.savedRateNotice"));
          return;
        }
        setError(
          reason instanceof Error ? reason.message : t("converter.loadError"),
        );
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    },
  );

  useEffect(() => {
    const currentRequest = ++requestId.current;
    void loadRate(currentRequest, fromCode, toCode);

    return () => {
      requestId.current += 1;
    };
  }, [fromCode, toCode]);

  const numericAmount = Number(amount.replace(",", "."));
  let convertedAmount = "";
  if (rate !== null && amount.trim() && Number.isFinite(numericAmount)) {
    try {
      convertedAmount = String(
        activeSide === "from"
          ? convertCurrency(numericAmount, rate, toCode)
          : convertCurrency(numericAmount, 1 / rate, fromCode),
      );
    } catch {
      convertedAmount = "";
    }
  }

  const fromAmount = activeSide === "from" ? amount : convertedAmount;
  const toAmount = activeSide === "to" ? amount : convertedAmount;

  const fromCurrency = findCurrency(fromCode) ?? fallbackCurrency;
  const toCurrency = findCurrency(toCode) ?? fallbackCurrency;
  const selectedCode = selectorSide === "to" ? toCode : fromCode;

  function selectCurrency(currency: CurrencyOption) {
    if (selectorSide === "from") setFromCode(currency.code);
    if (selectorSide === "to") setToCode(currency.code);
  }

  return (
    <>
      <EdgeToEdgeScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 28 }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between gap-4">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-manrope-bold text-xl text-foreground">
              {t("converter.heading")}
            </Text>
            <Text className="font-sans text-sm leading-5 text-muted">
              {t("converter.description")}
            </Text>
          </View>
          <Button
            isIconOnly
            variant="secondary"
            accessibilityLabel={t("converter.swap")}
            onPress={() => {
              setFromCode(toCode);
              setToCode(fromCode);
              setActiveSide((current) => (current === "from" ? "to" : "from"));
            }}
          >
            <FilledIcon name="swap-horizontal" size={22} />
          </Button>
        </View>

        <View className="flex-row items-stretch gap-3">
          <CurrencyPanel
            accessibilityLabel={t("converter.selectFrom")}
            amount={fromAmount}
            currency={fromCurrency}
            label={t("converter.from")}
            loading={isLoading && activeSide === "to"}
            onChangeAmount={(value) => {
              setActiveSide("from");
              setAmount(value);
            }}
            onSelectCurrency={() => setSelectorSide("from")}
          />
          <CurrencyPanel
            accessibilityLabel={t("converter.selectTo")}
            amount={toAmount}
            currency={toCurrency}
            label={t("converter.to")}
            loading={isLoading && activeSide === "from"}
            onChangeAmount={(value) => {
              setActiveSide("to");
              setAmount(value);
            }}
            onSelectCurrency={() => setSelectorSide("to")}
          />
        </View>

        {rate !== null && rateDate ? (
          <Text className="text-center font-sans text-sm text-muted">
            {t("converter.rate", {
              from: fromCode,
              rate,
              to: toCode,
              date: rateDate,
            })}
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityRole={isCached ? undefined : "alert"}
            className={`text-center font-sans text-sm ${
              isCached ? "text-muted" : "text-danger"
            }`}
          >
            {error}
          </Text>
        ) : null}
      </EdgeToEdgeScrollView>

      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={selectorSide !== null}
        onOpenChange={(open) => {
          if (!open) setSelectorSide(null);
        }}
        onSelect={selectCurrency}
        selectedCode={selectedCode}
      />
    </>
  );
}
