package thingrtc

import (
	"fmt"
	"io"
	"log"
	"time"

	"github.com/deepch/vdk/av"
	"github.com/deepch/vdk/codec/h264parser"
	"github.com/deepch/vdk/format/rtsp"
	"github.com/pion/mediadevices"
	"github.com/pion/mediadevices/pkg/frame"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"

	"github.com/thingify-app/thing-rtc/peer-go/codec"
)

type MediaSource struct {
	tracks []webrtc.TrackLocal
	codec  *codec.Codec
}

func CreateVideoMediaSource(codec *codec.Codec, width, height int) (*MediaSource, error) {
	track, err := createVideoTrack(codec, width, height)
	if err != nil {
		return nil, err
	}
	return &MediaSource{
		tracks: []webrtc.TrackLocal{track},
		codec:  codec,
	}, nil
}

func CreateRtspMediaSource(rtspUrl string) (*MediaSource, error) {
	track, err := createRtspTrack(rtspUrl)
	if err != nil {
		return nil, err
	}
	return &MediaSource{
		tracks: []webrtc.TrackLocal{track},
		codec:  nil,
	}, nil
}

func createVideoTrack(codec *codec.Codec, width, height int) (webrtc.TrackLocal, error) {
	mediaStream, err := mediadevices.GetUserMedia(mediadevices.MediaStreamConstraints{
		Video: func(c *mediadevices.MediaTrackConstraints) {
			c.FrameFormat = prop.FrameFormat(frame.FormatI420)
			c.Width = prop.Int(width)
			c.Height = prop.Int(height)
		},
		Codec: codec.CodecSelector,
	})

	if err != nil {
		return nil, err
	}

	tracks := mediaStream.GetVideoTracks()
	if len(tracks) != 1 {
		return nil, fmt.Errorf("only one video track expected")
	}

	return tracks[0], nil
}

func createRtspTrack(rtspUrl string) (webrtc.TrackLocal, error) {
	outboundVideoTrack, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{
		MimeType: "video/h264",
	}, "pion-rtsp", "pion-rtsp")

	if err != nil {
		return nil, err
	}

	go rtspConsumer(rtspUrl, outboundVideoTrack)

	return outboundVideoTrack, nil
}

func rtspConsumer(rtspUrl string, outboundVideoTrack *webrtc.TrackLocalStaticSample) {
	annexbNALUStartCode := func() []byte { return []byte{0x00, 0x00, 0x00, 0x01} }

	for {
		session, err := rtsp.Dial(rtspUrl)
		if err != nil {
			panic(err)
		}
		session.RtpKeepAliveTimeout = 10 * time.Second

		codecs, err := session.Streams()
		if err != nil {
			panic(err)
		}
		for i, t := range codecs {
			log.Println("Stream", i, "is of type", t.Type().String())
		}
		if codecs[0].Type() != av.H264 {
			panic("RTSP feed must begin with a H264 codec")
		}
		if len(codecs) != 1 {
			log.Println("Ignoring all but the first stream.")
		}

		var previousTime time.Duration
		for {
			pkt, err := session.ReadPacket()
			if err != nil {
				break
			}

			if pkt.Idx != 0 {
				//audio or other stream, skip it
				continue
			}

			pkt.Data = pkt.Data[4:]

			// For every key-frame pre-pend the SPS and PPS
			if pkt.IsKeyFrame {
				pkt.Data = append(annexbNALUStartCode(), pkt.Data...)
				pkt.Data = append(codecs[0].(h264parser.CodecData).PPS(), pkt.Data...)
				pkt.Data = append(annexbNALUStartCode(), pkt.Data...)
				pkt.Data = append(codecs[0].(h264parser.CodecData).SPS(), pkt.Data...)
				pkt.Data = append(annexbNALUStartCode(), pkt.Data...)
			}

			bufferDuration := pkt.Time - previousTime
			previousTime = pkt.Time
			if err = outboundVideoTrack.WriteSample(media.Sample{Data: pkt.Data, Duration: bufferDuration}); err != nil && err != io.ErrClosedPipe {
				panic(err)
			}
		}

		if err = session.Close(); err != nil {
			log.Println("session Close error", err)
		}

		time.Sleep(5 * time.Second)
	}
}
