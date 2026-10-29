package systembackupkekcandidate

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"math/big"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

func hash(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func canonical(v any) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, ErrInvalid
	}
	b, err = jsoncanonicalizer.Transform(b)
	if err != nil {
		return nil, ErrInvalid
	}
	return b, nil
}

// Read before canonicalization: JCS must not round unsafe counts, repair
// duplicate members, invalid Unicode or drop unknown/null/missing members.
func decode(raw []byte, limit int, out any) ([]byte, error) {
	if len(raw) == 0 || len(raw) > limit || !utf8.Valid(raw) {
		return nil, ErrInvalid
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	v, err := value(d, 0)
	if err != nil {
		return nil, ErrInvalid
	}
	if _, err = d.Token(); err != io.EOF || !shape(v, reflect.TypeOf(out).Elem()) {
		return nil, ErrInvalid
	}
	b, err := jsoncanonicalizer.Transform(raw)
	if err != nil || json.Unmarshal(b, out) != nil {
		return nil, ErrInvalid
	}
	return b, nil
}
func value(d *json.Decoder, depth int) (any, error) {
	if depth > 32 {
		return nil, ErrInvalid
	}
	t, err := d.Token()
	if err != nil {
		return nil, ErrInvalid
	}
	if delim, ok := t.(json.Delim); ok {
		switch delim {
		case '{':
			m := map[string]any{}
			for d.More() {
				k, err := d.Token()
				s, ok := k.(string)
				if err != nil || !ok {
					return nil, ErrInvalid
				}
				if _, exists := m[s]; exists {
					return nil, ErrInvalid
				}
				v, err := value(d, depth+1)
				if err != nil {
					return nil, err
				}
				m[s] = v
			}
			end, err := d.Token()
			if err != nil || end != json.Delim('}') {
				return nil, ErrInvalid
			}
			return m, nil
		case '[':
			a := []any{}
			for d.More() {
				v, err := value(d, depth+1)
				if err != nil {
					return nil, err
				}
				a = append(a, v)
			}
			end, err := d.Token()
			if err != nil || end != json.Delim(']') {
				return nil, ErrInvalid
			}
			return a, nil
		default:
			return nil, ErrInvalid
		}
	}
	return t, nil
}
func shape(v any, t reflect.Type) bool {
	switch t.Kind() {
	case reflect.Struct:
		m, ok := v.(map[string]any)
		if !ok || len(m) != t.NumField() {
			return false
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			x, found := m[f.Tag.Get("json")]
			if !found || !shape(x, f.Type) {
				return false
			}
		}
		return true
	case reflect.Slice:
		a, ok := v.([]any)
		if !ok {
			return false
		}
		for _, x := range a {
			if !shape(x, t.Elem()) {
				return false
			}
		}
		return true
	case reflect.String:
		_, ok := v.(string)
		return ok
	case reflect.Int64:
		n, ok := v.(json.Number)
		if !ok {
			return false
		}
		// Bound numeric representation work before big.Rat expands exponents.
		if len(n) > 64 {
			return false
		}
		if i := strings.IndexAny(string(n), "eE"); i >= 0 {
			exponent, e := strconv.Atoi(string(n)[i+1:])
			if e != nil || exponent < -400 || exponent > 400 {
				return false
			}
		}
		r, ok := new(big.Rat).SetString(string(n))
		return ok && r.IsInt() && r.Sign() >= 0 && r.Num().IsInt64() && r.Num().Int64() <= 9007199254740991
	}
	return false
}
