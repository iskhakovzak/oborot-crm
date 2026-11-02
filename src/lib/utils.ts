import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { randomBytes } from "node:crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId(prefix?: string) {
  const s = randomBytes(9).toString("base64url");
  return prefix ? `${prefix}_${s}` : s;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3600_000);
}
