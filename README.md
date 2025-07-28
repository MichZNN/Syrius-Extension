# Syrius Extension

A non-custodial browser wallet extension for the Zenon Network of Momentum blockchain.

## Installation

### Load in Chrome

1. **Prerequisites**
   - Node.js 18 or higher
   - npm 8 or higher

2. **Build the extension**
   ```bash
   git clone https://github.com/MichZNN/syrius-extension.git
   cd syrius-extension
   npm install --legacy-peer-deps
   npm run build
   ```

3. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `build` folder

## Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm start

# Build for production
npm run build
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer**: This is experimental software. Use at your own risk. Always verify transactions before signing.