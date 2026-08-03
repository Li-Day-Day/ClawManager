const HEADINGS = {
  intro: '## 简介',
  features: '## 主要功能',
  trigger: '## 如何触发',
  output: '## 产出',
} as const;

const IMPORTED_FROM = /^imported from\b/i;

export type SkillDescriptionSections = {
  intro: string;
  features: string;
  trigger: string;
  output: string;
};

export function isPlaceholderSkillDescription(description?: string | null): boolean {
  const trimmed = (description || '').trim();
  if (!trimmed) return true;
  return IMPORTED_FROM.test(trimmed);
}

export function parseSkillDescriptionSections(markdown?: string | null): SkillDescriptionSections {
  const text = (markdown || '').replace(/\r\n/g, '\n').trim();
  const empty: SkillDescriptionSections = { intro: '', features: '', trigger: '', output: '' };
  if (!text || isPlaceholderSkillDescription(text)) {
    return empty;
  }

  const markers = [
    { key: 'intro' as const, heading: HEADINGS.intro },
    { key: 'features' as const, heading: HEADINGS.features },
    { key: 'trigger' as const, heading: HEADINGS.trigger },
    { key: 'output' as const, heading: HEADINGS.output },
  ];

  const result = { ...empty };
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const start = text.indexOf(current.heading);
    if (start < 0) continue;
    const bodyStart = start + current.heading.length;
    let end = text.length;
    for (let j = i + 1; j < markers.length; j += 1) {
      const next = text.indexOf(markers[j].heading, bodyStart);
      if (next >= 0) {
        end = next;
        break;
      }
    }
    result[current.key] = text.slice(bodyStart, end).trim();
  }
  return result;
}

export function shortSkillSummary(markdown?: string | null, maxRunes = 20): string {
  if (isPlaceholderSkillDescription(markdown)) {
    return '';
  }
  const sections = parseSkillDescriptionSections(markdown);
  let summary = (sections.intro || markdown || '').replace(/\n/g, ' ').trim();
  summary = summary.split(/\s+/).filter(Boolean).join(' ');
  if (!summary) return '';
  const runes = Array.from(summary);
  if (runes.length <= maxRunes) return summary;
  return `${runes.slice(0, maxRunes).join('')}…`;
}
