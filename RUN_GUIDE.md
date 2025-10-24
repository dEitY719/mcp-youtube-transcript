# How to run...

```bash
bwyoon@SERAPH:.../para/project/mcp-youtube-transcript-mine(main)$ npm install
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.

added 91 packages, and audited 92 packages in 509ms

16 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
bwyoon@SERAPH:.../para/project/mcp-youtube-transcript-mine(main)$ npm run build
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.

> @sinco-lab/mcp-youtube-transcript@0.0.8 build
> tsc && chmod +x dist/*.js

bwyoon@SERAPH:.../para/project/mcp-youtube-transcript-mine(main)$ npx @modelcontextprotocol/inspector node "dist/index.js"
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.
Starting MCP inspector...
⚙️ Proxy server listening on localhost:6277
🔑 Session token: fa0e368d0ab9fd9d426fa60195e4eb54c59d8e100d7ce59e824179b18f6557ff
   Use this token to authenticate requests or set DANGEROUSLY_OMIT_AUTH=true to disable auth

🚀 MCP Inspector is up and running at:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=fa0e368d0ab9fd9d426fa60195e4eb54c59d8e100d7ce59e824179b18f6557ff

🌐 Opening browser...
```