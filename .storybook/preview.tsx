import type { Preview } from "@storybook/react-vite"
import "../src/capicola.css"

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#141414" },
        { name: "light", value: "#f4f4f5" },
      ],
    },
  },
}

export default preview
