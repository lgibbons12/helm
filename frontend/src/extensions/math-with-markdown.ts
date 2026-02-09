import { Node } from '@tiptap/core'
import { MathExtension, InlineMathNode } from '@aarkue/tiptap-math-extension'

// Extend InlineMathNode to add markdown serialization
export const InlineMathWithMarkdown = InlineMathNode.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // Serialize inline math as $latex$
          const latex = node.attrs.latex || ''
          state.write(`$${latex}$`)
        },
        parse: {
          // Let the markdown parser handle $ as regular text,
          // then the MathExtension's InputRules will convert it to math nodes
          setup(markdownit: any) {
            // Disable markdown-it's code parsing for $ signs
            // This allows $ to pass through as regular text
          },
        },
      },
    }
  },
})

export { MathExtension }
