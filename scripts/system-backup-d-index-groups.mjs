export const indexGroupPlan = [
  { round: 1, variant: 'page' }, { round: 1, variant: 'status' }, { round: 1, variant: 'all' },
  { round: 2, variant: 'all' }, { round: 2, variant: 'status' }, { round: 2, variant: 'page' },
];

export function buildIndexVariantDDL(variant) {
  if (!['all', 'page', 'status'].includes(variant)) throw new Error('Unknown index variant');
  const rows = [
    ['system_backups', 'idx_sb_backup'], ['system_restore_drills', 'idx_sb_drill'],
    ['system_backup_preflights', 'idx_sb_preflight'], ['system_backup_artifact_verifications', 'idx_sb_verify'],
    ['system_backup_operations', 'idx_sb_operation'],
  ];
  return rows.flatMap(([table, prefix]) => {
    const indexes = [];
    if (variant !== 'status') indexes.push(`ADD INDEX ${prefix}_admin_page (origin_installation_id, id)`);
    if (variant !== 'page' && table !== 'system_backup_operations') indexes.push(`ADD INDEX ${prefix}_admin_status_page (origin_installation_id, status, id)`);
    return indexes.length ? [`ALTER TABLE ${table} ${indexes.join(', ')};`] : [];
  }).join('\n') + '\n';
}

export const normalizeIndexDDL = text => text.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join(' ').trim().split(/\s+/).join(' ');
