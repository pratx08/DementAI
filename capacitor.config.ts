import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pratx08.dementai',
  appName: 'DementAI',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
  },
}

export default config
