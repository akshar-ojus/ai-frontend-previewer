require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const FILES = process.argv.slice(2);
const OUTPUT_PATH = './analysis.json';

if (FILES.length === 0) {
  console.error("❌ No files provided to analyze.");
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- STEP 1: GATHER GLOBAL CONTEXT ---
let projectContext = "Unknown React Application";

try {
  if (fs.existsSync('package.json')) {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    projectContext = `Project Name: "${pkg.name || 'Unnamed'}"\nDescription: "${pkg.description || ''}"`;
    const deps = Object.keys(pkg.dependencies || {}).join(', ');
    projectContext += `\nKey Libraries: ${deps}`;
  }
  if (fs.existsSync('README.md')) {
    const readme = fs.readFileSync('README.md', 'utf8');
    projectContext += `\n\nREADME Summary:\n${readme.substring(0, 3000)}...`;
  }
} catch (e) {
  console.warn("⚠️ Could not read project context files.");
}

async function analyzeAll() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel(
    { model: "gemini-2.5-flash" },
    { apiVersion: "v1beta" }
  );

  const masterAnalysis = {};

  console.log(`🧠 Starting Context-Aware Analysis for ${FILES.length} files...`);

  for (const filePath of FILES) {
    if (!fs.existsSync(filePath)) continue;

    try {
      console.log(`   👉 Analyzing: ${filePath}`);
      const code = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath);
      const isTS = filePath.endsWith('.tsx');

      // --- STEP 2: CONSTRUCT PROMPT ---
      const prompt = `
        You are a Full-Stack Data Mocking Expert. Your job is to produce a JSON object with realistic mock data so a React component can be rendered in isolation.
        
        PROJECT CONTEXT:
        ${projectContext}

        TARGET COMPONENT:
        Filename: "${filename}"
        Is TypeScript: ${isTS}

        YOUR TASKS:
        1. **Props:** Read all props the component uses (from its function signature, destructuring, or PropTypes). For EVERY prop, produce a realistic mock value. The "props" field must be a flat object like { "propName": <actual value> }. DO NOT leave it empty or use placeholder text like "...". If the component has no props, output {}.
        2. **Wrappers:** Detect if the component uses react-router hooks/components (set router:true), Redux hooks (set redux:true), or React Query (set query:true).
        3. **Network Mocks:** Find EVERY SINGLE fetch/axios/api call in the component, including those inside Promise.all(). For each one, generate a separate entry in 'network_mocks'. Infer the response shape from how the returned data is used in JSX (e.g. if code does response.data.user.name, the mock response must be { data: { user: { name: "Alice" } } }). Use the last segment of the URL path as the url_pattern (e.g. "/tasks", "/projects", "/team-members"). If a call returns an array (e.g. setTasks(data)), the response must be an array with 2-3 items.

        STRICT GUIDELINES:
        - All string values must be realistic (real-looking names, dates like "2026-03-09", prices like 29.99, image URLs from https://placehold.co or https://ui-avatars.com).
        - Arrays must contain at least 2-3 realistic items.
        - Never output empty objects for props if the component has props.
        - **children prop:** If the component accepts a 'children' prop, generate a realistic HTML string (not JSX) based on what this component is used for in the project. For example, if this is a Modal in a task manager, children should look like a task detail form with real field values — NOT generic filler like "This is some detailed content". Use the PROJECT CONTEXT above to determine what domain-specific content belongs here.
        - NEVER use generic placeholder phrases like "This is some content", "Lorem ipsum", "Some text here", or "...". Every value must reflect the actual purpose of this project.
        - Output ONLY the JSON object below — no explanation, no markdown fences.
        
        OUTPUT FORMAT (strict JSON, no other text):
        {
          "props": { "propName": <realistic value>, ... },
          "wrappers": { "router": false, "redux": false, "query": false },
          "network_mocks": [
             { "url_pattern": "/api/example", "method": "GET", "response": { ... } }
          ]
        }

        COMPONENT CODE:
        ${code}
      `;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });
      const rawText = result.response.text();

      // Robust JSON extraction: strip fences and find the outermost { ... } block
      let text = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.slice(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        console.error(`   ❌ JSON parse failed for ${filePath}. Raw response:\n${rawText}`);
        throw parseErr;
      }
      masterAnalysis[filePath] = parsed;

      if (FILES.length > 1) {
        process.stdout.write("      (Waiting 4s to avoid rate limit...)\n");
        await sleep(4000); 
      }

    } catch (err) {
      console.error(`   ❌ Failed to analyze ${filePath}: ${err.message}`);
      masterAnalysis[filePath] = { props: {}, wrappers: {}, network_mocks: [] }; 
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(masterAnalysis, null, 2));
  console.log(`✅ Analysis complete!`);
}

analyzeAll();