package services

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	skillSummaryStatusIdle       = "idle"
	skillSummaryStatusPending    = "pending"
	skillSummaryStatusGenerating = "generating"
	skillSummaryStatusReady      = "ready"
	skillSummaryStatusFailed     = "failed"

	skillSummaryMaxRunes = 20

	skillSummaryHeadingIntro    = "## 简介"
	skillSummaryHeadingFeatures = "## 主要功能"
	skillSummaryHeadingTrigger  = "## 如何触发"
	skillSummaryHeadingOutput   = "## 产出"
)

var skillSummaryRequiredHeadings = []string{
	skillSummaryHeadingIntro,
	skillSummaryHeadingFeatures,
	skillSummaryHeadingTrigger,
	skillSummaryHeadingOutput,
}

var importedFromDescriptionPattern = regexp.MustCompile(`(?i)^imported from\b`)

type SkillDescriptionSections struct {
	Intro    string
	Features string
	Trigger  string
	Output   string
}

func skillSummaryTemplatePrompt() string {
	return strings.Join([]string{
		"你是 Skill 文档助手。根据提供的 SKILL.md（及少量相关文档）生成中文 Markdown，且必须且只能包含以下四个二级标题，顺序固定：",
		skillSummaryHeadingIntro,
		skillSummaryHeadingFeatures,
		skillSummaryHeadingTrigger,
		skillSummaryHeadingOutput,
		"",
		"要求：",
		"1. 「简介」用一句话说明 skill 做什么，尽量不超过 20 个汉字。",
		"2. 「主要功能」用简短列表概括能力。",
		"3. 「如何触发」说明用户如何唤起/使用。",
		"4. 「产出」说明典型输出结果。",
		"5. 不要输出标题之外的前言或结语，不要使用代码围栏包裹全文。",
	}, "\n")
}

func validateSkillSummaryMarkdown(markdown string) error {
	text := strings.ReplaceAll(strings.TrimSpace(markdown), "\r\n", "\n")
	if text == "" {
		return errSkillSummaryInvalidMarkdown("empty markdown")
	}
	for _, heading := range skillSummaryRequiredHeadings {
		if !strings.Contains(text, heading) {
			return errSkillSummaryInvalidMarkdown("missing heading " + heading)
		}
	}
	// Ensure heading order.
	prev := -1
	for _, heading := range skillSummaryRequiredHeadings {
		idx := strings.Index(text, heading)
		if idx < prev {
			return errSkillSummaryInvalidMarkdown("heading order invalid")
		}
		prev = idx
	}
	return nil
}

type skillSummaryMarkdownError string

func (e skillSummaryMarkdownError) Error() string { return string(e) }

func errSkillSummaryInvalidMarkdown(reason string) error {
	return skillSummaryMarkdownError("invalid skill summary markdown: " + reason)
}

func parseSkillDescriptionSections(markdown string) SkillDescriptionSections {
	text := strings.ReplaceAll(strings.TrimSpace(markdown), "\r\n", "\n")
	sections := SkillDescriptionSections{}
	if text == "" {
		return sections
	}
	type marker struct {
		heading string
		assign  *string
	}
	markers := []marker{
		{skillSummaryHeadingIntro, &sections.Intro},
		{skillSummaryHeadingFeatures, &sections.Features},
		{skillSummaryHeadingTrigger, &sections.Trigger},
		{skillSummaryHeadingOutput, &sections.Output},
	}
	for i, current := range markers {
		start := strings.Index(text, current.heading)
		if start < 0 {
			continue
		}
		bodyStart := start + len(current.heading)
		end := len(text)
		for j := i + 1; j < len(markers); j++ {
			if next := strings.Index(text[bodyStart:], markers[j].heading); next >= 0 {
				end = bodyStart + next
				break
			}
		}
		*current.assign = strings.TrimSpace(text[bodyStart:end])
	}
	return sections
}

func shortSkillSummaryFromDescription(markdown string, maxRunes int) string {
	if maxRunes <= 0 {
		maxRunes = skillSummaryMaxRunes
	}
	if importedFromDescriptionPattern.MatchString(strings.TrimSpace(markdown)) {
		return ""
	}
	sections := parseSkillDescriptionSections(markdown)
	summary := strings.TrimSpace(sections.Intro)
	if summary == "" {
		summary = strings.TrimSpace(markdown)
	}
	summary = strings.ReplaceAll(summary, "\n", " ")
	summary = strings.Join(strings.Fields(summary), " ")
	if summary == "" {
		return ""
	}
	if utf8.RuneCountInString(summary) <= maxRunes {
		return summary
	}
	runes := []rune(summary)
	return string(runes[:maxRunes]) + "…"
}

func isPlaceholderSkillDescription(description *string) bool {
	if description == nil {
		return true
	}
	trimmed := strings.TrimSpace(*description)
	if trimmed == "" {
		return true
	}
	return importedFromDescriptionPattern.MatchString(trimmed)
}

func normalizeSkillSummaryStatus(status string) string {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case skillSummaryStatusPending:
		return skillSummaryStatusPending
	case skillSummaryStatusGenerating:
		return skillSummaryStatusGenerating
	case skillSummaryStatusReady:
		return skillSummaryStatusReady
	case skillSummaryStatusFailed:
		return skillSummaryStatusFailed
	default:
		return skillSummaryStatusIdle
	}
}

func stripSkillSummaryMarkdownFence(markdown string) string {
	text := strings.TrimSpace(markdown)
	if !strings.HasPrefix(text, "```") {
		return text
	}
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	if len(lines) < 2 {
		return text
	}
	end := len(lines)
	if strings.HasPrefix(strings.TrimSpace(lines[end-1]), "```") {
		end--
	}
	return strings.TrimSpace(strings.Join(lines[1:end], "\n"))
}

func truncateSkillSummaryError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	if msg == "" {
		return "unknown_error"
	}
	const maxRunes = 500
	if utf8.RuneCountInString(msg) <= maxRunes {
		return msg
	}
	return string([]rune(msg)[:maxRunes])
}
