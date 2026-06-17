package thingrtc

import (
	"io"

	"github.com/pion/webrtc/v3"
)

type DataChannel interface {
	SendStringMessage(message string)
	SendBinaryMessage(message []byte)

	OnStringMessage(listener func(message string))
	OnBinaryMessage(listener func(message []byte))

	Close()

	GetLabel() string

	AsStream() (io.ReadWriteCloser, error)
}

type dataChannelWrapper struct {
	wrapped               *webrtc.DataChannel
	stringMessageListener func(message string)
	binaryMessageListener func(message []byte)
}

func createDataChannelWrapper(wrapped *webrtc.DataChannel) DataChannel {
	wrapper := &dataChannelWrapper{
		wrapped:               wrapped,
		stringMessageListener: func(message string) {},
		binaryMessageListener: func(message []byte) {},
	}

	wrapped.OnMessage(func(msg webrtc.DataChannelMessage) {
		if msg.IsString {
			wrapper.stringMessageListener(string(msg.Data))
		} else {
			wrapper.binaryMessageListener(msg.Data)
		}
	})

	return wrapper
}

func (dc *dataChannelWrapper) SendStringMessage(message string) {
	dc.wrapped.SendText(message)
}

func (dc *dataChannelWrapper) SendBinaryMessage(message []byte) {
	dc.wrapped.Send(message)
}

func (dc *dataChannelWrapper) OnStringMessage(listener func(message string)) {
	dc.stringMessageListener = listener
}

func (dc *dataChannelWrapper) OnBinaryMessage(listener func(message []byte)) {
	dc.binaryMessageListener = listener
}

func (dc *dataChannelWrapper) GetLabel() string {
	return dc.wrapped.Label()
}

func (dc *dataChannelWrapper) Close() {
	dc.wrapped.Close()
}

func (dc *dataChannelWrapper) AsStream() (io.ReadWriteCloser, error) {
	return dc.wrapped.Detach()
}
