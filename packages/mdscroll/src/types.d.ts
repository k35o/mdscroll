declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';

  type Options = {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  };

  const plugin: PluginWithOptions<Options>;
  export default plugin;
}
