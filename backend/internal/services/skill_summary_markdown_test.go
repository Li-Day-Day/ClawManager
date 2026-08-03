package services

import "testing"

func TestValidateSkillSummaryMarkdown(t *testing.T) {
	valid := `## 简介
生成演示文稿

## 主要功能
- 大纲
- 幻灯片

## 如何触发
对助手说做 PPT

## 产出
PPT 文件
`
	if err := validateSkillSummaryMarkdown(valid); err != nil {
		t.Fatalf("validateSkillSummaryMarkdown() error = %v", err)
	}
	if err := validateSkillSummaryMarkdown("## 简介\nonly"); err == nil {
		t.Fatal("expected missing headings error")
	}
}

func TestShortSkillSummaryFromDescription(t *testing.T) {
	markdown := `## 简介
这是一段超过二十个汉字的简介内容用于截断测试验证

## 主要功能
- a

## 如何触发
b

## 产出
c
`
	got := shortSkillSummaryFromDescription(markdown, 20)
	runes := []rune(got)
	if len(runes) != 21 || !stringsHasSuffixEllipsis(got) {
		t.Fatalf("shortSkillSummaryFromDescription() = %q", got)
	}
	if shortSkillSummaryFromDescription("Imported from foo.zip", 20) != "" {
		t.Fatal("placeholder description should be treated as empty")
	}
}

func stringsHasSuffixEllipsis(value string) bool {
	runes := []rune(value)
	return len(runes) > 0 && runes[len(runes)-1] == '…'
}

func TestStripSkillSummaryMarkdownFence(t *testing.T) {
	input := "```markdown\n## 简介\nx\n```"
	got := stripSkillSummaryMarkdownFence(input)
	if got != "## 简介\nx" {
		t.Fatalf("stripSkillSummaryMarkdownFence() = %q", got)
	}
}
