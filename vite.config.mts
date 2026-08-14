import { defineConfig } from 'vite'

export default defineConfig({
  // Keep root as default (project root) so index.html is served
  // root: '.', 
  
  server: {
    watch: {
      usePolling: true, // Essential for Windows HMR with external tools
      interval: 100,
      // Ignore src because tsc handles it; Watch dist for changes
      ignored: [
        "**/node_modules/**",
        "**/src/**", 
        "!**/dist/**" // Explicitly ensure dist is NOT ignored
      ],
    },
  },
})