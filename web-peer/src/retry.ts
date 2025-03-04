export interface Retry {
    retry(fn: Function): void;
}

/** Attempts at most one retry at a time, throttled at a constant interval. */
export class ConstantRetry implements Retry {
    private readonly RETRY_PERIOD_MS = 1000;
    private retrying = false;

    retry(fn: Function) {
        // Gate this, so that multiple attempts to retry only result in one at a time.
        if (!this.retrying) {
            this.retrying = true;
            // setTimeout is beneficial as it allows us to use the JS event queue, rather
            // than the stack with recursion. Also, it allows us this constant throttled
            // retry period.
            setTimeout(() => {
                console.log('Retrying...');
                fn();
                this.retrying = false;
            }, this.RETRY_PERIOD_MS);
        }
    }
}
