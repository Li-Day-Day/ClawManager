package services

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"clawreef/internal/models"
)

type summaryTestCompleter struct {
	mu       sync.Mutex
	response string
	err      error
}

func (c *summaryTestCompleter) Complete(context.Context, int, string, string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.err != nil {
		return "", c.err
	}
	return c.response, nil
}

type summaryTestStorage struct {
	objects map[string][]byte
}

func (s summaryTestStorage) PutObject(context.Context, string, []byte, string) error { return nil }
func (s summaryTestStorage) GetObject(_ context.Context, objectKey string) ([]byte, error) {
	content, ok := s.objects[objectKey]
	if !ok {
		return nil, fmt.Errorf("missing object")
	}
	return content, nil
}

func zipWithSkillMD(t *testing.T, body string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create("demo/SKILL.md")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := f.Write([]byte(body)); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	return buf.Bytes()
}

func TestSkillSummaryServiceGenerateSuccess(t *testing.T) {
	versionID := 11
	blobID := 21
	repo := &skillRepoStub{
		skills: map[int]*models.Skill{
			1: {
				ID: 1, UserID: 7, SkillKey: "demo", Name: "demo", Status: "active",
				CurrentVersionID: &versionID, SummaryStatus: skillSummaryStatusIdle,
			},
		},
		versions: map[int]*models.SkillVersion{
			versionID: {ID: versionID, SkillID: 1, BlobID: blobID, VersionNo: 1},
		},
		blobs: map[int]*models.SkillBlob{
			blobID: {ID: blobID, ObjectKey: "obj/demo.zip", FileName: "demo.zip"},
		},
	}
	archive := zipWithSkillMD(t, "# Demo\nA skill for demos\n")
	completer := &summaryTestCompleter{response: `## 简介
演示助手

## 主要功能
- 演示

## 如何触发
说演示

## 产出
演示结果
`}
	svc := NewSkillSummaryService(repo, summaryTestStorage{objects: map[string][]byte{"obj/demo.zip": archive}}, completer)
	svc.Enqueue(1)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		skill, _ := repo.GetSkillByID(1)
		if skill != nil && skill.SummaryStatus == skillSummaryStatusReady {
			if skill.Description == nil || !strings.Contains(*skill.Description, "## 简介") {
				t.Fatalf("description = %#v", skill.Description)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	skill, _ := repo.GetSkillByID(1)
	t.Fatalf("timed out, status=%s error=%v", skill.SummaryStatus, skill.SummaryError)
}

func TestSkillSummaryServiceGenerateFailureKeepsDescription(t *testing.T) {
	versionID := 11
	blobID := 21
	existing := "keep me"
	repo := &skillRepoStub{
		skills: map[int]*models.Skill{
			1: {
				ID: 1, UserID: 7, SkillKey: "demo", Name: "demo", Status: "active",
				Description: &existing, CurrentVersionID: &versionID, SummaryStatus: skillSummaryStatusIdle,
			},
		},
		versions: map[int]*models.SkillVersion{
			versionID: {ID: versionID, SkillID: 1, BlobID: blobID, VersionNo: 1},
		},
		blobs: map[int]*models.SkillBlob{
			blobID: {ID: blobID, ObjectKey: "obj/demo.zip", FileName: "demo.zip"},
		},
	}
	archive := zipWithSkillMD(t, "# Demo\n")
	completer := &summaryTestCompleter{err: fmt.Errorf("no_active_llm_model")}
	svc := NewSkillSummaryService(repo, summaryTestStorage{objects: map[string][]byte{"obj/demo.zip": archive}}, completer)
	svc.Enqueue(1)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		skill, _ := repo.GetSkillByID(1)
		if skill != nil && skill.SummaryStatus == skillSummaryStatusFailed {
			if skill.Description == nil || *skill.Description != existing {
				t.Fatalf("description changed: %#v", skill.Description)
			}
			if skill.SummaryError == nil || !strings.Contains(*skill.SummaryError, "no_active_llm_model") {
				t.Fatalf("summary_error = %#v", skill.SummaryError)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("timed out waiting for failed status")
}

func TestCollectSkillSummarySource(t *testing.T) {
	archive := zipWithSkillMD(t, "# Title\nbody\n")
	source, err := collectSkillSummarySource("demo.zip", archive)
	if err != nil {
		t.Fatalf("collectSkillSummarySource() error = %v", err)
	}
	if !strings.Contains(source, "SKILL.md") || !strings.Contains(source, "body") {
		t.Fatalf("source = %q", source)
	}
}
