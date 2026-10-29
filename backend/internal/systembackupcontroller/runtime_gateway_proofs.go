package systembackupcontroller

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"clawreef/internal/services"
	"clawreef/internal/systembackup/flow"
	b "clawreef/internal/systembackup/publicadapter"
	d "clawreef/internal/systembackupdispatch"
)

func gatewayOperationID(a d.Authority, id string) string {
	raw, _ := json.Marshal([]string{"isolated-backup.v1", a.InstallationID, a.TaskPublicID, strconv.FormatUint(a.AttemptNo, 10), id})
	return recordHash(raw)[:32]
}

func gatewayBackupRequest(a d.Authority, spec b.RuntimeWriterSpec) (services.RuntimeBackupRequest, error) {
	req := services.RuntimeBackupRequest{Protocol: spec.Backup.Protocol, Namespace: spec.RuntimeNamespace(), PodUID: spec.UID, AgentEpoch: spec.Runtime.AgentEpoch, OperationID: spec.Backup.OperationID, RuntimeType: spec.Source.Type,
		InstanceID: spec.Source.ID, UserID: spec.Source.UserID, Generation: spec.Source.Generation, GatewayID: fmt.Sprintf("gw-%d-%d", spec.Source.ID, spec.Source.Generation), GatewayPort: spec.Port, ExpectedPID: spec.Runtime.GatewayPID, ResumeGeneration: spec.ResumeGeneration, RestartSHA256: spec.Backup.RestartSHA256}
	if spec.Kind != "gateway" || spec.Runtime.Version != "runtime-locator.v2" || !req.Valid() || req.OperationID != gatewayOperationID(a, runtimeWriterID(spec)) {
		return req, ErrExecutionRecord
	}
	return req, nil
}

func gatewayRequestHash(req services.RuntimeBackupRequest) string {
	raw, _ := json.Marshal(req)
	return recordHash(raw)
}

func readGatewayProof(ctx context.Context, tx *sql.Tx, a d.Authority, id string, req services.RuntimeBackupRequest, kind string) (services.RuntimeBackupObservation, error) {
	var out services.RuntimeBackupObservation
	var requestHash, bodyHash string
	if kind != "stopped" && kind != "resumed" {
		return out, ErrExecutionRecord
	}
	err := tx.QueryRowContext(ctx, `SELECT request_sha256,body_sha256,body_raw FROM system_backup_v2_gateway_proofs WHERE task_public_id=? AND attempt_no=? AND writer_id=? AND proof_kind=? FOR SHARE`, a.TaskPublicID, a.AttemptNo, id, kind).Scan(&requestHash, &bodyHash, &out.Raw)
	if err != nil {
		return out, err
	}
	if requestHash != gatewayRequestHash(req) || recordHash(out.Raw) != bodyHash || len(out.Raw) > 65536 || json.Unmarshal(out.Raw, &out.Receipt) != nil || !services.ValidateRuntimeBackupReceipt(req, out.Receipt) || out.Receipt.State != kind {
		return services.RuntimeBackupObservation{}, ErrExecutionRecord
	}
	return out, nil
}

func saveGatewayProof(ctx context.Context, tx *sql.Tx, a d.Authority, id string, row runtimeControlRow, req services.RuntimeBackupRequest, proof services.RuntimeBackupObservation) error {
	if proof.Pending || len(proof.Raw) < 2 || len(proof.Raw) > 65536 || !services.ValidateRuntimeBackupReceipt(req, proof.Receipt) {
		return ErrExecutionRecord
	}
	var actual services.RuntimeBackupReceipt
	if json.Unmarshal(proof.Raw, &actual) != nil || actual != proof.Receipt {
		return ErrExecutionRecord
	}
	old, err := readGatewayProof(ctx, tx, a, id, req, proof.Receipt.State)
	if err == nil {
		if !bytes.Equal(old.Raw, proof.Raw) {
			return ErrExecutionRecord
		}
	} else if errors.Is(err, sql.ErrNoRows) {
		_, err = tx.ExecContext(ctx, `INSERT INTO system_backup_v2_gateway_proofs (task_public_id,attempt_no,writer_id,proof_kind,request_sha256,body_sha256,body_raw) VALUES (?,?,?,?,?,?,?)`, a.TaskPublicID, a.AttemptNo, id, proof.Receipt.State, gatewayRequestHash(req), recordHash(proof.Raw), proof.Raw)
		if err != nil {
			return err
		}
	} else {
		return err
	}
	if proof.Receipt.State == "stopped" {
		digest := recordHash(proof.Raw)
		if row.Stopped.Valid {
			if row.Stopped.String != digest {
				return ErrExecutionRecord
			}
			return nil
		}
		result, err := tx.ExecContext(ctx, `UPDATE system_backup_v2_runtime_controls SET stopped_sha256=?,row_version=row_version+1 WHERE task_public_id=? AND attempt_no=? AND writer_id=? AND row_version=? AND stopped_sha256 IS NULL`, digest, a.TaskPublicID, a.AttemptNo, id, row.Version)
		if err != nil {
			return err
		}
		ok, err := exactlyOneRow(result)
		if err != nil || !ok {
			return ErrExecutionRecord
		}
	}
	return nil
}

// GatewayControl is D's production callback, not a B control-SQL escape hatch.
// Each operation uses the original authority transaction and its final recheck;
// raw Agent receipts are only committed if that same authorization is current.
func (o *SQLRuntimeControl) GatewayControl(ctx context.Context, a d.Authority, id, point string, s flow.State) (bool, error) {
	recovery, err := runtimeRecoveryPoint(point)
	if err != nil {
		return false, err
	}
	agent, ok := o.cfg.Agent.(services.RuntimeAgentBackupClient)
	if !ok {
		return false, ErrExecutionRecord
	}
	var restart *services.RuntimeAgentCreateGatewayRequest
	if point == "restart-dispatched" {
		// Decryption uses separately rechecked original custody, before holding
		// the mutation transaction's row locks. The payload is re-bound below.
		var spec b.RuntimeWriterSpec
		if err = o.transaction(ctx, a, true, func(tx *sql.Tx) error { r, e := readRuntimeControl(ctx, tx, a, id); spec = r.Spec; return e }); err != nil {
			return false, err
		}
		raw, e := o.load(ctx, a, id, spec.RestartRef)
		if e != nil {
			return false, e
		}
		defer clear(raw)
		var value services.RuntimeAgentCreateGatewayRequest
		if json.Unmarshal(raw, &value) != nil {
			return false, ErrExecutionRecord
		}
		restart = &value
	}
	ready := false
	err = o.transaction(ctx, a, recovery, func(tx *sql.Tx) error {
		if e := originalRuntimeState(ctx, tx, a, id, s); e != nil {
			return e
		}
		r, e := readRuntimeControl(ctx, tx, a, id)
		if e != nil {
			return e
		}
		if !runtimeStateMatches(r.Spec, s, point) {
			return ErrExecutionRecord
		}
		req, e := gatewayBackupRequest(a, r.Spec)
		if e != nil {
			return e
		}
		current, e := sourceRow(ctx, tx, r.Spec.Source.ID)
		want := r.Spec.Source
		if r.Completed {
			want.Generation = r.Spec.ResumeGeneration
		}
		if e != nil || current != want {
			return ErrExecutionRecord
		}
		if e = o.gatewayBinding(ctx, tx, r.Spec, r.Completed); e != nil {
			return e
		}
		action := ""
		switch point {
		case "before-stop":
			if r.Claimed || r.Completed {
				return ErrExecutionRecord
			}
			action = "stop"
		case "check-stopped", "recovery-check-stopped":
			action = "state"
		case "recovery-stop-old":
			if r.Claimed {
				proof, e := readGatewayProof(ctx, tx, a, id, req, "stopped")
				if e != nil || !r.Stopped.Valid || recordHash(proof.Raw) != r.Stopped.String {
					return ErrExecutionRecoveryRequired
				}
				ready = true
				return nil
			}
			action = "stop"
		case "restart-dispatched":
			if !r.Claimed || r.Completed || restart == nil {
				return ErrExecutionRecord
			}
			hash, e := services.RuntimeBackupRestartDigest(*restart)
			material, e2 := json.Marshal(restart)
			defer clear(material)
			if e != nil || e2 != nil || hash != req.RestartSHA256 || recordHash(material) != r.Digest {
				return ErrExecutionRecord
			}
			if _, e = readGatewayProof(ctx, tx, a, id, req, "stopped"); e != nil {
				return e
			}
			action = "resume"
		case "check-resumed":
			if !r.Claimed {
				return ErrExecutionRecoveryRequired
			}
			action = "state"
		case "release-restart":
			if !r.Completed {
				return ErrExecutionRecoveryRequired
			}
			action = "complete"
		default:
			return ErrExecutionAuthority
		}
		proof, e := agent.BackupControl(ctx, r.Spec.Endpoint, action, req, restart)
		if e != nil {
			return e
		}
		if proof.Pending {
			if point != "restart-dispatched" && point != "check-resumed" {
				return ErrExecutionRecoveryRequired
			}
			return nil
		}
		wantState := "stopped"
		if point == "restart-dispatched" || point == "check-resumed" || point == "release-restart" {
			wantState = "resumed"
		}
		if proof.Receipt.State != wantState {
			if point == "check-resumed" && proof.Receipt.State == "stopped" {
				return nil
			}
			return ErrExecutionRecoveryRequired
		}
		if r.Completed {
			binding, e := readGatewayBinding(ctx, tx, r.Spec.Source.ID, true)
			if e != nil || binding.PID != proof.Receipt.PID {
				return ErrExecutionRecord
			}
		}
		if e = saveGatewayProof(ctx, tx, a, id, r, req, proof); e != nil {
			return e
		}
		ready = true
		return nil
	})
	return ready && err == nil, err
}
