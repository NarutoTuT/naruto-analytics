import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhCN from "./zh-CN.json";

function loadLanguage(): string {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem("naruto-language");
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    /* localStorage unavailable */
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
  lng: loadLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
