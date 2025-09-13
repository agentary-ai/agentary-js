import { describe, it, expect, beforeEach } from 'vitest'
import { CompositeToolCallParser } from '../../../src/processing/tools/parsers/composite-parser'
import { XMLToolCallParser } from '../../../src/processing/tools/parsers/xml-parser'
import { JSONToolCallParser } from '../../../src/processing/tools/parsers/json-parser'
import { FunctionCallParser } from '../../../src/processing/tools/parsers/function-parser'

describe('Tool Call Parsing', () => {
  let compositeParser: CompositeToolCallParser
  
  beforeEach(() => {
    compositeParser = new CompositeToolCallParser()
  })

  describe('CompositeToolCallParser', () => {
    it('should parse valid XML format tool calls', () => {
      const content = `
        I need to search for information.
        <tool_call>
        <name>search</name>
        <parameters>
        <query>JavaScript testing frameworks</query>
        </parameters>
        </tool_call>
        That should help find the information.
      `
      
      const result = compositeParser.parse(content)
      
      expect(result).toEqual({
        name: 'search',
        args: {
          query: 'JavaScript testing frameworks'
        }
      })
    })

    it('should parse valid JSON format tool calls', () => {
      const content = `
        Let me calculate this for you.
        {"tool_call": {"name": "calculate", "parameters": {"expression": "2 + 2"}}}
        The calculation is complete.
      `
      
      const result = compositeParser.parse(content)
      
      expect(result).toEqual({
        name: 'calculate',
        args: {
          expression: '2 + 2'
        }
      })
    })

    it('should parse function call format', () => {
      const content = `
        I'll help you with that calculation.
        calculate("15 * 23 + 47")
        Here's the result.
      `
      
      const result = compositeParser.parse(content)
      
      expect(result).toEqual({
        name: 'calculate',
        args: {
          expression: '15 * 23 + 47'
        }
      })
    })

    it('should return null for content without tool calls', () => {
      const content = 'This is just regular text without any tool calls.'
      
      const result = compositeParser.parse(content)
      
      expect(result).toBeNull()
    })

    it('should handle malformed tool calls gracefully', () => {
      const content = '<tool_call><name>broken</parameters></tool_call>'
      
      const result = compositeParser.parse(content)
      
      expect(result).toBeNull()
    })
  })

  describe('XMLToolCallParser', () => {
    let xmlParser: XMLToolCallParser
    
    beforeEach(() => {
      xmlParser = new XMLToolCallParser()
    })

    it('should parse simple XML tool calls', () => {
      const content = `
        <tool_call>
        <name>get_weather</name>
        <parameters>
        <city>New York</city>
        </parameters>
        </tool_call>
      `
      
      const result = xmlParser.parse(content)
      
      expect(result).toEqual({
        name: 'get_weather',
        args: {
          city: 'New York'
        }
      })
    })

    it('should handle multiple parameters', () => {
      const content = `
        <tool_call>
        <name>send_email</name>
        <parameters>
        <to>user@example.com</to>
        <subject>Test Subject</subject>
        <body>Test message body</body>
        </parameters>
        </tool_call>
      `
      
      const result = xmlParser.parse(content)
      
      expect(result).toEqual({
        name: 'send_email',
        args: {
          to: 'user@example.com',
          subject: 'Test Subject',
          body: 'Test message body'
        }
      })
    })

    it('should handle nested XML content in parameters', () => {
      const content = `
        <tool_call>
        <name>format_text</name>
        <parameters>
        <content><strong>Bold text</strong> and <em>italic text</em></content>
        </parameters>
        </tool_call>
      `
      
      const result = xmlParser.parse(content)
      
      expect(result).toEqual({
        name: 'format_text',
        args: {
          content: '<strong>Bold text</strong> and <em>italic text</em>'
        }
      })
    })

    it('should return null for invalid XML', () => {
      const content = '<tool_call><name>broken</parameters>'
      
      const result = xmlParser.parse(content)
      
      expect(result).toBeNull()
    })
  })

  describe('JSONToolCallParser', () => {
    let jsonParser: JSONToolCallParser
    
    beforeEach(() => {
      jsonParser = new JSONToolCallParser()
    })

    it('should parse JSON tool calls', () => {
      const content = '{"tool_call": {"name": "get_weather", "parameters": {"city": "San Francisco"}}}'
      
      const result = jsonParser.parse(content)
      
      expect(result).toEqual({
        name: 'get_weather',
        args: {
          city: 'San Francisco'
        }
      })
    })

    it('should handle complex parameter objects', () => {
      const content = JSON.stringify({
        tool_call: {
          name: 'create_event',
          parameters: {
            title: 'Team Meeting',
            date: '2024-01-15',
            attendees: ['alice@company.com', 'bob@company.com'],
            metadata: {
              room: 'Conference Room A',
              duration: 60
            }
          }
        }
      })
      
      const result = jsonParser.parse(content)
      
      expect(result).toEqual({
        name: 'create_event',
        args: {
          title: 'Team Meeting',
          date: '2024-01-15',
          attendees: ['alice@company.com', 'bob@company.com'],
          metadata: {
            room: 'Conference Room A',
            duration: 60
          }
        }
      })
    })

    it('should return null for invalid JSON', () => {
      const content = '{"tool_call": {"name": "broken", "parameters": {'
      
      const result = jsonParser.parse(content)
      
      expect(result).toBeNull()
    })

    it('should return null for JSON without tool_call structure', () => {
      const content = '{"message": "This is just a regular JSON object"}'
      
      const result = jsonParser.parse(content)
      
      expect(result).toBeNull()
    })
  })

  describe('FunctionCallParser', () => {
    let functionParser: FunctionCallParser
    
    beforeEach(() => {
      functionParser = new FunctionCallParser()
    })

    it('should parse simple function calls', () => {
      const content = 'calculate("2 + 2")'
      
      const result = functionParser.parse(content)
      
      expect(result).toEqual({
        name: 'calculate',
        args: {
          expression: '2 + 2'
        }
      })
    })

    it('should parse function calls with multiple parameters', () => {
      const content = 'send_message("Hello world", "user123", true)'
      
      const result = functionParser.parse(content)
      
      expect(result).toEqual({
        name: 'send_message',
        args: {
          message: 'Hello world',
          recipient: 'user123',
          urgent: true
        }
      })
    })

    it('should handle function calls in context', () => {
      const content = `
        I'll help you with that calculation.
        The result is: calculate("15 * 4 + 7")
        Let me know if you need anything else.
      `
      
      const result = functionParser.parse(content)
      
      expect(result).toEqual({
        name: 'calculate',
        args: {
          expression: '15 * 4 + 7'
        }
      })
    })

    it('should return null for invalid function syntax', () => {
      const content = 'broken_function('
      
      const result = functionParser.parse(content)
      
      expect(result).toBeNull()
    })

    it('should return null when no function calls are present', () => {
      const content = 'This is just regular text without function calls.'
      
      const result = functionParser.parse(content)
      
      expect(result).toBeNull()
    })
  })

  describe('Parser Priority and Fallback', () => {
    it('should prefer XML format when multiple formats are present', () => {
      const content = `
        <tool_call>
        <name>xml_tool</name>
        <parameters>
        <param>xml_value</param>
        </parameters>
        </tool_call>
        
        {"tool_call": {"name": "json_tool", "parameters": {"param": "json_value"}}}
      `
      
      const result = compositeParser.parse(content)
      
      expect(result?.name).toBe('xml_tool')
    })

    it('should fall back to JSON when XML parsing fails', () => {
      const content = `
        <broken_xml>
        
        {"tool_call": {"name": "json_tool", "parameters": {"param": "json_value"}}}
      `
      
      const result = compositeParser.parse(content)
      
      expect(result?.name).toBe('json_tool')
    })

    it('should fall back to function call when structured formats fail', () => {
      const content = `
        Some text with invalid structured formats
        but a valid function_call("parameter")
      `
      
      const result = compositeParser.parse(content)
      
      expect(result?.name).toBe('function_call')
    })
  })
})
