export class Lazy<T> {
    private value: T = null;

    constructor(private producer: () => Promise<T>) {}

    async get(): Promise<T> {
        if (this.value === null) {
            this.value = await this.producer();
        }
        return this.value;
    }
}
