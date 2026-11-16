import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import liveswarm from '../../index.mjs';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [liveswarm(), react()],
  server: { host: '127.0.0.1', port: 5181, strictPort: true },
};
