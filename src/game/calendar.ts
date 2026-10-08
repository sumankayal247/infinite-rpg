// In-game time: hours since campaign start -> calendar fields. Owns world time.
export interface Cal { year: number; month: number; week: number; day: number; dayAbs: number; hour: number; season: string; label: string; monthName: string }
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const MONTHS = ["Thawmoot", "Seedfall", "Greenrise", "Highsun", "Embertide", "Harvest", "Redleaf", "Frostmoot", "Deepwinter", "Starwatch", "Ashfall", "Yule"];
export function calendar(hours: number): Cal {
  const dayAbs = Math.floor(hours / 24) + 1;
  const hour = Math.floor(hours % 24);
  const d0 = dayAbs - 1;
  const year = Math.floor(d0 / 360) + 1;
  const month = Math.floor((d0 % 360) / 30) + 1;
  const day = (d0 % 30) + 1;
  const week = Math.floor((d0 % 30) / 7) + 1;
  const season = SEASONS[Math.floor((month - 1) / 3)];
  const monthName = MONTHS[month - 1];
  return { year, month, week, day, dayAbs, hour, season, monthName, label: `Day ${dayAbs} · ${String(hour).padStart(2, "0")}:00 · ${season}` };
}
export const isNight = (hours: number) => { const h = hours % 24; return h < 6 || h >= 20; };
