package thingrtc

import (
	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/frame"
	"github.com/pion/mediadevices/pkg/prop"
)

type MediaSource struct {
	mediaStream func(codecSelector *mediadevices.CodecSelector) (mediadevices.MediaStream, error)
}

func CreateVideoMediaSource(width, height int) MediaSource {
	return MediaSource{
		func(codecSelector *mediadevices.CodecSelector) (mediadevices.MediaStream, error) {
			return mediadevices.GetUserMedia(mediadevices.MediaStreamConstraints{
				Video: func(c *mediadevices.MediaTrackConstraints) {
					c.FrameFormat = prop.FrameFormat(frame.FormatI420)
					c.Width = prop.Int(width)
					c.Height = prop.Int(height)
				},
				Codec: codecSelector,
			})
		},
	}
}
