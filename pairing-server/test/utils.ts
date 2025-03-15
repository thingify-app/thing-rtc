export async function runAfter<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        // This timeout is just to add the given function to the end of the
        // event queue. We should not rely on timing, or race conditions will
        // result.
        setTimeout(async () => {
            try {
                resolve(await fn());
            } catch (err) {
                reject(err);
            }
        }, 1);
    });
}
