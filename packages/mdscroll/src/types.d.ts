declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';

  type Options = {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  };

  const plugin: (md: MarkdownIt, options?: Options) => void;
  export default plugin;
}
