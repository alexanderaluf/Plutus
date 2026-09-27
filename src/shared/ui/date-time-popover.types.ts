export type DateTimePopoverProps = {
  accentColor: string;
  isDark: boolean;
  isPresented: boolean;
  maximumDate?: Date;
  mode: "date" | "time";
  title: string;
  value: Date;
  onDismiss: () => void;
  onValueChange: (value: Date) => void;
};