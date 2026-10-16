package systembackupsecurity

import "time"

// AdmissionDeadlineAt returns the frozen proof's earliest original time limit:
// signed expiration or the verified auth-time/max-age/skew window. It performs
// no SQL, refresh, nonce consumption or current-authorization check. Callers
// must also apply their original session/claim/config/material/capacity limits.
func (v SensitiveDownloadProofVerification) AdmissionDeadlineAt() (time.Time, error) {
	if v.request.canonical == "" || v.verifiedAt.IsZero() || v.maxAge <= 0 || v.skew < 0 {
		return time.Time{}, ErrRegistrationUnavailable
	}
	auth, expires, err := parseTimes(v.timePayload)
	if err != nil || !expires.Equal(v.expiresAt) {
		return time.Time{}, ErrRegistrationUnavailable
	}
	// Two additions avoid overflowing the sum of two time.Duration values.
	until := auth.Add(v.maxAge).Add(v.skew)
	if expires.Before(until) {
		until = expires
	}
	return until.UTC(), nil
}
