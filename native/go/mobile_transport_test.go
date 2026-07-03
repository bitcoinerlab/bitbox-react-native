package bitboxnative

import (
	"errors"
	"io"
	"testing"

	"github.com/BitBoxSwiss/bitbox02-api-go/api/common"
)

type fakeMobileTransport struct {
	readData  []byte
	readErr   error
	writeN    int
	writeErr  error
	writeData []byte
	closed    bool
}

func (transport *fakeMobileTransport) Read(n int) ([]byte, error) {
	_ = n
	return transport.readData, transport.readErr
}

func (transport *fakeMobileTransport) Write(data []byte) (int, error) {
	transport.writeData = append([]byte(nil), data...)
	return transport.writeN, transport.writeErr
}

func (transport *fakeMobileTransport) Close() error {
	transport.closed = true
	return nil
}

func TestMobileProduct(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    common.Product
		wantErr bool
	}{
		{
			name:  "short Nova BTC-only",
			input: "bb02p-btconly",
			want:  common.ProductBitBox02PlusBTCOnly,
		},
		{
			name:  "USB product string",
			input: common.FirmwareDeviceProductStringBitBox02PlusMulti,
			want:  common.ProductBitBox02PlusMulti,
		},
		{
			name:  "trimmed product string",
			input: " bb02p-btconly ",
			want:  common.ProductBitBox02PlusBTCOnly,
		},
		{
			name:    "bootloader unsupported",
			input:   "bb02p-bl-btconly",
			wantErr: true,
		},
		{
			name:    "unknown product",
			input:   "unknown",
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := mobileProduct(test.input)
			if test.wantErr {
				if err == nil {
					t.Fatalf("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}

func TestMobileTransportAdapterRead(t *testing.T) {
	adapter := &mobileTransportAdapter{transport: &fakeMobileTransport{readData: []byte{1, 2, 3}}}
	buf := make([]byte, 4)
	n, err := adapter.Read(buf)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 3 {
		t.Fatalf("got read count %d, want 3", n)
	}
	if string(buf[:n]) != string([]byte{1, 2, 3}) {
		t.Fatalf("unexpected read bytes: %x", buf[:n])
	}
}

func TestMobileTransportAdapterReadShortBuffer(t *testing.T) {
	adapter := &mobileTransportAdapter{transport: &fakeMobileTransport{readData: []byte{1, 2, 3}}}
	_, err := adapter.Read(make([]byte, 2))
	if !errors.Is(err, io.ErrShortBuffer) {
		t.Fatalf("got error %v, want %v", err, io.ErrShortBuffer)
	}
}

func TestMobileTransportAdapterWrite(t *testing.T) {
	transport := &fakeMobileTransport{writeN: 2}
	adapter := &mobileTransportAdapter{transport: transport}
	n, err := adapter.Write([]byte{4, 5, 6})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 2 {
		t.Fatalf("got write count %d, want 2", n)
	}
	if string(transport.writeData) != string([]byte{4, 5, 6}) {
		t.Fatalf("unexpected write bytes: %x", transport.writeData)
	}
}

func TestMobileTransportAdapterWriteRejectsInvalidCount(t *testing.T) {
	adapter := &mobileTransportAdapter{transport: &fakeMobileTransport{writeN: 4}}
	if _, err := adapter.Write([]byte{1, 2, 3}); err == nil {
		t.Fatalf("expected error")
	}
}

func TestMobileTransportAdapterWriteRejectsZeroWithoutError(t *testing.T) {
	adapter := &mobileTransportAdapter{transport: &fakeMobileTransport{}}
	_, err := adapter.Write([]byte{1})
	if !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("got error %v, want %v", err, io.ErrShortWrite)
	}
}

func TestNewClientWithMobileTransportRequiresTransport(t *testing.T) {
	if _, err := NewClientWithMobileTransport(nil, "bb02p-btconly", "9.26.1", true); err == nil {
		t.Fatalf("expected error")
	}
}
