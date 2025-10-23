import React from 'react'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import AgentaryLogoLight from './assets/agentary-light.png'
import AgentaryLogoDark from './assets/agentary-dark.png'

const Logo = () => {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Avoid hydration mismatch by not rendering until mounted on client
  if (!mounted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: 148, height: 24 }} />
    )
  }

  const logo = resolvedTheme === 'dark' ? AgentaryLogoLight : AgentaryLogoDark

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <Image
        src={logo}
        alt="Agentary Logo"
        width={148}
        height={24}
        priority
      />
    </div>
  )
}

export default {
  logo: <Logo />,
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
