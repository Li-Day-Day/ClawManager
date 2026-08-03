package services

import (
	"context"
	"fmt"
	"log"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"clawreef/internal/repository"
)

const skillSummarySourceMaxBytes = 32 * 1024

// SkillSummaryCompleter generates skill summary markdown via platform LLM gateway.
// Defined in services to avoid an import cycle with aigateway.
type SkillSummaryCompleter interface {
	Complete(ctx context.Context, userID int, systemPrompt, userContent string) (string, error)
}

// SkillSummaryService asynchronously summarizes skills into skills.description.
type SkillSummaryService struct {
	repo      repository.SkillRepository
	storage   ObjectStorageService
	completer SkillSummaryCompleter

	inFlight sync.Map
}

func NewSkillSummaryService(repo repository.SkillRepository, storage ObjectStorageService, completer SkillSummaryCompleter) *SkillSummaryService {
	return &SkillSummaryService{repo: repo, storage: storage, completer: completer}
}

func ConfigureSkillSummary(service SkillService, summary *SkillSummaryService) {
	if impl, ok := service.(*skillService); ok {
		impl.summaryService = summary
	}
}

func (s *SkillSummaryService) Enqueue(skillID int) {
	if s == nil || skillID <= 0 {
		return
	}
	if err := s.markPending(skillID); err != nil {
		log.Printf("skill summary enqueue mark pending skill=%d: %v", skillID, err)
		return
	}
	go s.process(skillID)
}

func (s *SkillSummaryService) markPending(skillID int) error {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	if skill == nil || isDeletedSkill(skill) {
		return fmt.Errorf("skill not found")
	}
	skill.SummaryStatus = skillSummaryStatusPending
	skill.SummaryError = nil
	skill.UpdatedAt = time.Now().UTC()
	return s.repo.UpdateSkill(skill)
}

func (s *SkillSummaryService) process(skillID int) {
	if _, loaded := s.inFlight.LoadOrStore(skillID, struct{}{}); loaded {
		return
	}
	defer s.inFlight.Delete(skillID)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if err := s.generate(ctx, skillID); err != nil {
		log.Printf("skill summary generate skill=%d: %v", skillID, err)
		if markErr := s.markFailed(skillID, err); markErr != nil {
			log.Printf("skill summary mark failed skill=%d: %v", skillID, markErr)
		}
	}
}

func (s *SkillSummaryService) generate(ctx context.Context, skillID int) error {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	if skill == nil || isDeletedSkill(skill) {
		return fmt.Errorf("skill not found")
	}
	skill.SummaryStatus = skillSummaryStatusGenerating
	skill.SummaryError = nil
	skill.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateSkill(skill); err != nil {
		return err
	}

	if s.completer == nil {
		return fmt.Errorf("skill_summary_llm_not_configured")
	}
	if s.storage == nil {
		return fmt.Errorf("skill_storage_not_configured")
	}
	if skill.CurrentVersionID == nil {
		return fmt.Errorf("skill_package_pending")
	}
	version, err := s.repo.GetVersionByID(*skill.CurrentVersionID)
	if err != nil {
		return err
	}
	if version == nil {
		return fmt.Errorf("skill_package_pending")
	}
	blob, err := s.repo.GetBlobByID(version.BlobID)
	if err != nil {
		return err
	}
	if blob == nil || strings.TrimSpace(blob.ObjectKey) == "" {
		return fmt.Errorf("skill_package_pending")
	}
	archive, err := s.storage.GetObject(ctx, blob.ObjectKey)
	if err != nil {
		return fmt.Errorf("failed to load skill package: %w", err)
	}
	source, err := collectSkillSummarySource(blob.FileName, archive)
	if err != nil {
		return err
	}

	markdown, err := s.completer.Complete(ctx, skill.UserID, skillSummaryTemplatePrompt(), source)
	if err != nil {
		return err
	}
	markdown = stripSkillSummaryMarkdownFence(markdown)
	if err := validateSkillSummaryMarkdown(markdown); err != nil {
		return err
	}

	skill, err = s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	if skill == nil || isDeletedSkill(skill) {
		return fmt.Errorf("skill not found")
	}
	desc := markdown
	skill.Description = &desc
	skill.SummaryStatus = skillSummaryStatusReady
	skill.SummaryError = nil
	skill.UpdatedAt = time.Now().UTC()
	return s.repo.UpdateSkill(skill)
}

func (s *SkillSummaryService) markFailed(skillID int, generateErr error) error {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	if skill == nil {
		return nil
	}
	msg := truncateSkillSummaryError(generateErr)
	skill.SummaryStatus = skillSummaryStatusFailed
	skill.SummaryError = &msg
	skill.UpdatedAt = time.Now().UTC()
	return s.repo.UpdateSkill(skill)
}

func collectSkillSummarySource(filename string, archive []byte) (string, error) {
	dirs, err := extractSkillDirectories(filename, archive)
	if err != nil {
		return "", err
	}
	if len(dirs) == 0 {
		return "", fmt.Errorf("skill package has no skill directory")
	}
	dir := dirs[0]
	skillMD, ok := findSkillManifestContent(dir.Files)
	if !ok || strings.TrimSpace(skillMD) == "" {
		return "", fmt.Errorf("SKILL.md not found")
	}

	var builder strings.Builder
	builder.WriteString("# SKILL.md\n")
	builder.WriteString(skillMD)
	builder.WriteString("\n")

	names := make([]string, 0)
	for name := range dir.Files {
		clean := normalizeArchiveEntryPath(name)
		if clean == "" || strings.EqualFold(path.Base(clean), "SKILL.md") {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(clean), ".md") {
			continue
		}
		names = append(names, clean)
	}
	sort.Strings(names)
	for _, name := range names {
		if builder.Len() >= skillSummarySourceMaxBytes {
			break
		}
		content := strings.TrimSpace(string(dir.Files[name]))
		if content == "" {
			continue
		}
		remaining := skillSummarySourceMaxBytes - builder.Len()
		chunk := content
		if len(chunk) > remaining {
			chunk = chunk[:remaining]
		}
		builder.WriteString("\n# ")
		builder.WriteString(name)
		builder.WriteString("\n")
		builder.WriteString(chunk)
		builder.WriteString("\n")
	}
	return builder.String(), nil
}

func findSkillManifestContent(files map[string][]byte) (string, bool) {
	for name, content := range files {
		if strings.EqualFold(path.Base(normalizeArchiveEntryPath(name)), "SKILL.md") {
			return string(content), true
		}
	}
	return "", false
}
