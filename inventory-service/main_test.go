package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// These tests build the real router with a nil pool and only exercise paths
// that validate input before any SQL runs. No database is required.

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
		t.Fatalf("body = %q", got)
	}
}

func TestHealthRejectsWrongMethod(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/health", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestGetStockRejectsNonInteger(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/stock/abc", nil))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "productId must be an integer") {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestReserveRejectsInvalidBodies(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"empty object", `{}`},
		{"zero quantity", `{"productId":1,"quantity":0}`},
		{"negative quantity", `{"productId":1,"quantity":-5}`},
		{"zero product", `{"productId":0,"quantity":1}`},
		{"malformed json", `not json`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/stock/reserve", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			newMux(nil).ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %q)", rec.Code, rec.Body.String())
			}
		})
	}
}
