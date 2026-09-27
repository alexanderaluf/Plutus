/** Device-local, half-open financial months. Short months clamp the saved day. */
export function financialMonth(now: Date, startDay: number, offset = 0) {
  const day =
    Number.isInteger(startDay) && startDay >= 1 && startDay <= 31
      ? startDay
      : 1;
  const boundary = (month: number) => {
    const lastDay = new Date(now.getFullYear(), month + 1, 0).getDate();
    return new Date(now.getFullYear(), month, Math.min(day, lastDay));
  };
  const currentMonth =
    now.getMonth() - (now < boundary(now.getMonth()) ? 1 : 0);
  const month = currentMonth + offset;
  const start = boundary(month);
  const end = boundary(month + 1);
  return { start, end, key: `${start.getFullYear()}-${start.getMonth() + 1}` };
}
