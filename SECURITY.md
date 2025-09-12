# Security Policy

## Supported Versions

We actively support the following versions of Agentary JS with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in Agentary JS, please report it privately to help us address it responsibly.

### How to Report

1. **Email**: Send details to [declan@agentary.ai](mailto:declan@agentary.ai)
2. **Subject Line**: Include "SECURITY" in the subject line
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if you have one)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Initial Assessment**: We'll provide an initial assessment within 5 business days
- **Updates**: We'll keep you informed of our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Responsible Disclosure

Please allow us reasonable time to investigate and fix the issue before making it public. We're committed to:

- Working with you to understand and resolve the issue
- Keeping you informed throughout the process
- Giving you credit for the discovery (if desired)
- Coordinating the disclosure timeline

### Security Best Practices

When using Agentary JS:

1. **Keep Updated**: Always use the latest version
2. **Validate Input**: Sanitize and validate all user inputs before processing
3. **Model Security**: Be cautious with untrusted models - only use models from reputable sources
4. **Browser Security**: Ensure your application follows browser security best practices
5. **Token Management**: If using HuggingFace tokens, store them securely and never expose them in client-side code

### Scope

This security policy covers:

- The core Agentary JS library
- Official examples and documentation
- Build and deployment processes

Out of scope:
- Third-party models (though we'll help coordinate with model providers if needed)
- User applications built with Agentary JS
- Dependencies (report directly to their maintainers)

Thank you for helping keep Agentary JS secure!