//go:build systembackup_integration

package db

import (
	"bytes"
	"context"
	"io"
	"net"
	"testing"
	"testing/iotest"
	"time"
)

func historyFixturePacket(seq byte, body []byte) []byte {
	n := len(body)
	return append([]byte{byte(n), byte(n >> 8), byte(n >> 16), seq}, body...)
}

func TestDHistoryFaultProxy(t *testing.T) {
	for _, command := range []byte{0x03, 0x16} {
		t.Run(map[byte]string{0x03: "DDL_query", 0x16: "ledger_prepare"}[command], func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			proxy, err := startHistoryFaultProxy(ctx, listener.Addr().String(), "TARGET SQL")
			if err != nil {
				t.Fatal(err)
			}
			defer proxy.close()
			client, err := net.DialTimeout("tcp", proxy.address, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			server, err := listener.Accept()
			if err != nil {
				t.Fatal(err)
			}
			defer server.Close()
			deadline := time.Now().Add(10 * time.Second)
			server.SetDeadline(deadline)
			client.SetDeadline(deadline)
			greeting := historyFixturePacket(0, []byte{10, '8', '.', '4', 0, 42, 0, 0, 0})
			if _, err := server.Write(greeting); err != nil {
				t.Fatal(err)
			}
			got, err := readHistoryPacket(client)
			if err != nil || !bytes.Equal(got, greeting) {
				t.Fatal("greeting not preserved")
			}
			for _, frame := range [][]byte{
				historyFixturePacket(1, append([]byte{command}, []byte("TARGET SQL authentication fixture")...)),
				historyFixturePacket(0, append([]byte{0x03}, []byte("SELECT 1")...)),
			} {
				// TCP framing must work when a client writes one byte at a time.
				for _, b := range frame {
					if _, err := client.Write([]byte{b}); err != nil {
						t.Fatal(err)
					}
				}
				got, err := readHistoryPacket(server)
				if err != nil || !bytes.Equal(got, frame) {
					t.Fatal("non-target packet not preserved")
				}
			}
			target := historyFixturePacket(0, append([]byte{command}, []byte("TARGET SQL (?)")...))
			if _, err := client.Write(target); err != nil {
				t.Fatal(err)
			}
			select {
			case id := <-proxy.reached:
				if id != 42 {
					t.Fatal("wrong upstream connection identity")
				}
			case <-ctx.Done():
				t.Fatal("target not intercepted")
			}
			server.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
			var b [1]byte
			n, err := server.Read(b[:])
			if n != 0 {
				t.Fatal("target leaked upstream")
			}
			if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() {
				t.Fatalf("expected held packet: %v", err)
			}
			// The real test uses KILL CONNECTION; emulate only its socket close.
			server.Close()
			if n, err := client.Read(b[:]); n != 0 || err != io.EOF {
				t.Fatalf("server close not relayed: %d %v", n, err)
			}
			select {
			case <-proxy.done:
			case <-ctx.Done():
				t.Fatal("proxy workers leaked")
			}
			reconnect, err := net.DialTimeout("tcp", proxy.address, time.Second)
			if err == nil {
				reconnect.Close()
				t.Fatal("reconnect bypassed fault boundary")
			}
		})
	}
	t.Run("cancel_before_connect", func(t *testing.T) {
		proxy, err := startHistoryFaultProxy(context.Background(), "127.0.0.1:1", "unused")
		if err != nil {
			t.Fatal(err)
		}
		proxy.close()
	})
	t.Run("packet_validation", func(t *testing.T) {
		packet := historyFixturePacket(0, []byte{3, 'S', 'Q', 'L'})
		got, err := readHistoryPacket(iotest.OneByteReader(bytes.NewReader(packet)))
		if err != nil || !bytes.Equal(got, packet) {
			t.Fatal("fragmented packet rejected")
		}
		for _, bad := range [][]byte{{1}, {0, 0, 0, 0}, {255, 255, 255, 0}, {5, 0, 0, 0, 3}} {
			if _, err := readHistoryPacket(bytes.NewReader(bad)); err == nil {
				t.Fatal("invalid packet accepted")
			}
		}
		for _, bad := range [][]byte{nil, {0, 0, 0, 0, 10, '8'}, {0, 0, 0, 0, 10, '8', 0, 0, 0, 0, 0}} {
			if _, err := historyHandshakeID(bad); err == nil {
				t.Fatal("invalid identity accepted")
			}
		}
	})
}
