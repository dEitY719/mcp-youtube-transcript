# GEMINI.md

## Project Overview

This project is a Model Context Protocol (MCP) server that retrieves transcripts from YouTube videos. It's a TypeScript-based Node.js application designed to be used as a tool by AI models like Gemini, enabling them to access and process YouTube video content. The server exposes a single tool, `get_transcripts`, which takes a YouTube video URL or ID and returns the video's title and transcript.

The project is published as an npm package under `@sinco-lab/mcp-youtube-transcript`.

## Key Files

*   `README.md`: Provides a comprehensive overview of the project, including features, installation instructions, usage examples, and API reference.
*   `package.json`: Defines the project's metadata, dependencies, and scripts. Key dependencies include `@modelcontextprotocol/sdk` for MCP server implementation and `zod` for input validation.
*   `tsconfig.json`: The TypeScript configuration file, specifying compiler options for the project.
*   `src/index.ts`: The main entry point of the application. It sets up the MCP server, defines the `get_transcripts` tool, and handles the server's lifecycle.
*   `src/youtube.ts`: Contains the core logic for interacting with YouTube. This includes fetching video information (like the title), extracting video IDs from various URL formats, and fetching and parsing the raw transcript data.

## Building and Running

### Prerequisites

*   Node.js (version 18 or higher)

### Installation

To install the dependencies, run:

```bash
npm install
```

### Building the Project

To compile the TypeScript code into JavaScript, run the following command. The compiled output will be placed in the `dist` directory.

```bash
npm run build
```

This command runs `tsc` to transpile the code and then makes the output files executable.

### Running the Server

The server is designed to be run as a standalone executable. After building, you can run it directly:

```bash
node dist/index.js
```

For development and testing, you can use the MCP Inspector to interact with the server:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Development Conventions

*   **Language**: The project is written in TypeScript.
*   **Framework**: It uses the `@modelcontextprotocol/sdk` to create an MCP server.
*   **Input Validation**: The `get_transcripts` tool uses `zod` for robust input validation.
*   **Code Style**: The codebase is formatted according to standard TypeScript conventions.
*   **Modularity**: The core YouTube-related logic is separated into the `src/youtube.ts` module, promoting code organization and reusability.
*   **Error Handling**: The application includes specific error classes like `YouTubeTranscriptError` to handle issues related to fetching or processing transcripts gracefully.
