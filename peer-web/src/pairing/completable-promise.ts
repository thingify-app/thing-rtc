export class CompletablePromise<T> {
    private resolve = (value: T) => { this.result = value; };
    private reject = (reason: any) => { this.rejectReason = reason; };
    private result: T|null = null;
    private rejectReason: any = null;

    async promise(): Promise<T> {
        if (this.rejectReason) {
            return Promise.reject(this.rejectReason);
        } else if (this.result) {
            return this.result;
        } else {
            return new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });
        }
    }

    complete(value: T): void {
        this.resolve(value);
    }

    cancel(reason: any): void {
        this.reject(reason);
    }
}
