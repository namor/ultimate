import base from '../../../../vite.config.ts'

export default {
  ...base,
  test: {
    ...base.test,
    include: ['.ultimate/extensions/cursor-task/test/web.test.tsx'],
    setupFiles: [],
    globalSetup: [],
  },
}
