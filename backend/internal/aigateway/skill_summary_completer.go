package aigateway

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"clawreef/internal/repository"
	"clawreef/internal/services"
)

type skillSummaryCompleter struct {
	gateway   Service
	modelRepo repository.LLMModelRepository
}

// NewSkillSummaryCompleter adapts the AI gateway for skill summary generation.
func NewSkillSummaryCompleter(gateway Service, modelRepo repository.LLMModelRepository) services.SkillSummaryCompleter {
	return &skillSummaryCompleter{gateway: gateway, modelRepo: modelRepo}
}

func (c *skillSummaryCompleter) Complete(ctx context.Context, userID int, systemPrompt, userContent string) (string, error) {
	if c == nil || c.gateway == nil || c.modelRepo == nil {
		return "", fmt.Errorf("skill_summary_llm_not_configured")
	}
	models, err := c.modelRepo.ListActive()
	if err != nil {
		return "", err
	}
	if len(models) == 0 {
		return "", fmt.Errorf("no_active_llm_model")
	}
	modelName := strings.TrimSpace(models[0].DisplayName)
	if modelName == "" {
		return "", fmt.Errorf("no_active_llm_model")
	}

	resp, _, err := c.gateway.ChatCompletions(ctx, userID, ChatCompletionRequest{
		Model: modelName,
		Messages: []ChatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
	})
	if err != nil {
		return "", err
	}
	if resp == nil {
		return "", fmt.Errorf("empty_llm_response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := strings.TrimSpace(string(resp.Body))
		if len(snippet) > 240 {
			snippet = snippet[:240]
		}
		if snippet == "" {
			snippet = "empty body"
		}
		return "", fmt.Errorf("llm_http_%d: %s", resp.StatusCode, snippet)
	}

	var parsed ChatCompletionResponse
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		return "", fmt.Errorf("invalid_llm_response: %w", err)
	}
	content := strings.TrimSpace(extractAssistantContent(parsed))
	if content == "" {
		return "", fmt.Errorf("empty_llm_content")
	}
	return content, nil
}
