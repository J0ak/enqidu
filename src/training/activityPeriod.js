function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateWithinPeriod(key, period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return false;
  const startKey = localDateKey(period?.start);
  const endKey = localDateKey(period?.end);
  if (!startKey || !endKey) return false;
  return key >= startKey && key <= endKey;
}
