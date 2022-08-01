package pairing

type constReader struct {
	value byte
}

// Make signing deterministic by providing a constant random source.
func (c constReader) Read(p []byte) (int, error) {
	n := len(p)
	for i := range p {
		p[i] = c.value
	}
	return n, nil
}

var zeroReader = constReader{0}
