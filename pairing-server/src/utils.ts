import { nanoid } from 'nanoid';
import { customAlphabet } from 'nanoid';

const SHORTCODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHORTCODE_LENGTH = 6;
const shortcode = customAlphabet(SHORTCODE_ALPHABET, SHORTCODE_LENGTH);

export function generateShortcode(): string {
    return shortcode();
}

export function generatePairingId(): string {
    return nanoid();
}
