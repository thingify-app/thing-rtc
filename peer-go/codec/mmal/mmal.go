package mmal

import (
	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/codec/mmal"

	"github.com/thingify-app/thing-rtc/peer-go/codec"
)

func NewCodec(bitrate int) (*codec.Codec, error) {
	params, err := mmal.NewParams()
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
