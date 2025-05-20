# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## ValuGen Application Overview

ValuGen is an AI-powered commercial real estate appraisal report generator built with Next.js for the frontend and Genkit (using Google's Gemini models) for the backend AI flows.

**Core Functionality:**
The application leverages Large Language Models (LLMs) for:
-   Extracting detailed property information.
-   Identifying and structuring comparable sales data.
-   Generating narrative content for various sections of an appraisal report (e.g., Site Description, Market Analysis, Highest and Best Use, etc.).

## Current Project Status

-   The Next.js (frontend) and Genkit (AI flows) development servers are starting and running successfully.
-   Core report generation capabilities are primarily driven by LLM-based flows defined within the Genkit framework.
-   Significant improvements to error handling have been implemented in the main report orchestration flow (`src/ai/flows/masterReportGenerationFlow.ts`), providing more granular diagnostics for each step of the report generation process.

## Key Changes Made During This Review

-   **Corrected Genkit Plugin Loading:** Ensured all necessary Genkit flows and tools are correctly loaded by addressing missing import statements in `src/ai/dev.ts`.
-   **Configurable Geodatabase Path:** The path for the local MassGIS Geodatabase (`GDB_PATH`), used for extracting property data for Massachusetts properties, has been made configurable via environment variables. This allows users to specify the location of their local GDB file.
-   **Python Dependencies Defined:** A `requirements.txt` file was created to explicitly list Python dependencies (`geopandas`, `fiona`, `playwright`, `pandas`) required for certain data extraction tools.
-   **Enhanced Master Flow Error Handling:** The main report generation orchestrator (`masterReportGenerationFlow.ts`) was updated with more detailed `try...catch` blocks around individual flow and tool executions. This allows for more specific error messages and status updates within the `AppraisalCaseFile` object, improving traceability and debugging.

## Project Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory of the project. This file will store your local environment configuration.

Add the following variables:

```env
# Required: Your Google AI Studio API Key for Gemini Models
GOOGLE_API_KEY="YOUR_GOOGLE_AI_STUDIO_API_KEY"

# Optional: Absolute path to your local MassGIS L3 Parcels geodatabase file.
# Only needed if you intend to use the local GDB extraction feature for properties in Massachusetts.
# Example: /Users/yourname/data/MassGIS_L3_Parcels.gdb
# Example: C:\Users\yourname\data\MassGIS_L3_Parcels.gdb
GDB_PATH=""
```

### 2. Node.js Dependencies

Install the necessary Node.js packages using npm (or yarn):
```bash
npm install
# or
# yarn install
```

### 3. Python Environment Setup

Some data extraction tools in this project rely on Python scripts. Python 3.9 or newer is recommended.

For detailed instructions on setting up your Python virtual environment, installing Python dependencies from `requirements.txt` (including `geopandas`, `fiona`, `playwright`, `pandas`), installing Playwright browsers, and important notes on GDAL (a crucial library for geospatial data processing), please refer to:
```
PYTHON_SETUP_INSTRUCTIONS.MD
```

### 4. Running the Application

-   **Next.js Development Server (Frontend):**
    ```bash
    npm run dev
    ```
    The application will typically be accessible at `http://localhost:9002`.

-   **Genkit Development Server (AI Flows):**
    ```bash
    npm run genkit:dev
    ```
    This server allows for local development, testing, and inspection of the Genkit AI flows.

## Known Issues & Limitations

-   **LLM-Driven Data Extraction Reliability:** The primary tools for property data extraction (`dataExtractionTool`) and comparable sales identification (`comparableSalesFlow`) are currently LLM-driven, relying on general web search capabilities provided to the LLM. The accuracy, completeness, and consistency of the data obtained through these tools are highly dependent on the LLM's ability to effectively use its search tool and interpret the results. This can lead to variability in output.
-   **Unused Python Scrapers:** The project includes a suite of Python web scraping scripts located in the `scripts/` directory, designed for targeted data extraction from specific municipal assessor websites, MassLandRecords, etc. These scripts are **not currently integrated into or used by** the primary Genkit AI flows that generate the appraisal report. Their functionality, including several unimplemented placeholder stubs, does not directly impact the current LLM-based report generation process. They represent a potential avenue for future development to achieve more deterministic data extraction.
-   **Tooling Issue for Logging in Master Flow:** An internal tooling issue was encountered that prevented the successful automated application of code changes (via diffs or full overwrites) for enhancing console logging with `reportId` prefixes in the `src/ai/flows/masterReportGenerationFlow.ts` file. Manual implementation of this logging pattern is recommended if more detailed, request-specific server-side logging is desired for this flow.
-   **Next.js Canary Version:** The project currently uses Next.js version `15.2.3`, which is a canary (pre-release) version. For production environments or to ensure maximum stability, downgrading to the latest stable Next.js release is recommended.
-   **TypeScript/ESLint Errors Ignored in Build:** The Next.js build configuration in `next.config.ts` is currently set to ignore TypeScript and ESLint errors during the build process (`typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`). For better code health, maintainability, and to catch potential issues early, these flags should ideally be set to `false`, and any reported TypeScript or ESLint errors should be addressed.

## Recommendations for Future Improvement

-   **Implement Targeted Data Extraction:** To improve data accuracy and reliability, consider fully implementing and integrating the Python-based web scrapers found in the `scripts/` directory. This would involve:
    -   Completing any unimplemented scraper stubs.
    -   Refactoring the `dataExtractionTool` and `comparableSalesFlow` in Genkit to orchestrate calls to these Python scripts, potentially passing data to them and receiving structured output.
    -   This would shift from purely LLM-driven extraction to a hybrid approach, using scrapers for known, reliable sources and LLMs for broader searches or fallback.
-   **Refined Error Handling in UI Actions:** Enhance user experience by adding specific `try...catch` blocks within the "regenerate" Server Actions located in `src/app/actions.ts`. This will allow for more graceful error feedback to the UI if a Genkit flow fails during regeneration.
-   **Structured Logging Implementation:**
    -   Manually implement the `reportId` prefix logging pattern in `masterReportGenerationFlow.ts` and other relevant flows/tools for better traceability of individual report generation processes in server logs.
    -   For production-grade logging, consider integrating a dedicated logging library (e.g., Winston, Pino) to enable structured logging, configurable log levels, and easier log management.
-   **Resolve TypeScript/ESLint Issues:** Change the `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` flags in `next.config.ts` to `false`. Address all reported linting and type-checking errors to improve code quality and prevent potential runtime issues.
-   **Data Discrepancy Flagging & Resolution:** Implement more sophisticated logic for merging data from different sources (e.g., GDB vs. Web Extracted data vs. user input). This could include mechanisms to identify discrepancies, flag them in the `AppraisalCaseFile`, and potentially present them to the user for review or resolution.
-   **Comprehensive Testing:** Develop a robust testing strategy:
    -   Unit tests for individual helper functions and utility classes.
    -   Integration tests for Genkit flows, mocking tool/LLM responses where appropriate, to verify flow logic.
    -   End-to-end tests for critical user scenarios, including report generation with diverse inputs and edge cases.
-   **Firebase Integration Review:** Evaluate the current use and future plans for Firebase dependencies listed in `package.json`. If they are intended for client-side features (e.g., authentication, Firestore for user data) or future backend capabilities, document their role. If they are not actively used or planned for, consider removing them to simplify the dependency tree.
