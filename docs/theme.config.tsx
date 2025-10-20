import React from 'react'
import Image from 'next/image'
import AgentaryLogo from './assets/agentary.png'

export default {
  logo: (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <Image src={AgentaryLogo} alt="Agentary JS" width={148} height={24} priority />
    </div>
  ),
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
      <title>Agentary JS Docs</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Agentary JS Docs" />
      <meta property="og:description" content="Run quantized LLMs in the browser with agentic workflows" />
      <link rel="icon" href="/favicon.ico" />
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
      titleTemplate: '%s – Agentary Docs',
      defaultTitle: 'Agentary JS Docs'
    }
  }
}
