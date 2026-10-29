package systembackupkekregistry

import (
	"context"
	"reflect"
)

// AdoptCoverage records four independently prepared original-source receipts
// under the original maintenance/admission transaction and the shared fence.
// The owner must have stopped old writers and backfilled history before
// constructing PreparedCoverage; this store provides no allow-all adapter.
// A new empty index alone never proves coverage.
func (b *Bound) AdoptCoverage(ctx context.Context, prepared PreparedCoverage) error {
	if ctx == nil || ctx.Err() != nil || b == nil || b.tx == nil || !present(prepared) || b.epoch != b.original.Epoch || prepared.ExpectedEpoch() != b.epoch {
		return ErrKEKCoverage
	}
	sources, refs := prepared.Sources(), prepared.References()
	if !validCoverageSources(sources) || refs == nil || !reflect.DeepEqual(refs, b.original.References) ||
		(len(b.original.Coverage) != 0 && !reflect.DeepEqual(sources, b.original.Coverage)) {
		return ErrKEKCoverage
	}
	now, err := b.sqlNow(ctx)
	if err != nil || !now.Before(prepared.ValidUntil()) || prepared.Recheck(ctx, b.tx, b.Snapshot(), now) != nil {
		return ErrKEKCoverage
	}
	if len(b.original.Coverage) == len(sources) {
		return nil
	}
	for _, source := range sources {
		raw, digest, err := hashJSON(source)
		if err != nil || len(raw) > 65535 {
			return ErrKEKCoverage
		}
		if _, err = b.tx.ExecContext(ctx, `INSERT INTO system_backup_v2_kek_coverage(installation_id,partition_name,source_id,source_sha256,source_json) VALUES (?,?,?,?,?)`, b.installationID, source.Partition, source.SourceID, digest, raw); err != nil {
			return err
		}
	}
	return b.advance(ctx)
}

func validCoverageSources(sources []CoverageSource) bool {
	if len(sources) != 4 {
		return false
	}
	seen := make(map[Partition]bool, 4)
	for _, source := range sources {
		if !validPartition(source.Partition) || seen[source.Partition] || source.SourceID == "" || len(source.SourceID) > 256 ||
			source.SnapshotRevision == "" || source.FenceRevision == "" || source.AdoptionSource.SourceID == "" ||
			source.AdoptionSource.RecordID == "" || source.AdoptionSource.RecordVersion == "" || !kekHash.MatchString(source.AdoptionSource.ContentSHA256) {
			return false
		}
		seen[source.Partition] = true
	}
	return true
}
