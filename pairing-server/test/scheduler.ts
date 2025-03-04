export class Scheduler {
  private scheduledEvents: [number, () => void][] = [];
  private currentTimeMillis = 0;

  schedule(callback: () => void, millis: number) {
    this.scheduledEvents.push([millis, callback]);
    // Run in case we just scheduled something past the currentTimeMillis.
    this.runEvents();
  }

  setCurrentTimeMillis(millis: number) {
    this.currentTimeMillis = millis;
    this.runEvents();
  }

  private runEvents() {
    this.scheduledEvents.forEach(event => {
      if (event[0] <= this.currentTimeMillis) {
        event[1]();
        event[1] = () => {};
      }
    });
  }

  getCurrentTimeMillis(): number {
    return this.currentTimeMillis;
  }
}
