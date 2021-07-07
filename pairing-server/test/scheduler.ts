export class Scheduler {
  private scheduledEvents: [number, () => void][] = [];
  private currentTimeMillis = 0;

  schedule(callback: () => void, millis: number) {
    this.scheduledEvents.push([millis, callback]);
  }

  setCurrentTimeMillis(millis: number) {
    this.currentTimeMillis = millis;
    this.scheduledEvents.forEach(event => {
      if (event[0] <= millis) {
        event[1]();
        event[1] = () => {};
      }
    });
  }

  getCurrentTimeMillis(): number {
    return this.currentTimeMillis;
  }
}
