const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const glob = require('glob');

const ANALYSIS_PATH = './analysis.json';

// Paths
const ACTION_DIR = __dirname;
const USER_DIR = process.cwd();
const VITE_BIN = path.resolve(ACTION_DIR, 'node_modules', '.bin', 'vite');
const TIMESTAMP = Date.now(); 

async function buildDashboard() {
  console.log("🏗️  Starting AI Frontend Previewer Build...");

  if (!fs.existsSync(ANALYSIS_PATH)) {
    console.error("❌ No analysis file found.");
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(ANALYSIS_PATH, 'utf8'));
  const files = Object.keys(analysis);
  const viteInputs = {}; 
  const dashboardData = [];

  const cssFiles = glob.sync('src/**/*.css');
  const cssImports = cssFiles.map(f => `import './${f}';`).join('\n');

  files.forEach((filePath) => {
    const data = analysis[filePath];
    const safeName = path.basename(filePath, path.extname(filePath));
    const entryName = `preview-${safeName}.jsx`;
    const htmlName = `preview-${safeName}.html`;

    let extraImports = [];
    let wrapperStart = '';
    let wrapperEnd = '';
    
    if (data.wrappers?.router) {
      extraImports.push("import { BrowserRouter } from 'react-router-dom';");
      wrapperStart += '<BrowserRouter>';
      wrapperEnd = '</BrowserRouter>';
    }

    // --- NEW: GENERATE NETWORK INTERCEPTOR SCRIPT ---
    // This script runs inside the browser preview to hijack fetch calls
    const networkMocks = data.network_mocks || [];
    const interceptorScript = `
      // 🕵️ AI Frontend Previewer Network Interceptor
      const MOCKS = ${JSON.stringify(networkMocks)};
      
      const originalFetch = window.fetch;
      
      window.fetch = async (url, options) => {
        console.log("[AI Frontend Previewer] Intercepting request to:", url);
        
        // Simple logic: If we have ANY mocks, return the first one that matches loosely
        // or just return the first mock if it's a generic "api" call
        const mock = MOCKS.find(m => url.toString().includes(m.url_pattern) || m.url_pattern === '*') || MOCKS[0];

        if (mock) {
          console.log("[AI Frontend Previewer] Serving mock data:", mock.response);
          // Simulate network delay for realism
          await new Promise(r => setTimeout(r, 500));
          
          return {
            ok: true,
            status: 200,
            json: async () => mock.response,
            text: async () => JSON.stringify(mock.response)
          };
        }

        console.warn("[AI Frontend Previewer] No mock found for:", url, " - This might fail.");
        return originalFetch(url, options);
      };
    `;

    const entryContent = `
      import React from 'react';
      import ReactDOM from 'react-dom/client';
      ${cssImports}
      ${extraImports.join('\n')}
      import TargetComponent from './${filePath}';
      
      // Inject the interceptor BEFORE the component mounts
      ${interceptorScript}
      
      const { children: __childrenHTML, ...mockProps } = ${JSON.stringify(data.props)};

      ReactDOM.createRoot(document.getElementById('root')).render(
        <div style={{ padding: '20px', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', height: '100%' }}>
            ${wrapperStart}
              <TargetComponent {...mockProps}>
                {__childrenHTML ? <div dangerouslySetInnerHTML={{ __html: __childrenHTML }} /> : null}
              </TargetComponent>
            ${wrapperEnd}
          </div>
        </div>
      );
    `;
    fs.writeFileSync(path.join(USER_DIR, entryName), entryContent);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Preview: ${safeName}</title>
          <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
          <meta http-equiv="Pragma" content="no-cache" />
          <meta http-equiv="Expires" content="0" />
        </head>
        <body><div id="root"></div><script type="module" src="/${entryName}?t=${TIMESTAMP}"></script></body>
      </html>
    `;
    fs.writeFileSync(path.join(USER_DIR, htmlName), htmlContent);

    viteInputs[safeName] = path.resolve(USER_DIR, htmlName);
    dashboardData.push({ name: safeName, url: htmlName, originalPath: filePath });
  });

  // ... (Rest of build.js: Copy Dashboard, Vite Config, Build) ...
  // (Paste the rest of the file from the previous version here, starting from step 3 "COPY DASHBOARD ASSETS")
  
  const dashboardSrc = fs.readFileSync(path.join(ACTION_DIR, 'src', 'Dashboard.jsx'), 'utf8');
  const dashboardCss = fs.readFileSync(path.join(ACTION_DIR, 'src', 'dashboard.css'), 'utf8');
  const adjustedDashboardSrc = dashboardSrc.replace("import { previews } from './dashboard.data';", "import { previews } from './dashboard.data.js';");
  fs.writeFileSync(path.join(USER_DIR, 'mm-dashboard.jsx'), adjustedDashboardSrc);
  fs.writeFileSync(path.join(USER_DIR, 'dashboard.css'), dashboardCss);
  const dataFileContent = `export const previews = ${JSON.stringify(dashboardData, null, 2)};`;
  fs.writeFileSync(path.join(USER_DIR, 'dashboard.data.js'), dataFileContent);
  const indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>AI Frontend Previewer</title><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" /><meta http-equiv="Pragma" content="no-cache" /><meta http-equiv="Expires" content="0" /></head><body><div id="root"></div><script type="module" src="/mm-dashboard.jsx?t=${TIMESTAMP}"></script></body></html>`;
  fs.writeFileSync(path.join(USER_DIR, 'index.html'), indexHtml);
  viteInputs['main'] = path.resolve(USER_DIR, 'index.html');
  const viteConfigContent = `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import path from 'path'; export default defineConfig({ root: '${USER_DIR}', plugins: [react()], base: './', build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: ${JSON.stringify(viteInputs)} } }, resolve: { alias: { '/dashboard.css': path.resolve('${USER_DIR}', 'dashboard.css'), 'react': path.resolve('${ACTION_DIR}', 'node_modules', 'react'), 'react-dom': path.resolve('${ACTION_DIR}', 'node_modules', 'react-dom'), 'react/jsx-runtime': path.resolve('${ACTION_DIR}', 'node_modules', 'react/jsx-runtime'), 'react-router-dom': path.resolve('${ACTION_DIR}', 'node_modules', 'react-router-dom'), 'react-router': path.resolve('${ACTION_DIR}', 'node_modules', 'react-router'), '@remix-run/router': path.resolve('${ACTION_DIR}', 'node_modules', '@remix-run/router'), } } });`;
  const configPath = path.join(ACTION_DIR, 'vite.config.mjs');
  fs.writeFileSync(configPath, viteConfigContent);
  try { console.log("📦 Running Vite Build..."); execSync(`"${VITE_BIN}" build --config "${configPath}"`, { stdio: 'inherit' }); console.log("🎉 Dashboard Build Complete!"); } catch (err) { console.error("❌ Build Failed:", err.message); process.exit(1); }
}

buildDashboard();