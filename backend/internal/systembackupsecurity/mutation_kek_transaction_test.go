package systembackupsecurity

import "testing"

func TestPreparedMutationKEKInputCannotRewriteResolverFacts(t *testing.T) {
	p := &preparedConfigMutationReadiness{input: ConfigMutationResourceInput{
		installation: "installation-1",
		registries: map[string]ConfigMutationRegistryPair{
			"rbac_bindings": {CurrentJSON: []byte(`{"old":1}`), ProposedJSON: []byte(`{"next":2}`)},
		},
		references: map[string]configMutationReferencePair{
			"kek": {proposed: BootstrapSecretRef{Purpose: "kek", Version: "v2"}},
		},
	}}
	in := p.KEKInput()
	if in.Slot() != "reference:kek" || in.InstallationID() != "installation-1" {
		t.Fatal("KEK validator received a different original slot")
	}
	pair := in.registries["rbac_bindings"]
	pair.CurrentJSON[0] = 'x'
	pair.ProposedJSON[0] = 'x'
	in.registries["rbac_bindings"] = pair
	in.references["kek"] = configMutationReferencePair{}
	if p.input.registries["rbac_bindings"].CurrentJSON[0] != '{' || p.input.registries["rbac_bindings"].ProposedJSON[0] != '{' || p.input.references["kek"].proposed.Version != "v2" || p.input.slot != "" {
		t.Fatal("KEK preparation mutated the original resolver observation")
	}
}
