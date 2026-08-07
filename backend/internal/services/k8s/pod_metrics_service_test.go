package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsfake "k8s.io/metrics/pkg/client/clientset/versioned/fake"
)

func TestPodMetricsServiceAggregatesUsageAndLimits(t *testing.T) {
	namespace := "clawreef-user-7"
	labels := map[string]string{"instance-id": "123"}
	coreClient := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "instance-pod", Namespace: namespace, Labels: labels},
		Spec: corev1.PodSpec{Containers: []corev1.Container{{
			Name: "desktop",
			Resources: corev1.ResourceRequirements{Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("6"),
				corev1.ResourceMemory: resource.MustParse("12Gi"),
			}},
		}}},
	})
	podMetrics := metricsv1beta1.PodMetrics{
		ObjectMeta: metav1.ObjectMeta{Name: "instance-pod", Namespace: namespace, Labels: labels},
		Timestamp:  metav1.NewTime(time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)),
		Containers: []metricsv1beta1.ContainerMetrics{{
			Name: "desktop",
			Usage: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("1500m"),
				corev1.ResourceMemory: resource.MustParse("6Gi"),
			},
		}},
	}
	metricsClient := metricsfake.NewSimpleClientset()
	metricsClient.Fake.PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, &metricsv1beta1.PodMetricsList{Items: []metricsv1beta1.PodMetrics{podMetrics}}, nil
	})
	service := &PodMetricsService{
		client:        &Client{Clientset: coreClient, Namespace: "clawreef"},
		metricsClient: metricsClient,
	}

	usage, err := service.GetInstanceUsage(context.Background(), 7, 123)
	if err != nil {
		t.Fatalf("GetInstanceUsage returned error: %v", err)
	}
	if usage.CPUMilli != 1500 || usage.CPULimitMilli != 6000 || usage.CPUUsagePercent != 25 {
		t.Fatalf("unexpected CPU usage: %#v", usage)
	}
	if usage.MemoryBytes != 6<<30 || usage.MemoryLimitBytes != 12<<30 {
		t.Fatalf("unexpected memory usage: %#v", usage)
	}
}
