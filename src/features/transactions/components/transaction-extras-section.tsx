import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import type { TransactionType } from "@/data/model/transaction-record";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { TransactionOptionPickerSheet } from "./transaction-option-picker-sheet";
import type { TransactionOption } from "./transaction-selection-section";

type ExtraAttributeKey = "budget" | "label" | "loan" | "place" | "person";

type AttributeDescriptor = {
  key: ExtraAttributeKey;
  title: string;
  icon: FilledIconName;
  options: TransactionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd?: () => void;
};

type TransactionExtrasSectionProps = {
  type: TransactionType;
  description: string;
  receiptUri: string | null;
  budgetId: string;
  labelId: string;
  loanId: string;
  placeId: string;
  personId: string;
  budgetOptions: TransactionOption[];
  labelOptions: TransactionOption[];
  loanOptions: TransactionOption[];
  placeOptions: TransactionOption[];
  personOptions: TransactionOption[];
  disabled?: boolean;
  onChangeDescription: (value: string) => void;
  onPickReceipt: () => void;
  onRemoveReceipt: () => void;
  onSelectBudget: (id: string) => void;
  onSelectLabel: (id: string) => void;
  onSelectLoan: (id: string) => void;
  onSelectPlace: (id: string) => void;
  onSelectPerson: (id: string) => void;
  onAddBudget: () => void;
};

/**
 * Progressive-disclosure optional details:
 * - Compact Notes + Receipt surface
 * - Clean context attribute pills (`Budget`, `Label`, `Loan`, `Place`, `Payee`)
 *   opening native sheets on demand and omitting unpopulated dead collections.
 */
export function TransactionExtrasSection({
  type,
  description,
  receiptUri,
  budgetId,
  labelId,
  loanId,
  placeId,
  personId,
  budgetOptions,
  labelOptions,
  loanOptions,
  placeOptions,
  personOptions,
  disabled = false,
  onChangeDescription,
  onPickReceipt,
  onRemoveReceipt,
  onSelectBudget,
  onSelectLabel,
  onSelectLoan,
  onSelectPlace,
  onSelectPerson,
  onAddBudget,
}: TransactionExtrasSectionProps) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const [activeSheet, setActiveSheet] = useState<ExtraAttributeKey | null>(
    null,
  );

  const allAttributes: AttributeDescriptor[] = [
    ...(type !== 2 || budgetOptions.length > 0 || Boolean(budgetId)
      ? [
          {
            key: "budget" as const,
            title: t("transactions.common.fields.budget"),
            icon: "wallet" as const,
            options: budgetOptions,
            selectedId: budgetId,
            onSelect: onSelectBudget,
            onAdd: onAddBudget,
          },
        ]
      : []),
    ...(labelOptions.length > 0 || Boolean(labelId)
      ? [
          {
            key: "label" as const,
            title: t("transactions.common.fields.label"),
            icon: "tag" as const,
            options: labelOptions,
            selectedId: labelId,
            onSelect: onSelectLabel,
          },
        ]
      : []),
    ...(loanOptions.length > 0 || Boolean(loanId)
      ? [
          {
            key: "loan" as const,
            title: t("transactions.common.fields.loan"),
            icon: "credit-card" as const,
            options: loanOptions,
            selectedId: loanId,
            onSelect: onSelectLoan,
          },
        ]
      : []),
    ...(placeOptions.length > 0 || Boolean(placeId)
      ? [
          {
            key: "place" as const,
            title: t("transactions.common.fields.place"),
            icon: "map-marker" as const,
            options: placeOptions,
            selectedId: placeId,
            onSelect: onSelectPlace,
          },
        ]
      : []),
    ...(personOptions.length > 0 || Boolean(personId)
      ? [
          {
            key: "person" as const,
            title: t("transactions.common.fields.payee"),
            icon: "account" as const,
            options: personOptions,
            selectedId: personId,
            onSelect: onSelectPerson,
          },
        ]
      : []),
  ];

  const activeDescriptor = activeSheet
    ? allAttributes.find((item) => item.key === activeSheet) ?? null
    : null;

  return (
    <View className="gap-3.5" style={{ direction }}>
      {/* Notes & Receipt */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.notesRow}>
          <View style={styles.notesIconSlot}>
            <FilledIcon name="notes" size={18} tone="muted" />
          </View>
          <TextInput
            accessibilityLabel={t("transactions.form.description")}
            allowFontScaling
            editable={!disabled}
            maxLength={300}
            multiline
            placeholder={t("transactions.form.descriptionPlaceholder")}
            placeholderTextColor={colorWithAlpha(theme.foreground, 0.36)}
            textAlignVertical="top"
            value={description}
            onChangeText={onChangeDescription}
            style={[
              styles.notesInput,
              {
                color: theme.foreground,
                textAlign: direction === "rtl" ? "right" : "left",
                writingDirection: direction,
              },
            ]}
          />
        </View>

        <View
          style={[
            styles.divider,
            { backgroundColor: colorWithAlpha(theme.border, 0.75) },
          ]}
        />

        {receiptUri ? (
          <View style={styles.receiptPreviewWrap}>
            <Pressable
              accessibilityLabel={t(
                "transactions.form.replaceReceiptAccessibility",
              )}
              accessibilityRole="button"
              disabled={disabled}
              onPress={onPickReceipt}
              style={({ pressed }) => [
                styles.receiptPreviewBox,
                {
                  borderColor: colorWithAlpha(theme.border, 0.8),
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <Image
                resizeMode="cover"
                source={{ uri: receiptUri }}
                style={StyleSheet.absoluteFill}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t("transactions.form.removeReceipt")}
              accessibilityRole="button"
              disabled={disabled}
              hitSlop={8}
              onPress={onRemoveReceipt}
              style={({ pressed }) => [
                styles.removeReceiptButton,
                {
                  backgroundColor: theme.danger,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <FilledIcon color="#FFFFFF" name="close" size={16} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={t("transactions.form.addReceiptAccessibility")}
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPickReceipt}
            style={({ pressed }) => [
              styles.receiptActionRow,
              { opacity: pressed ? 0.68 : 1 },
            ]}
          >
            <View
              style={[
                styles.receiptBadge,
                {
                  backgroundColor: colorWithAlpha(
                    theme.accent,
                    theme.isDark ? 0.18 : 0.11,
                  ),
                },
              ]}
            >
              <FilledIcon name="camera" size={18} tone="accent" />
            </View>
            <Text className="flex-1 font-manrope-medium text-sm text-foreground">
              {t("transactions.form.addReceipt")}
            </Text>
            <FilledIcon name="plus" size={18} tone="accent" />
          </Pressable>
        )}
      </View>

      {/* Attribute Context Pills */}
      {allAttributes.length > 0 ? (
        <View
          style={[
            styles.card,
            styles.attributeCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
        <View style={styles.attributeWrap}>
          {allAttributes.map((attr) => {
            const selectedOption = attr.options.find(
              (option) => option.id === attr.selectedId,
            );
            const activeColor = selectedOption?.color ?? theme.accent;

            if (selectedOption) {
              return (
                <View
                  key={attr.key}
                  style={[
                    styles.selectedAttributeChip,
                    {
                      backgroundColor: colorWithAlpha(
                        activeColor,
                        theme.isDark ? 0.22 : 0.12,
                      ),
                      borderColor: activeColor,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityLabel={`${attr.title}: ${selectedOption.name}`}
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => {
                      Keyboard.dismiss();
                      setActiveSheet(attr.key);
                    }}
                    style={({ pressed }) => [
                      styles.selectedChipBody,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View
                      style={[
                        styles.attributeIconCircle,
                        {
                          backgroundColor: colorWithAlpha(
                            activeColor,
                            theme.isDark ? 0.3 : 0.18,
                          ),
                        },
                      ]}
                    >
                      <RecordIcon
                        color={activeColor}
                        name={selectedOption.icon}
                        pathData={selectedOption.iconPath}
                        size={14}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.attributeText,
                        { color: theme.foreground },
                      ]}
                    >
                      {selectedOption.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t("transactions.selection.deselect", {
                      name: selectedOption.name,
                    })}
                    accessibilityRole="button"
                    disabled={disabled}
                    hitSlop={6}
                    onPress={() => attr.onSelect("")}
                    style={({ pressed }) => [
                      styles.attributeClear,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <FilledIcon color={activeColor} name="close" size={14} />
                  </Pressable>
                </View>
              );
            }

            return (
              <Pressable
                key={attr.key}
                accessibilityLabel={attr.title}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => {
                  Keyboard.dismiss();
                  setActiveSheet(attr.key);
                }}
                style={({ pressed }) => [
                  styles.attributeChip,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderColor: "transparent",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <FilledIcon name={attr.icon} size={15} tone="muted" />
                <Text
                  numberOfLines={1}
                  style={[styles.attributeText, { color: theme.muted }]}
                >
                  {attr.title}
                </Text>
                <FilledIcon name="plus" size={14} tone="muted" />
              </Pressable>
            );
          })}
        </View>
        </View>
      ) : null}

      {activeDescriptor ? (
        <TransactionOptionPickerSheet
          options={activeDescriptor.options}
          selectedId={activeDescriptor.selectedId}
          title={activeDescriptor.title}
          onAdd={activeDescriptor.onAdd}
          onDismiss={() => setActiveSheet(null)}
          onSelect={activeDescriptor.onSelect}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  notesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  notesIconSlot: {
    paddingTop: 10,
  },
  notesInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    maxHeight: 110,
    paddingVertical: 8,
    fontFamily: "Huninn_400Regular",
    fontSize: 16,
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  receiptActionRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  receiptBadge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  receiptPreviewWrap: {
    padding: 12,
    position: "relative",
  },
  receiptPreviewBox: {
    height: 180,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  removeReceiptButton: {
    position: "absolute",
    top: 20,
    end: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  attributeCard: {
    padding: 14,
  },
  attributeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  attributeChip: {
    minHeight: 44,
    maxWidth: "100%",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 21,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  selectedAttributeChip: {
    minHeight: 42,
    maxWidth: "100%",
    borderRadius: 21,
    borderCurve: "continuous",
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    paddingEnd: 8,
  },
  selectedChipBody: {
    flexShrink: 1,
    minHeight: 40,
    paddingStart: 7,
    paddingEnd: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  attributeIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  attributeText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13.5,
    lineHeight: 18,
    flexShrink: 1,
  },
  attributeClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
