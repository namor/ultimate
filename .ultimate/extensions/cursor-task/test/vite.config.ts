import base from '../../../../vite.config.ts'

export default {
  ...base,
  test: {
    ...base.test,
    projects: undefined,
    environment: 'jsdom',
    include: ['.ultimate/extensions/cursor-task/test/web.test.solid.tsx'],
    setupFiles: ['test/web/solid-dom-setup.ts'],
    globalSetup: [],
  },
}
