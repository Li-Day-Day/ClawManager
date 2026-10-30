package publicadapter

import (
	"context"

	"clawreef/internal/systembackup/flow"
	d "clawreef/internal/systembackupdispatch"
)

type WriterBuilder func(context.Context, d.Input, SourceInventory, []FrozenWriter) ([]flow.Writer, error)

// PlatformWriterGroup declares the original signed platform writer IDs and
// actual D/C constructors. It must retain physical stop/exit/resume proofs.
// Gate-only participant probes are not a substitute for this group.
type PlatformWriterGroup struct {
	IDs   []string
	Build WriterBuilder
}

// ComposeRuntimeWriters preserves platform writers when enabling D's real SQL
// runtime factory. It splits ORIGINAL frozen IDs, never filters instances out
// of the source inventory, opens SQL itself, or invokes Observe/Pause/Resume.
func ComposeRuntimeWriters(runtime WriterBuilder, platform PlatformWriterGroup) (WriterBuilder, error) {
	if runtime == nil || platform.Build == nil || len(platform.IDs) == 0 || len(platform.IDs) > 10000 {
		return nil, d.ErrNotReady
	}
	ids := map[string]bool{}
	for _, id := range platform.IDs {
		if id == "" || len(id) > 256 || ids[id] {
			return nil, d.ErrNotReady
		}
		ids[id] = true
	}
	return func(ctx context.Context, in d.Input, source SourceInventory, frozen []FrozenWriter) ([]flow.Writer, error) {
		if nilValue(ctx) {
			return nil, d.ErrNotReady
		}
		if ctx.Err() != nil {
			return nil, classify(ctx.Err())
		}
		var runtimeFrozen, platformFrozen []FrozenWriter
		if frozen != nil {
			runtimeFrozen, platformFrozen = []FrozenWriter{}, []FrozenWriter{}
			seen := map[string]bool{}
			for _, writer := range frozen {
				if writer.ID == "" || seen[writer.ID] {
					return nil, d.ErrNotReady
				}
				seen[writer.ID] = true
				if ids[writer.ID] {
					platformFrozen = append(platformFrozen, writer)
				} else {
					runtimeFrozen = append(runtimeFrozen, writer)
				}
			}
			if len(platformFrozen) != len(ids) {
				return nil, d.ErrNotReady
			}
		}
		physical, err := platform.Build(ctx, cloneInput(in), cloneSourceInventory(source), platformFrozen)
		if err != nil {
			return nil, classify(err)
		}
		if ctx.Err() != nil {
			return nil, classify(ctx.Err())
		}
		if len(physical) != len(ids) {
			return nil, d.ErrNotReady
		}
		seen := map[string]bool{}
		for _, writer := range physical {
			if nilValue(writer) || !ids[writer.ID()] || seen[writer.ID()] {
				return nil, d.ErrNotReady
			}
			seen[writer.ID()] = true
		}
		actual, err := runtime(ctx, cloneInput(in), cloneSourceInventory(source), runtimeFrozen)
		if err != nil {
			return nil, classify(err)
		}
		if ctx.Err() != nil {
			return nil, classify(ctx.Err())
		}
		out := append(append([]flow.Writer(nil), physical...), actual...)
		if len(out) > 10000 {
			return nil, d.ErrNotReady
		}
		for _, writer := range actual {
			if nilValue(writer) || writer.ID() == "" || seen[writer.ID()] {
				return nil, d.ErrNotReady
			}
			seen[writer.ID()] = true
		}
		if frozen != nil {
			if len(out) != len(frozen) {
				return nil, d.ErrNotReady
			}
			for _, old := range frozen {
				if !seen[old.ID] {
					return nil, d.ErrNotReady
				}
			}
		}
		return out, nil
	}, nil
}
