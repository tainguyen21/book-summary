/** Locale-aware date and size formatting shared across screens. */

function parse(value: string): Date | undefined {
  const date = new Date(value);

  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
}

/** "Today", "Yesterday", or a short date such as "Oct 10". */
export function formatDay(value: string): string {
  const date = parse(value);

  if (!date) {
    return value;
  }

  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatTime(value: string): string {
  const date = parse(value);

  return date
    ? new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date)
    : "";
}

export function formatDate(value: string): string {
  const date = parse(value);

  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : value;
}

/** "just now", "5 min ago", "3 h ago", or a day label for older times. */
export function formatRelative(value: string): string {
  const date = parse(value);

  if (!date) {
    return value;
  }

  const minutes = Math.round((Date.now() - date.valueOf()) / 60_000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (minutes < 24 * 60) {
    return `${Math.round(minutes / 60)} h ago`;
  }

  return formatDay(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  return hour < 18 ? "Good afternoon" : "Good evening";
}
