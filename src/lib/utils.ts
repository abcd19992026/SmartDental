import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a numeric amount in Indian numbering with a rupee symbol and no decimals (e.g. ₹5,000).
 * Handles null, undefined, and NaN as ₹0. */
export function formatINR(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return "₹0";
  }
  const num = Math.round(Number(val));
  return `₹${num.toLocaleString("en-IN")}`;
}
