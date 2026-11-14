import { useState } from "react";

import {
  categoryDescendants,
  categoryHasChildren,
  categoryRootIdIn,
} from "@/data/selectors/document-selectors";
import type { Category } from "@/data/selectors/category-selectors";
import type { FilledIconName } from "@/shared/ui/filled-icon";

import { TransactionCategorySheet } from "./transaction-category-sheet";
import {
  TransactionSelectionSection,
  type TransactionOption,
} from "./transaction-selection-section";

function toOption(category: Category, description?: string): TransactionOption {
  return {
    id: category.id,
    name: category.name,
    description: description ?? category.description,
    icon: category.icon,
    iconPath: category.iconPath,
    color: category.color,
  };
}

/**
 * Category picker shared by every create/edit form. Only main categories are
 * shown as chips; choosing one that has subcategories opens a sheet where the
 * main category itself or any of its subcategories can be selected.
 */
export function CategorySelectionSection({
  categories,
  type,
  selectedId,
  onSelect,
  title,
  placeholder,
  icon = "chart-donut-variant",
  expanded,
  disabled,
  optional,
  compact,
  onToggle,
  onAdd,
}: {
  /** All categories of the active profile. */
  categories: readonly Category[];
  /** Restricts choices to one transaction type; omit to show every type. */
  type?: number;
  selectedId: string;
  onSelect: (id: string) => void;
  title: string;
  placeholder: string;
  icon?: FilledIconName;
  expanded: boolean;
  disabled?: boolean;
  optional?: boolean;
  compact?: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  const [sheetParentId, setSheetParentId] = useState<string | null>(null);
  const available =
    type === undefined
      ? categories
      : categories.filter((category) => category.type === type);
  const roots = available
    .filter(
      (category) =>
        !category.parentId ||
        !available.some((parent) => parent.id === category.parentId),
    )
    .map((category) => toOption(category));
  const selected = available.find((category) => category.id === selectedId);
  const selectedRootId = selected ? categoryRootIdIn(available, selected.id) : "";
  const selectedRoot = available.find(
    (category) => category.id === selectedRootId,
  );
  const selectedLabel =
    selected && selectedRoot && selected.id !== selectedRoot.id
      ? `${selectedRoot.name} › ${selected.name}`
      : undefined;

  const sheetParent = sheetParentId
    ? available.find((category) => category.id === sheetParentId)
    : undefined;
  const sheetChildren = sheetParent
    ? categoryDescendants(available, sheetParent.id).map((child) =>
        toOption(
          child,
          child.depth > 1
            ? available.find((parent) => parent.id === child.parentId)?.name
            : undefined,
        ),
      )
    : [];

  return (
    <>
      <TransactionSelectionSection
        title={title}
        placeholder={placeholder}
        icon={icon}
        options={roots}
        selectedId={selectedRootId}
        selectedLabel={selectedLabel}
        expanded={expanded}
        compact={compact}
        compactOptions
        disabled={disabled}
        optional={optional}
        onToggle={onToggle}
        onSelect={(id) => {
          // Tapping the highlighted main category reopens its sheet so the
          // subcategory can be changed; the sheet itself handles clearing.
          const target = id || selectedRootId;
          if (target && categoryHasChildren(available, target))
            setSheetParentId(target);
          else onSelect(id);
        }}
        onAdd={onAdd}
      />
      {sheetParent ? (
        <TransactionCategorySheet
          parent={toOption(sheetParent)}
          options={sheetChildren}
          selectedId={selectedId}
          onSelect={onSelect}
          onDismiss={() => setSheetParentId(null)}
        />
      ) : null}
    </>
  );
}
