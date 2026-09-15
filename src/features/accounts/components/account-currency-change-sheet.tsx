import { BottomSheet, Button } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import {
  convertCurrency,
  type ExchangeRateSnapshot,
} from "@/data/model/exchange-rate";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

export type CurrencyChangeRequest = {
  from: string;
  to: string;
  amount: number;
};

export function AccountCurrencyChangeSheet({
  request,
  onClose,
  onApply,
}: {
  request: CurrencyChangeRequest | null;
  onClose: () => void;
  onApply: (amount: number, explanation: string) => void;
}) {
  const { t } = useTranslation();
  const { document, ensureExchangeRates } = useLocalData();
  const insets = useSafeAreaInsets();
  const isOpen = request !== null;
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [snapshot, setSnapshot] = useState<ExchangeRateSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setSnapshot(null);
    setLoading(false);
    setError("");
    setCached(false);
    return () => {
      generation.current += 1;
    };
  }, [request]);

  async function loadRate() {
    if (!request || loading) return;
    const current = generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await ensureExchangeRates(request.from);
      if (current !== generation.current) return;
      if (!next.rates[request.to])
        throw new Error(
          t("accounts.currencyChange.noRate", { currency: request.to }),
        );
      setSnapshot(next);
      setCached(false);
    } catch (reason) {
      if (current !== generation.current) return;
      const saved = selectExchangeRates(document, request.from);
      if (saved?.rates[request.to]) {
        setSnapshot(saved);
        setCached(true);
        setError(t("accounts.currencyChange.refreshError"));
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : t("accounts.currencyChange.loadError"),
        );
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }

  const rate = request ? snapshot?.rates[request.to] : undefined;
  let converted: number | null = null;
  let conversionError = "";
  if (request && rate) {
    try {
      converted = convertCurrency(request.amount, rate, request.to);
    } catch (reason) {
      conversionError =
        reason instanceof Error
          ? reason.message
          : t("accounts.currencyChange.conversionError");
    }
  }
  const oldRate =
    snapshot && snapshot.date !== new Date().toISOString().slice(0, 10);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          topInset={insets.top}
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
          contentContainerClassName="px-5 pt-2"
        >
          {request && (
            <View
              className="gap-4"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <BottomSheet.Title>
                {t("accounts.currencyChange.title")}
              </BottomSheet.Title>
              <BottomSheet.Description>
                {t("accounts.currencyChange.description", {
                  amount: request.amount,
                  from: request.from,
                  to: request.to,
                })}
              </BottomSheet.Description>
              <Button
                variant="secondary"
                onPress={() =>
                  onApply(
                    request.amount,
                    t("accounts.currencyChange.keptExplanation", {
                      amount: request.amount,
                      from: request.from,
                      to: request.to,
                    }),
                  )
                }
              >
                <Button.Label>
                  {t("accounts.currencyChange.keepAmount", {
                    amount: request.amount,
                    currency: request.to,
                  })}
                </Button.Label>
              </Button>
              {!!(error || conversionError) && (
                <Text accessibilityRole="alert" className="text-danger">
                  {error || conversionError}
                </Text>
              )}
              {snapshot && rate && converted !== null && (
                <View className="gap-2 rounded-2xl bg-surface-secondary p-4">
                  <Text className="font-manrope-bold text-lg text-foreground">
                    {converted} {request.to}
                  </Text>
                  <Text className="text-sm text-muted">
                    {t("accounts.currencyChange.rateDetails", {
                      from: request.from,
                      rate,
                      to: request.to,
                      date: snapshot.date,
                    })}
                  </Text>
                  {(cached || oldRate) && (
                    <Text className="text-sm text-muted">
                      {t("accounts.currencyChange.rateStatus", {
                        source: cached
                          ? t("accounts.currencyChange.savedRate")
                          : t("accounts.currencyChange.latestRate"),
                        age: oldRate
                          ? t("accounts.currencyChange.notToday")
                          : "",
                      })}
                    </Text>
                  )}
                  <Button
                    onPress={() =>
                      onApply(
                        converted!,
                        t("accounts.currencyChange.convertedExplanation", {
                          amount: request.amount,
                          from: request.from,
                          converted,
                          to: request.to,
                          rate,
                          date: snapshot.date,
                        }),
                      )
                    }
                  >
                    <Button.Label>
                      {cached || oldRate
                        ? t("accounts.currencyChange.useDatedRate")
                        : t("accounts.currencyChange.applyConversion")}
                    </Button.Label>
                  </Button>
                </View>
              )}
              <Button
                variant={snapshot ? "tertiary" : "primary"}
                isDisabled={loading}
                onPress={loadRate}
              >
                <Button.Label>
                  {loading
                    ? t("accounts.currencyChange.loadingRate")
                    : snapshot
                      ? t("accounts.currencyChange.refreshRate")
                      : t("accounts.currencyChange.previewConversion")}
                </Button.Label>
              </Button>
              <Button variant="ghost" onPress={onClose}>
                <Button.Label>
                  {t("accounts.currencyChange.cancel")}
                </Button.Label>
              </Button>
            </View>
          )}
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
