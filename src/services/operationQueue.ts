export class OperationQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
