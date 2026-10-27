import { useCallback } from 'react';
import { useI18n } from '../../../contexts/I18nContext';
import { backupLocaleTags, formatBackupDate, systemBackupTranslations } from '../../../lib/systemBackupI18n';
import type { BackupTextKey } from '../../../lib/systemBackupI18n';

export function useBackupText() {
  const { locale, t } = useI18n();
  const b = useCallback((key: BackupTextKey, variables?: Record<string, string | number>) => t(`systemBackup.${key}`, variables), [t]);
  const label = (value: string) => {
    const key = `status_${value}` as BackupTextKey;
    return Object.hasOwn(systemBackupTranslations.en, key) ? b(key) : value;
  };
  return {
    b, label,
    locale: backupLocaleTags[locale],
    date: (value: string) => formatBackupDate(value, locale),
    number: (value: number) => new Intl.NumberFormat(backupLocaleTags[locale]).format(value),
    list: (values: string[]) => new Intl.ListFormat(backupLocaleTags[locale], { style: 'long', type: 'conjunction' }).format(values),
  };
}
