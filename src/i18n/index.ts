import { en } from './en';
import { UiDictionary, vi } from './vi';

export type Locale = 'vi' | 'en';

export const DICTIONARIES: Record<Locale, UiDictionary> = {
  vi,
  en,
};

export function getDictionary(locale: Locale = 'vi'): UiDictionary {
  return DICTIONARIES[locale] ?? vi;
}

export { vi, en };
export type { UiDictionary };
