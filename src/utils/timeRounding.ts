import { TimeRoundingInterval } from '../types';

/**
 * Round time duration up to the nearest interval
 * @param seconds - Duration in seconds
 * @param interval - Rounding interval in minutes
 * @returns Rounded duration in seconds
 */
export function roundTimeUp(seconds: number, interval: TimeRoundingInterval): number {
  if (interval === 1) {
    // No rounding needed
    return seconds;
  }

  const intervalSeconds = interval * 60;
  const remainder = seconds % intervalSeconds;

  if (remainder === 0) {
    // Already aligned to interval
    return seconds;
  }

  // Round up to next interval
  return seconds + (intervalSeconds - remainder);
}

/**
 * Format rounded time with indication
 * @param originalSeconds - Original duration in seconds
 * @param roundedSeconds - Rounded duration in seconds
 * @returns Formatted string with indication if rounded
 */
export function formatRoundedTime(originalSeconds: number, roundedSeconds: number): string {
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const rounded = formatDuration(roundedSeconds);

  if (originalSeconds !== roundedSeconds) {
    const original = formatDuration(originalSeconds);
    return `${rounded} (${original} aufgerundet)`;
  }

  return rounded;
}

/**
 * Get rounding interval label
 */
export function getRoundingIntervalLabel(interval: TimeRoundingInterval): string {
  if (interval === 1) return 'Keine Aufrundung';
  if (interval === 60) return '1 Stunde';
  return `${interval} Minuten`;
}

/**
 * Calculate billable duration with rounding
 */
export function calculateBillableDuration(
  seconds: number,
  interval: TimeRoundingInterval,
  isBillable: boolean = true
): number {
  if (!isBillable) {
    return 0;
  }

  return roundTimeUp(seconds, interval);
}
