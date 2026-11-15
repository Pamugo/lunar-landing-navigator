import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_STORAGE_KEY,
  TRANSLATIONS,
  type Language,
  type TranslationDictionary,
} from "./translations";

export interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: TranslationDictionary;
}

function readInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    // Ignore storage read restrictions in private or sandboxed contexts
  }
  return "en";
}

const DEFAULT_CONTEXT_VALUE: LanguageContextValue = {
  lang: "en",
  setLang: () => undefined,
  toggleLang: () => undefined,
  t: TRANSLATIONS.en,
};

const LanguageContext = createContext<LanguageContextValue>(DEFAULT_CONTEXT_VALUE);

export interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

export function LanguageProvider({ children, initialLanguage }: LanguageProviderProps) {
  const [lang, setLangState] = useState<Language>(() => initialLanguage ?? readInitialLanguage());

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.title = TRANSLATIONS[lang].meta.pageTitle;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch {
        // Ignore storage write errors
      }
    }
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === "es" ? "en" : "es"));
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang,
      t: TRANSLATIONS[lang],
    }),
    [lang, setLang, toggleLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
