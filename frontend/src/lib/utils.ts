import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Abbreviates all but the last word to "X." for compact table display. */
export function abbreviateTenantName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return name.trim()
  const last = words[words.length - 1]
  const abbreviated = words.slice(0, -1).map((word) => `${word[0]}.`)
  return [...abbreviated, last].join(" ")
}
