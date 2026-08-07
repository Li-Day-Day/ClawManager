package k8s

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

type InstanceResourceUsage struct {
	CPUMilli         int64
	CPULimitMilli    int64
	CPUUsagePercent  float64
	MemoryBytes      int64
	MemoryLimitBytes int64
	Timestamp        time.Time
}

type PodMetricsService struct {
	client        *Client
	metricsClient metricsclient.Interface
}

func NewPodMetricsService() *PodMetricsService {
	service := &PodMetricsService{client: globalClient}
	if globalClient == nil || globalClient.Config == nil {
		return service
	}
	client, err := metricsclient.NewForConfig(globalClient.Config)
	if err == nil {
		service.metricsClient = client
	}
	return service
}

func (s *PodMetricsService) GetInstanceUsage(ctx context.Context, userID, instanceID int) (*InstanceResourceUsage, error) {
	if s == nil || s.client == nil || s.client.Clientset == nil || s.metricsClient == nil {
		return nil, fmt.Errorf("Kubernetes Metrics API is not configured")
	}
	namespace := s.client.GetNamespace(userID)
	selector := labels.Set{"instance-id": fmt.Sprintf("%d", instanceID)}.AsSelector().String()
	pods, err := s.client.Clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		return nil, fmt.Errorf("get instance pods: %w", err)
	}
	if len(pods.Items) == 0 {
		return nil, nil
	}
	podNames := make(map[string]struct{}, len(pods.Items))
	for i := range pods.Items {
		podNames[pods.Items[i].Name] = struct{}{}
	}

	metrics, err := s.metricsClient.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("get instance metrics: %w", err)
	}

	usage := &InstanceResourceUsage{}
	matched := false
	for i := range metrics.Items {
		item := &metrics.Items[i]
		if _, ok := podNames[item.Name]; !ok {
			continue
		}
		matched = true
		if item.Timestamp.Time.After(usage.Timestamp) {
			usage.Timestamp = item.Timestamp.Time
		}
		for _, container := range item.Containers {
			usage.CPUMilli += container.Usage.Cpu().MilliValue()
			usage.MemoryBytes += container.Usage.Memory().Value()
		}
	}
	if !matched {
		return nil, nil
	}
	for i := range pods.Items {
		for _, container := range pods.Items[i].Spec.Containers {
			if cpu := container.Resources.Limits.Cpu(); cpu != nil {
				usage.CPULimitMilli += cpu.MilliValue()
			}
			if memory := container.Resources.Limits.Memory(); memory != nil {
				usage.MemoryLimitBytes += memory.Value()
			}
		}
	}
	if usage.CPULimitMilli > 0 {
		usage.CPUUsagePercent = float64(usage.CPUMilli) / float64(usage.CPULimitMilli) * 100
	}
	if usage.Timestamp.IsZero() {
		usage.Timestamp = time.Now().UTC()
	}
	return usage, nil
}
