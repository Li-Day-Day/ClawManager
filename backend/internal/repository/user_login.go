package repository

import (
	"errors"
	"time"
)

// LoginState is the verified snapshot plus the only fields login may update.
// It cannot overwrite a concurrent password change or reactivate an account.
type LoginState struct {
	UserID                                         int
	PasswordHash, AuthProvider, ExpectedRole, Role string
	ExternalID                                     *string
	At                                             time.Time
}

type LoginStateRepository interface{ UpdateLoginState(LoginState) error }

func (r *userRepository) UpdateLoginState(s LoginState) error {
	if s.UserID <= 0 || s.At.IsZero() || (s.Role != "admin" && s.Role != "user") {
		return errors.New("login state conflict")
	}
	provider := s.AuthProvider
	if provider == "" {
		provider = "local"
	}
	result, err := r.sess.SQL().Exec(`UPDATE users SET last_login=?,auth_provider=?,role=?
WHERE id=? AND BINARY password_hash=BINARY ? AND auth_provider=? AND role=? AND is_active=TRUE AND BINARY external_id <=> BINARY ?`, s.At, provider, s.Role, s.UserID, s.PasswordHash, s.AuthProvider, s.ExpectedRole, s.ExternalID)
	if err != nil {
		return errors.New("login state unavailable")
	}
	n, err := result.RowsAffected()
	if err != nil || n > 1 {
		return errors.New("login state conflict")
	}
	if n == 0 {
		// MySQL reports changed rows by default. Two logins in the same stored
		// timestamp tick may match without changing anything. Recheck the full
		// credential/identity predicate before treating that as a valid login.
		var count int
		row, queryErr := r.sess.SQL().QueryRow(`SELECT COUNT(*) FROM users WHERE id=? AND BINARY password_hash=BINARY ? AND auth_provider=? AND role=? AND is_active=TRUE AND BINARY external_id <=> BINARY ?`, s.UserID, s.PasswordHash, provider, s.Role, s.ExternalID)
		if queryErr != nil || row.Scan(&count) != nil || count != 1 {
			return errors.New("login state conflict")
		}
	}
	return nil
}
