class Toast {
  message = $state('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  show(message: string, ms = 2500) {
    this.message = message;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.message = ''), ms);
  }
}
export const toast = new Toast();
