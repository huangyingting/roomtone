import { parseHome, type Home } from "./model";

export const AUTOSAVE_KEY = "roomtone:autosave:v1";
export const SAVES_KEY = "roomtone:homes:v1";
export interface SavedHome { id: string; savedAt: string; home: Home }
export function readAutosave(): Home | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  return raw ? parseHome(JSON.parse(raw)) : null;
}
export function readSaves(): SavedHome[] {
  const raw = localStorage.getItem(SAVES_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 30) throw new Error("The saved-home library is invalid. Export your current home before resetting it.");
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("id" in entry) || !("savedAt" in entry) || !("home" in entry) || typeof entry.id !== "string" || typeof entry.savedAt !== "string") throw new Error("A saved-home entry is invalid.");
    return { id: entry.id, savedAt: entry.savedAt, home: parseHome(entry.home) };
  });
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
