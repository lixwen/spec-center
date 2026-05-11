declare module "@toast-ui/editor/viewer" {
  export default class Viewer {
    constructor(options: {
      el: HTMLElement;
      initialValue?: string;
      usageStatistics?: boolean;
    });

    destroy(): void;

    setMarkdown(markdown: string): void;
  }
}
