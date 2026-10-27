//go:build systembackup_integration

package db

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"strings"
)

// A single-connection, plaintext loopback fixture, not a production proxy.
// Stop a complete query/prepare packet BEFORE forwarding it. Earlier statements
// have received their real server responses. Never log packets or credentials.
type historyFaultProxy struct {
	address string
	reached chan uint32
	done    chan struct{}
	cancel  context.CancelFunc
}

func startHistoryFaultProxy(parent context.Context, upstreamAddress, queryPrefix string) (*historyFaultProxy, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(parent)
	p := &historyFaultProxy{address: listener.Addr().String(), reached: make(chan uint32, 1), done: make(chan struct{}), cancel: cancel}
	stopListener := context.AfterFunc(ctx, func() { listener.Close() })
	go func() {
		defer close(p.done)
		defer cancel()
		defer stopListener()
		defer listener.Close()
		client, err := listener.Accept()
		if err != nil {
			return
		}
		// A driver reconnect must fail instead of silently bypassing injection.
		listener.Close()
		defer client.Close()
		stopClient := context.AfterFunc(ctx, func() { client.Close() })
		defer stopClient()
		server, err := (&net.Dialer{}).DialContext(ctx, "tcp", upstreamAddress)
		if err != nil {
			return
		}
		defer server.Close()
		stopServer := context.AfterFunc(ctx, func() { server.Close() })
		defer stopServer()
		greeting, err := readHistoryPacket(server)
		if err != nil {
			return
		}
		id, err := historyHandshakeID(greeting)
		if err != nil {
			return
		}
		if _, err = io.Copy(client, bytes.NewReader(greeting)); err != nil {
			return
		}
		finished := make(chan struct{}, 2)
		go func() {
			defer func() { finished <- struct{}{} }()
			io.Copy(client, server)
		}()
		go func() {
			defer func() { finished <- struct{}{} }()
			for {
				packet, err := readHistoryPacket(client)
				if err != nil {
					return
				}
				if historyPacketMatches(packet, queryPrefix) {
					p.reached <- id
					<-ctx.Done()
					return
				}
				if _, err = io.Copy(server, bytes.NewReader(packet)); err != nil {
					return
				}
			}
		}()
		<-finished
		cancel()
		client.Close()
		server.Close()
		<-finished
	}()
	return p, nil
}

func (p *historyFaultProxy) close() {
	p.cancel()
	<-p.done
}

func readHistoryPacket(r io.Reader) ([]byte, error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}
	size := int(header[0]) | int(header[1])<<8 | int(header[2])<<16
	// The fixture's SQL/authentication packets are small. Refuse continuation
	// packets, TLS, compression, or unexpected large traffic; never misparse it.
	if size == 0 || size > 1<<20 {
		return nil, errors.New("unsupported fixture packet size")
	}
	packet := make([]byte, 4+size)
	copy(packet, header)
	_, err := io.ReadFull(r, packet[4:])
	return packet, err
}

func historyHandshakeID(packet []byte) (uint32, error) {
	if len(packet) < 6 || packet[3] != 0 || packet[4] != 10 {
		return 0, errors.New("unsupported fixture greeting")
	}
	end := bytes.IndexByte(packet[5:], 0)
	offset := 5 + end + 1
	if end < 0 || offset+4 > len(packet) {
		return 0, errors.New("incomplete fixture greeting")
	}
	id := binary.LittleEndian.Uint32(packet[offset : offset+4])
	if id == 0 {
		return 0, errors.New("invalid fixture connection id")
	}
	return id, nil
}

func historyPacketMatches(packet []byte, prefix string) bool {
	// Authentication responses have nonzero sequence IDs. The Go driver uses
	// COM_QUERY for DDL and COM_STMT_PREPARE for parameterized ledger INSERT.
	return len(packet) > 5 && packet[3] == 0 &&
		(packet[4] == 0x03 || packet[4] == 0x16) &&
		strings.HasPrefix(strings.TrimSpace(string(packet[5:])), prefix)
}
