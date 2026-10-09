package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDeleteAllPVsPreservesOtherInstallationsWithSameInstanceID(t *testing.T) {
	targetNamespace := "clawmanager-zhanghui08-system-user-1"
	foreignNamespace := "clawmanager-ltt-user-1"
	target := instancePVForCleanupTest("target-pv", targetNamespace, "1", true)
	foreign := instancePVForCleanupTest("foreign-pv", foreignNamespace, "1", true)
	wrongUser := instancePVForCleanupTest("wrong-user-pv", targetNamespace, "2", true)
	noClaim := instancePVForCleanupTest("no-claim-pv", "", "1", false)

	clientset := fake.NewSimpleClientset(target, foreign, wrongUser, noClaim)
	service := &CleanupService{client: &Client{
		Clientset: clientset,
		Namespace: "clawmanager-zhanghui08-system",
	}}
	if owned, reason := service.ownsInstancePV(target, targetNamespace, 1, 6); !owned {
		t.Fatalf("target PV ownership should be proven: %s", reason)
	}
	if owned, _ := service.ownsInstancePV(foreign, targetNamespace, 1, 6); owned {
		t.Fatal("foreign installation PV ownership must not be accepted")
	}

	if err := service.deleteAllPVs(context.Background(), 1, 6); err != nil {
		t.Fatalf("deleteAllPVs returned error: %v", err)
	}
	if _, err := clientset.CoreV1().PersistentVolumes().Get(context.Background(), target.Name, metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("target PV should be deleted, got err=%v", err)
	}
	for _, name := range []string{foreign.Name, wrongUser.Name, noClaim.Name} {
		if _, err := clientset.CoreV1().PersistentVolumes().Get(context.Background(), name, metav1.GetOptions{}); err != nil {
			t.Fatalf("PV %s must be preserved: %v", name, err)
		}
	}
}

func TestTenantUserIDFromNamespaceRejectsOtherInstallation(t *testing.T) {
	service := &CleanupService{client: &Client{Namespace: "clawmanager-zhanghui08-system"}}
	if userID, ok := service.tenantUserIDFromNamespace("clawmanager-zhanghui08-system-user-17"); !ok || userID != 17 {
		t.Fatalf("expected owned namespace user 17, got userID=%d ok=%v", userID, ok)
	}
	for _, namespace := range []string{
		"clawmanager-ltt-user-17",
		"clawmanager-zhanghui08-system-user-0",
		"clawmanager-zhanghui08-system-user-not-a-number",
	} {
		if userID, ok := service.tenantUserIDFromNamespace(namespace); ok {
			t.Fatalf("namespace %s must be rejected, got userID=%d", namespace, userID)
		}
	}
}

func instancePVForCleanupTest(name, claimNamespace, userID string, withClaim bool) *corev1.PersistentVolume {
	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name: name,
			Labels: map[string]string{
				"managed-by":  "clawreef",
				"instance-id": "6",
				"user-id":     userID,
			},
		},
	}
	if withClaim {
		pv.Spec.ClaimRef = &corev1.ObjectReference{
			Namespace: claimNamespace,
			Name:      "clawreef-6-pvc",
		}
	}
	return pv
}
