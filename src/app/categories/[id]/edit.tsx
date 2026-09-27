import { useLocalSearchParams } from "expo-router";
import { CategoryEditorScreen } from "@/features/categories/category-editor-screen";

export default function EditCategoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CategoryEditorScreen key={id} editId={id} />;
}
