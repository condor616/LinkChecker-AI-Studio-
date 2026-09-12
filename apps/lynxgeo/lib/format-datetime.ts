/** Display timestamps as `September 12, 2026 - 10:12:08 CEST` (local TZ abbreviation). */

export function formatAppDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(date);

  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  const second = timeParts.find((p) => p.type === 'second')?.value ?? '00';
  const zone = timeParts.find((p) => p.type === 'timeZoneName')?.value ?? '';

  const timePart = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}${
    zone ? ` ${zone}` : ''
  }`;
  return `${datePart} - ${timePart}`;
}

/** Compact chip label: `Sep 12, 10:12 GMT+2`. */
export function formatAppDateTimeCompact(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(date);

  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const hour = (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(2, '0');
  const minute = (parts.find((p) => p.type === 'minute')?.value ?? '00').padStart(2, '0');
  const zone = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';

  return `${month} ${day}, ${hour}:${minute}${zone ? ` ${zone}` : ''}`;
}
