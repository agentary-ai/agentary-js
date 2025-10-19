import React from 'react'

export default {
  logo: <span style={{ fontWeight: 700, fontSize: '1.2rem' }}>🤖 Agentary JS</span>,
  project: {
    link: 'https://github.com/agentary-ai/agentary-js',
  },
  docsRepositoryBase: 'https://github.com/agentary-ai/agentary-js/tree/main/docs',
  footer: {
    content: (
      <span>
        MIT {new Date().getFullYear()} ©{' '}
        <a href="https://github.com/agentary-ai" target="_blank">
          Agentary AI
        </a>
      </span>
    ),
  },
  head: () => (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Agentary JS" />
      <meta property="og:description" content="Run quantized LLMs in the browser with agentic workflows" />
      <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤖</text></svg>" />
    </>
  ),
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true
  },
  toc: {
    backToTop: true
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Agentary JS'
    }
  }
}
