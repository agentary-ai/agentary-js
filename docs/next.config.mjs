import nextra from 'nextra'

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: true
  },
  defaultShowCopyCode: true
})

export default withNextra({
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true
  },
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true
})
