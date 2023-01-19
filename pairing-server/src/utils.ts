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

const realTimeout = function (millis: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        setTimeout(reject, millis);
    });
};

export type TimeoutWrapper = <T>(promise: Promise<T>, millis: number) => Promise<T>;

export const realTimeoutWrapper = timeoutWrapperFactory(realTimeout);

export function timeoutWrapperFactory(timeout: (millis: number) => Promise<void>): TimeoutWrapper {
    return async <T>(promise: Promise<T>, millis: number) => {
        const result = await Promise.race([promise, timeout(millis)]);
        return result as T;
    }
}
