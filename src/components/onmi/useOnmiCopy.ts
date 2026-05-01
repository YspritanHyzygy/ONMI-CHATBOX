import { useTranslation } from 'react-i18next';

export function useOnmiCopy() {
  const { i18n } = useTranslation();
  const isEnglish = i18n.resolvedLanguage?.startsWith('en') || i18n.language?.startsWith('en');
  return (zh: string, en: string) => (isEnglish ? en : zh);
}
