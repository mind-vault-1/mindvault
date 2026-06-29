import React from "react";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === "en" ? "es" : "en";
    i18n.changeLanguage(next);
  };

  return (
    <button
      onClick={toggleLanguage}
      aria-label={i18n.t("language.switch_to")}
      title={i18n.t("language.switch_to")}
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {i18n.t("language.switch_to")}
    </button>
  );
}
