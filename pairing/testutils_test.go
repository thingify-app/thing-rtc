package pairing

type zeroReader struct{}

// Make signing deterministic by providing a constant random source.
func (zeroReader) Read(p []byte) (int, error) {
	n := len(p)
	for i := range p {
		p[i] = 0
	}
	return n, nil
}
