export function isWithinQuietHours(now: Date, quietStart: string, quietEnd: string): boolean {
  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  // Cross-midnight interval, e.g. 23:00 -> 07:00
  return current >= start || current < end;
}

export function canSendReminderNow(now: Date, reminderTime: string): boolean {
  const [h, m] = reminderTime.split(":").map(Number);
  return now.getHours() === h && now.getMinutes() === m;
}

export function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

