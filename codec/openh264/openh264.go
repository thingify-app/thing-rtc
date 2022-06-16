package openh264

import (
	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/openh264"

	"github.com/thingify-app/thing-rtc-go/codec"
)

func NewCodec(bitrate int) (*codec.Codec, error) {
	params, err := openh264.NewParams()
	if err != nil {
		return nil, err
	}
	params.BitRate = bitrate

	codecSelector := mediadevices.NewCodecSelector(
		mediadevices.WithVideoEncoders(&params),
	)

	return &codec.Codec{
		CodecSelector: codecSelector,
	}, nil
}
