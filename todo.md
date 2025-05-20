# ValuGen AI Appraisal System - Enhancement & Implementation TODO

**Version:** 1.0
**Date:** May 20, 2025

**Objective:** To transform the ValuGen application into a significantly more robust, data-driven, and analytically sophisticated AI-powered commercial real estate appraisal report generator. This involves enhancing existing Genkit flows with proactive web search and deeper analysis, introducing new specialized agents, and refining the overall system architecture for better data consistency and workflow orchestration.

## I. Core Architectural Enhancements

### 1.1. Centralized Dynamic Context: "Appraisal Case File"
    - [x] **Task:** Define a comprehensive Zod schema for an `AppraisalCaseFile` object. This object will serve as the single source of truth for all data related to an appraisal. (Completed: 2024-06-10)
        - **Details:** Include fields for initial user inputs, data retrieved by agents (property details, market stats, comps, zoning info, etc.), AI-generated narratives, confidence scores for data points, and status flags for each section.
        - **Considerations:** This object will be passed through and updated by the orchestrator and individual agent flows.
    - [x] **Task:** Modify the main `generateFullReportAction` in `src/app/actions.ts` to initialize and manage this `AppraisalCaseFile`. (Completed: 2024-06-10)
    - [x] **Task:** Ensure all Genkit flows read from and write to this `AppraisalCaseFile` via the flow's `context` or as direct input/output. (Completed: 2024-06-10, Site Description, Market Analysis, HBU, Executive Summary, Cover Letter, Certification flows refactored)

### 1.2. Orchestrator Meta-Flow
    - [x] **Task:** Design and implement a new primary Genkit flow, e.g., `masterReportGenerationFlow`. (Completed: 2024-06-10)
        - **Responsibilities:**
            - Takes initial `ValuGenFormInput` and the `AppraisalCaseFile`.
            - Sequentially calls individual agent flows (Site Description, Market Analysis, HBU, Valuation Agents, etc.) in the correct order of dependency.
            - Passes the updated `AppraisalCaseFile` to each subsequent flow.
            - Manages error handling and potentially triggers human review checkpoints based on confidence scores or missing critical data.
        - **Integration:** This flow will be called by `generateFullReportAction`. (Completed: 2024-06-10)

### 1.3. Proactive & Specific Tool Usage (Web Search)
    - [x] **Task:** Site Description agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-10)
    - [x] **Task:** Market Analysis agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-11)
    - [x] **Task:** HBU agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-11)
    - [x] **Task:** Executive Summary agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-11)
    - [x] **Task:** Cover Letter agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-11)
    - [x] **Task:** Certification agent prompt updated for proactive web search and specific query examples. (Completed: 2024-06-11)

### 1.4. Confidence Scoring & Human-in-the-Loop (HITL) Mechanism
    - [x] **Task:** Modify Zod output schemas for all data-gathering and analytical agents to include a `confidenceScore` (e.g., 0.0 to 1.0) for key data points and generated narratives. (Completed: 2024-06-10)
    - [x] **Task:** Implement logic in the `masterReportGenerationFlow` or `generateFullReportAction` to flag items with confidence scores below a defined threshold (e.g., < 0.7). (Completed: 2024-06-10)
    - [x] **Task:** Update the `ValuGenForm` UI (`src/components/valu-gen-form.tsx`) to:
        - Display flagged items clearly, indicating they require appraiser review.
        - Allow appraisers to manually verify, edit, or override AI-generated/retrieved data.
        - Provide a mechanism to "approve" flagged items, which updates their status in the `AppraisalCaseFile`. (Completed: 2024-06-10)

### 1.5. Dynamic & Contextual Prompt Engineering
    - [x] **Task:** Refactor agent prompts to be dynamically assembled by the `masterReportGenerationFlow`.
        - [x] HBU agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] Site Description agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] Market Analysis agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] Executive Summary agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] Cover Letter agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] Certification agent prompt now dynamically assembled from AppraisalCaseFile data. (Completed: 2024-06-10)
        - [x] [All major agents now use dynamic prompt assembly.]
        - _Note: Dynamic prompt assembly pattern is now documented for all agents._

### 1.6. Structured Data Outputs as Primary
    - [x] **Task:** For all agents whose primary role is data gathering or analysis (e.g., Site Description, Market Analysis, Comparables Agent, Valuation Agents), ensure their primary output is structured JSON data (defined by Zod schemas). (Completed: 2024-06-11)
        - **Details:** Narrative generation should be a secondary step, ideally performed by a dedicated "Narrative Synthesis Agent" or by the same agent *after* structuring the data.
        - **Benefit:** Allows for more reliable data exchange between agents and easier integration with the UI.

## II. Enhancements to Existing Genkit Flows

### 2.1. Cover Letter Agent (`src/ai/flows/cover-letter-generation.ts`)
    - [x] **Schema Update:** (Completed: 2024-06-11)
        - `CoverLetterInputSchema`: Ensure `appraisedValue` and `effectiveDateOfValue` are clearly marked as fields that will be populated *after* valuation, not initial placeholders.
    - [x] **Prompt Enhancement for Web Search:** (Completed: 2024-06-11)
        - **Instruction:** "If `clientAddressLine1`, `clientAddressLine2`, or `clientCityStateZip` appear to be placeholders, incomplete, or generic (e.g., '123 Main St', 'Anytown, USA'), you **MUST** use web search to find a plausible public address for `clientName`. Prioritize official business websites or reputable directories."
        - **Example Search Queries (for AI to formulate):** "`[clientName]` corporate headquarters address", "`[clientName]` `[city from input if available]` office address".
    - [x] **Dynamic Data Integration:** (Completed: 2024-06-11)
        - **Task:** Modify the flow to expect `appraisedValue` and `effectiveDateOfValue` to be populated in the `AppraisalCaseFile` by the (new) `ReconciliationAgent` before this flow runs.
    - [x] **Confidence Score:** Add confidence score for searched client address. (Completed: 2024-06-11)

### 2.2. Site Description Agent (`src/ai/flows/site-description-generation.ts`)
    - [x] **Schema Update (`SiteDescriptionOutputSchema`):** (Completed: 2024-06-11)
        - Break down `siteDescription` into more granular, structured fields:
            - `parcelId: z.string().optional().describe("Assessor's Parcel Number (APN).")`
            - `legalDescriptionSource: z.string().optional().describe("Source or reference for the legal description, e.g., 'Deed Book X, Page Y' or 'See Addendum'.")`
            - `lotSizeAcres: z.number().optional()`
            - `lotSizeSqFt: z.number().optional()`
            - `lotDimensions: z.string().optional().describe("Approximate dimensions or shape.")`
            - `topography: z.string().optional()`
            - `accessDetails: z.string().optional()`
            - `visibility: z.string().optional()`
            - `zoningCode: z.string().optional().describe("Specific zoning designation, e.g., C-2, R-1.")`
            - `zoningDescription: z.string().optional().describe("Brief description of the zoning category.")`
            - `permittedUsesSummary: z.string().optional().describe("Summary of key permitted uses under the zoning code.")`
            - `keyDimensionalRequirements: z.string().optional().describe("Key restrictions like setbacks, height, FAR.")`
            - `utilitiesAvailable: z.array(z.string()).optional().describe("List of available utilities, e.g., ['Water', 'Sewer', 'Electric', 'Gas'].")`
            - `femaFloodZoneId: z.string().optional().describe("E.g., 'Zone X', 'AE'.")`
            - `femaPanelNumber: z.string().optional()`
            - `femaMapEffectiveDate: z.string().optional()`
            - `easementsObservedOrReported: z.string().optional()`
            - `environmentalConcernsNoted: z.string().optional()`
            - `siteImprovementsNarrative: z.string().optional().describe("Parking, landscaping etc.")`
            - `improvementsSummary: z.object({ type: z.string(), sizeSqFt: z.number().optional(), yearBuilt: z.number().optional(), condition: z.string().optional() }).optional()`
            - `narrativeSummary: z.string().describe("Overall descriptive narrative, synthesized from the above structured data and any unstructurable observations.")`
            - `confidenceScores: z.record(z.number()).optional().describe("Confidence for each key data point, e.g., { parcelId: 0.9, zoningCode: 0.7 }")`
    - [ ] **Prompt Enhancement for Proactive & Specific Web Searches:**
        - **Core Instruction:** "Your primary role is to meticulously research and verify all site characteristics for the property at `{{{address}}}, {{{city}}}, {{{county}}}` using web search. For each item below, formulate specific search queries and report the findings. If data is not found after diligent search, explicitly state that for the specific item and assign a low confidence score."
        - **Parcel ID (APN):** "Search for the APN. Queries: '`{{{county}}} county` parcel viewer `{{{address}}}`', '`{{{city}}} {{{county}}}` property tax records `{{{address}}}`'."
        - **Legal Description:** "Attempt to find a reference to the legal description (e.g., Deed Book/Page). Queries: '`{{{county}}} county` registry of deeds `{{{parcelIdFromPreviousSearch}}}`', 'legal description `{{{address}}}`'."
        - **Lot Size & Dimensions:** "Search for lot size (acres/sq ft) and dimensions. Often found with parcel ID. Queries: (as above for APN)."
        - **Topography:** "Search for topographic information. Queries: '`{{{county}}} county` GIS topographic map `{{{address}}}`', '`{{{city}}}` elevation data `{{{address}}}`'."
        - **Zoning (Critical):**
            - "Identify the specific zoning code. Queries: '`{{{city}}}` zoning map `{{{address}}}`', 'what is the zoning for `{{{address}}}`'."
            - "Once zone code (e.g., 'C-2') is found, research its details. Queries: '`{{{city}}}` zoning ordinance `[identified zone code]` permitted uses', '`{{{city}}}` zoning ordinance `[identified zone code]` setbacks', '`{{{city}}}` zoning ordinance `[identified zone code]` height limit', '`{{{city}}}` zoning ordinance `[identified zone code]` FAR', '`{{{city}}}` zoning ordinance `[identified zone code]` parking requirements'."
        - **Utilities:** "Identify available public utilities. Queries: '`{{{city}}}` public water service area map', '`{{{county}}}` natural gas provider'."
        - **FEMA Flood Zone:** "Determine FEMA flood zone, panel number, and effective date. Queries: 'FEMA flood map `{{{address}}}`', 'FEMA Map Service Center `{{{address}}}`'."
        - **Easements:** "Search for publicly recorded easements. Queries: '`{{{parcelIdFromPreviousSearch}}}` easements `{{{county}}}` public records'." (Acknowledge this is difficult and may yield no results).
        - **Improvements (Basic):** "Find basic improvement details (type, approx. size, year built) if readily available with parcel/tax data. Queries: (as for APN)."
    - [x] **Workflow Integration:** This agent's structured output becomes a primary, verified input source for the HBU Agent, Market Analysis Agent (for neighborhood context), and Executive Summary Agent. (Completed: 2024-06-11)

### 2.3. Market Analysis Agent (`src/ai/flows/market-analysis-generation.ts`)
    - [x] **Schema Update (`MarketAnalysisOutputSchema`):** (Completed: 2024-06-11)
        - Further structure `economicOverview`, `demographicData`, and `marketConditions` into discrete fields.
        - Example for `economicOverview`: `majorIndustries: z.array(z.string())`, `majorEmployers: z.array(z.string())`, `unemploymentRateCounty: z.number().optional()`, `unemploymentRateState: z.number().optional()`, `unemploymentTrend: z.string().optional()`.
        - Example for `marketConditions`: `propertyTypeVacancyRate: z.number().optional()`, `propertyTypeAvgRentalRate: z.string().optional()`, `newConstructionActivity: z.string().optional()`, `absorptionRate: z.string().optional()`.
        - Add confidence scores for key metrics.
    - [x] **Prompt Enhancement for Proactive & Specific Web Searches:** (Completed: 2024-06-11)
        - **Economic Overview:**
            - "Research primary economic drivers for `{{{county}}}` and `{{{city}}}`. Identify 3-5 major industries and key employers. Queries: '`{{{city}}}` economic development report', 'major employers `{{{county}}} {{{state}}}`', 'top industries `{{{city}}} {{{state}}}`'."
            - "Find current unemployment rates for `{{{county}}}` (or MSA) and `{{{state}}}`. Compare to national average if possible. Describe trends over past 12-24 months. Queries: 'BLS unemployment rate `{{{county}}} {{{state}}}`', '`{{{state}}} ` labor statistics'."
            - "Identify significant recent economic developments. Queries: '`{{{city}}} `new business investment news', '`{{{county}}} `economic development projects'."
        - **Demographic Data:**
            - "Find latest estimated population for `{{{city}}}` and `{{{county}}}` with % change from a recent census. Queries: 'data.census.gov `{{{city}}} {{{state}}}` population', '`{{{county}}} {{{state}}}` demographics census reporter'."
            - "Find median household income, per capita income, poverty rates. Queries: 'data.census.gov `{{{city}}} {{{state}}}` income poverty'."
        - **Market Conditions (Tailored to `{{{propertyType}}}`):**
            - "Research current vacancy rates for `{{{propertyType}}}` in `{{{city}}}`/`{{{county}}}`. Discuss trends. Queries: '`{{{city}}} {{{propertyType}}}` market report Q`[current quarter]` `[year]` CBRE OR JLL OR Cushman', '`{{{propertyType}}}` vacancy rate `{{{city}}}`'."
            - "Research average asking rental rates/sales price trends for `{{{propertyType}}}`. Queries: (as above, add 'rental rates', 'sales prices')."
            - "Research new construction activity and absorption for `{{{propertyType}}}`. Queries: (as above, add 'new construction', 'absorption rates')."
            - "Research investor sentiment/cap rate trends for `{{{propertyType}}}`. Queries: '`{{{propertyType}}}` cap rate trends `{{{city}}}` `[year]`', 'commercial real estate investor sentiment `{{{region}}}` `[year]`'."
        - **Preliminary Comparable Sales (Illustrative):**
            - "Find 2-3 recent (last 1-2 years) *sold* examples of `{{{propertyType}}}` in `{{{city}}}` or `{{{county}}}`. Focus on public records or clearly marked 'sold' listings. Provide address/general location, sale date, sale price, size. Queries: '`{{{propertyType}}}` recent sales `{{{city}}} {{{state}}}` public records', '`[commercial listing site]` `{{{propertyType}}}` sold `{{{city}}} {{{state}}}`'."
    - [x] **Workflow Integration:** Feeds structured market data into HBU Agent, Executive Summary Agent, and (new) Valuation Agents. (Completed: 2024-06-11)

### 2.4. HBU Agent (`src/ai/flows/hbu-generation.ts`)
    - [x] **Schema Update:** (Completed: 2024-06-11)
        - `HbuInputSchema`: Expect structured zoning data (code, permitted uses, key dimensional requirements) from `SiteDescriptionOutputSchema`. Expect structured market demand data (for the property type) from `MarketAnalysisOutputSchema`.
    - [x] **Prompt Enhancement for Deeper Analysis & Targeted Web Search:** (Completed: 2024-06-11)
        - **Core Instruction:** "Your primary task is to conduct a Highest and Best Use analysis for `{{{propertyAddress}}}`. Synthesize the detailed zoning information (code: `{{{zoningCode}}}`, permitted uses: `{{{permittedUsesSummary}}}`, dimensional requirements: `{{{keyDimensionalRequirements}}}`) provided by the Site Description Agent, and the market demand insights (e.g., vacancy for `{{{propertyTypeGeneral}}}` is `{{{propertyTypeVacancyRate}}}`) from the Market Analysis Agent.
        - **Targeted Search (if needed):** "If the provided zoning details are insufficient to determine specific permitted uses or critical restrictions (e.g., parking ratios, specific density limits not covered), you **MUST** perform a targeted web search for '`{{{city}}} {{{state}}}` zoning ordinance `{{{zoningCode}}}` full text' or '`{{{city}}} {{{state}}} {{{zoningCode}}}` parking requirements' to clarify these points before concluding legal permissibility."
        - **Analytical Guidance:** "For each of the four tests (Legally Permissible, Physically Possible, Financially Feasible, Maximally Productive), explicitly reference the supporting data from the Site Description and Market Analysis summaries or your own targeted search findings. Your conclusion must be a well-reasoned justification, not just a statement."
    - [x] **Output Schema (`HbuOutputSchema`):** (Completed: 2024-06-11)
        - `hbuAsVacant: z.string().describe("Conclusion for HBU as vacant, with brief rationale.")`
        - `hbuAsImproved: z.string().describe("Conclusion for HBU as improved, with brief rationale.")`
        - `detailedAnalysis: z.object({ legallyPermissible: z.string(), physicallyPossible: z.string(), financiallyFeasible: z.string(), maximallyProductive: z.string() }).describe("Detailed reasoning for each of the four tests, referencing specific data points.")`
        - `confidenceScore: z.number().optional()`

### 2.5. Executive Summary Agent (`src/ai/flows/executive-summary-generation.ts`)
    - [x] **Schema Update (`ExecutiveSummaryInputSchema`):** (Completed: 2024-06-11)
        - Expect highly structured and detailed inputs from `SiteDescriptionOutputSchema`, `MarketAnalysisOutputSchema`, `HbuOutputSchema`, and the (new) `ReconciliationAgentOutputSchema` (for `opinionOfValue` and `valuationApproachesSummary`).
    - [x] **Prompt Enhancement for Synthesis & Targeted Web Search:** (Completed: 2024-06-11)
        - **Core Instruction:** "Synthesize the comprehensive, search-verified findings from the Site Description (parcel ID: `{{{parcelId}}}`, zoning: `{{{zoningCode}}}`, lot size: `{{{lotSizeSqFt}}}sqft, etc.), Market Analysis (county unemployment: `{{{unemploymentRateCounty}}}`, property type vacancy: `{{{propertyTypeVacancyRate}}}`, etc.), HBU (`{{{hbuAsImproved}}}`), and Valuation (`{{{finalReconciledValue}}}`, approaches used: `{{{valuationApproachesUsed}}}`) into a fluent, professional Executive Summary. Weave these specific data points into a cohesive narrative."
        - **Web Search for Assumptions/Conditions:** "If `{{{extraordinaryAssumptions}}}` or `{{{hypotheticalConditions}}}` are 'None' or generic, use web search to verify if this is typical for a `{{{propertyTypeGeneral}}}` appraisal in `{{{city}}}, {{{county}}}`. Queries: 'common extraordinary assumptions commercial appraisal `{{{propertyTypeGeneral}}} {{{city}}}`', 'standard hypothetical conditions `{{{propertyTypeGeneral}}}` appraisal'."
    - [x] **Output Schema (`ExecutiveSummaryOutputSchema`):** (Completed: 2024-06-11)
        - Ensure `executiveSummary` is a single, well-structured string, but internally the prompt should guide the AI to cover all key areas.

### 2.6. Certification Agent (`src/ai/flows/certification-generation.ts`)
    - [x] **Prompt Enhancement for Web Search:** (Completed: 2024-06-11)
        - **Instruction:** "If there is any uncertainty regarding the current standard USPAP wording for certification statements or limiting conditions, or if templates need verification against the *current USPAP edition* (e.g., USPAP 2024-2025), you **MUST** use web search. Queries: 'USPAP `[current edition year]` standard certification text', 'USPAP `[current edition year]` appraiser limiting conditions'."
    - [x] **Dynamic Data Integration:** (Completed: 2024-06-11)
        - All input fields (`reportDate`, `appraiserName`, `appraisedValue`, `effectiveDateOfValue`, etc.) **MUST** be dynamically populated from the `AppraisalCaseFile`.

## III. New Agents/Flows to Develop

### 3.1. Data Extraction & Verification Agent/Tool (Foundation)
    - [x] **Task:** Design `dataExtractionTool` (Genkit Tool). (Completed: 2024-06-11)
        - [x] Initial schema and scaffold implemented in src/ai/flows/data-extraction-tool.ts. (Started: 2024-06-10)
        - **Input:** `address: string, city: string, county: string, state: string`.
        - **Functionality:**
            - Sequentially query (via `google_search` or direct API if available/feasible later) multiple predefined public data sources:
                - County Assessor/Parcel Viewer for `{{{county}}}, {{{state}}}`.
                - County Registry of Deeds for `{{{county}}}, {{{state}}}`.
                - `{{{city}}}, {{{state}}}` official GIS/Zoning map portal.
                - FEMA Flood Map Service Center.
            - Attempt to extract: Owner Name, Parcel ID, Legal Description reference (Book/Page), Lot Size (Acres/SF), Current Zoning Code, Flood Zone ID & Panel.
            - Cross-reference data if multiple sources provide the same info (e.g., parcel ID from assessor vs. GIS).
        - **Output (Zod Schema):** Structured object with extracted data points and their source/confidence.
            - `ownerName: z.string().optional()`, `parcelId: z.string().optional()`, `legalDescriptionRef: z.string().optional()`, `lotSizeAcres: z.number().optional()`, `zoningCodePrimary: z.string().optional()`, `floodZoneData: z.object({ zone: z.string(), panel: z.string(), date: z.string() }).optional()`, `dataSources: z.record(z.string())`, `confidenceScores: z.record(z.number())`.
        - **Integration:** Called early by `masterReportGenerationFlow`. Its output heavily populates the `AppraisalCaseFile` and is a primary input for the `SiteDescriptionAgent`.

### 3.1.B. Local Geodatabase Integration (New Section)
    - [x] **Task:** Discussed strategy for using local MassGIS GDB. (Completed: 2024-06-12)
        - **Decision:** Attempt GDB query first for MA properties. If high confidence, use as primary. Fallback/supplement with web-based `dataExtractionTool` if GDB data is missing, low confidence, or for verification.
    - [x] **Task:** Created `src/ai/tools/local_gis_extractor.py` (Python script with placeholder GDB query logic). (Completed: 2024-06-12)
    - [x] **Task:** Created `src/ai/tools/localGisDataTool.ts` (Genkit tool to execute Python script). (Completed: 2024-06-12)
    - [x] **Task:** Updated `src/lib/appraisal-case-file.ts` (`PropertyDetailsSchema` and `MetaDataSchema`) to accommodate GDB-specific fields and track data sources (GDB, Web). (Completed: 2024-06-12)
    - [x] **Task:** Integrated `localGisDataTool` into `masterReportGenerationFlow.ts` with conditional logic for GDB first, then web fallback/supplementation, and data merging. (Completed: 2024-06-12)
    - [ ] **Task:** Implement actual GDB querying logic within `local_gis_extractor.py` using `geopandas` or similar (requires GDAL with FileGDB driver).
        - **Details:** Focus on robust address matching against `M001Assess` and joining with `M001TaxPar` and lookup tables.
    - [ ] **Task:** Make `GDB_PATH` in `masterReportGenerationFlow.ts` configurable (e.g., environment variable).
    - [ ] **Task:** Test the GDB integration thoroughly with sample MA addresses.

### 3.2. Comparable Sales Agent
    - [x] **Task:** Design `comparableSalesFlow` (Comparable Sales Agent).
        - [x] Initial schema and scaffold implemented in src/ai/flows/comparable-sales-flow.ts. (Started: 2024-06-10)
        - [x] Refactored to be LLM-only using `google_search` for consistency and to accept `AppraisalCaseFile` directly. (Completed: 2024-06-12)
        - **Input:** `AppraisalCaseFile` (containing subject property type, location, size, effective date).
        - **Functionality:**
            - **Targeted Web Search:** "Your primary task is to find 3-5 recent (within last 1-3 years, prioritizing most recent) *sold* comparable properties for a `{{{subjectPropertyType}}}` located in/near `{{{subjectCity}}}, {{{subjectCounty}}}`. Search public records and commercial real estate listing sites (e.g., LoopNet, Crexi - look for 'sold' listings or sales records). Prioritize sales closest in time, location, and physical similarity to the subject (Size: `{{{subjectSizeSqFt}}}`, Year Built: `{{{subjectYearBuilt}}}`)."
            - **Example Search Queries:** "`{{{subjectPropertyType}}}` recent sales `{{{subjectCity}}} {{{subjectState}}}` public records", "`[commercial listing site]` `{{{subjectPropertyType}}}` sold `{{{subjectCity}}} {{{subjectState}}}`", "commercial property sales `{{{subjectCounty}}} {{{subjectState}}}` `[last 2 years]`".
            - **Data Extraction for Each Comp:** "For each potential comparable found, extract: Full Address, Sale Date, Sale Price, Building Size (SF), Lot Size (if available), Property Type, Year Built (if available), and a brief description of its condition or key features from the listing/record. Note the source of your information."
        - **Output (Zod Schema):** `comparableSales: z.array(z.object({ address: z.string(), saleDate: z.string(), salePrice: z.number(), buildingSizeSqFt: z.number().optional(), lotSizeSqFt: z.number().optional(), propertyType: z.string(), yearBuilt: z.number().optional(), briefDescription: z.string(), source: z.string(), confidenceScore: z.number() }))`.
        - **Integration:** Output feeds into `SalesComparisonApproachAgent`.

### 3.3. Valuation Approaches Agents (New Genkit Flows)

#### 3.3.1. Sales Comparison Approach Agent (`salesComparisonApproachFlow`)
    - [ ] **Input:** `AppraisalCaseFile` (subject details, `comparableSales` from `ComparableSalesAgent`). User inputs for specific adjustment factors (e.g., dollar or percentage for location, condition, size, time).
    - [ ] **Functionality:**
        - **Prompt for Adjustments:** "Review the provided comparable sales. For each comparable, determine and apply necessary adjustments for differences in property rights conveyed, financing terms, conditions of sale, market conditions (time), location, physical characteristics (size, age, condition, features), etc., to make them comparable to the subject. Use the appraiser-provided adjustment guidelines/factors. If specific adjustment factors are not provided by the user for a category, note that market-derived adjustments would typically be applied here."
        - **Web Search (Supporting Adjustments - Advanced):** "If justifying a market condition (time) adjustment, search for '`{{{subjectPropertyType}}}` price index `{{{marketArea}}}` `[relevant time period]`' or '`{{{subjectPropertyType}}}` appreciation rate `{{{marketArea}}}`'."
        - **Calculations:** Apply adjustments to each comp's sale price. Calculate adjusted price per SF (or other relevant unit).
        - **Narrative Generation:** Explain the selection of comps, the adjustment process, and the rationale for adjustments. Summarize the range of adjusted values.
    - [ ] **Output (Zod Schema):** `scaOutput: z.object({ indicatedValue: z.number(), adjustmentGrid: z.any().describe("Structured representation of the adjustment grid."), narrative: z.string(), confidenceScore: z.number() })`.
    - [ ] **Integration:** Feeds into `ReconciliationAgent`.

#### 3.3.2. Income Approach Agent (`incomeApproachFlow`)
    - [ ] **Input:** `AppraisalCaseFile` (subject details). User inputs for market rent per SF/unit, vacancy/collection loss %, operating expense line items (or overall ratio), and desired capitalization rate (OAR) or discount rate for DCF.
    - [ ] **Functionality:**
        - **Web Search (Crucial for Market Data):**
            - **Market Rents:** "Research current market rental rates for `{{{subjectPropertyType}}}` in `{{{subjectSubmarket}}}`. Queries: '`{{{subjectPropertyType}}}` office lease rates `{{{subjectCity}}}`', 'industrial rental comps `{{{subjectCounty}}}`'."
            - **Vacancy Rates:** "Find typical vacancy rates for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: '`{{{subjectPropertyType}}}` vacancy trends `{{{subjectCity}}}` `[current year]`'."
            - **Operating Expenses:** "Research typical operating expense ratios or per SF costs for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: 'average operating expenses `{{{subjectPropertyType}}} {{{city}}}` BOMA IREM', '`{{{subjectPropertyType}}}` NNN expenses `{{{region}}}`'."
            - **Capitalization Rates:** "Research current market capitalization rates for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: '`{{{subjectPropertyType}}}` cap rate survey `[year]` PwC CBRE', 'office building cap rates `{{{subjectCity}}}` `[recent sales]`'."
        - **Calculations:** Calculate PGI, EGI, NOI. Apply OAR for Direct Capitalization. If DCF, project cash flows and apply discount rate.
        - **Narrative Generation:** Explain assumptions for income, vacancy, expenses, and cap/discount rate, referencing searched market data. Detail the calculation steps.
    - [ ] **Output (Zod Schema):** `incomeApproachOutput: z.object({ indicatedValue: z.number(), proForma: z.any().describe("Structured pro-forma income statement."), capRateUsed: z.number().optional(), discountRateUsed: z.number().optional(), narrative: z.string(), confidenceScore: z.number() })`.
    - [ ] **Integration:** Feeds into `ReconciliationAgent`.

#### 3.3.3. Cost Approach Agent (`costApproachFlow`) - Optional but Recommended
    - [ ] **Input:** `AppraisalCaseFile` (subject details, site description with land size). User inputs for land value estimate, reproduction/replacement cost new source (e.g., Marshall & Swift, RSMeans - or allow AI to estimate based on type/size/location), and estimates for accrued depreciation (physical, functional, external).
    - [ ] **Functionality:**
        - **Web Search (Supporting Data):**
            - **Land Value:** "If appraiser has not provided a land value, search for recent comparable land sales for `{{{subjectZoningCode}}}` zoned land in `{{{subjectCity}}}`. Queries: 'commercial land sales `{{{subjectCity}}}` `[last year]`', 'industrial lot prices `{{{subjectCounty}}}`'." (This could be its own dedicated "Land Valuation Agent" in a more advanced system).
            - **Construction Costs:** "Research typical construction costs per SF for a `{{{subjectPropertyType}}}` of `{{{subjectQuality}}}` quality in `{{{city}}}, {{{state}}}`. Queries: '`{{{subjectPropertyType}}}` construction cost per sq ft `{{{city}}} {{{state}}}` `[year]`', 'Marshall & Swift building cost estimator `{{{propertyType}}}`'." (Acknowledge direct database access is unlikely, look for summaries/articles).
            - **Depreciation:** "Research typical economic life and depreciation factors for `{{{subjectPropertyType}}}`. Queries: 'economic life `{{{subjectPropertyType}}}` office building', 'functional obsolescence examples `{{{subjectPropertyType}}}`'." (Primarily appraiser expertise, but AI can provide general ranges).
        - **Calculations:** Estimate cost new, subtract depreciation, add land value.
        - **Narrative Generation:** Explain sources for costs, land value, and depreciation estimates.
    - [ ] **Output (Zod Schema):** `costApproachOutput: z.object({ indicatedValue: z.number(), landValue: z.number(), costNew: z.number(), totalDepreciation: z.number(), narrative: z.string(), confidenceScore: z.number() })`.
    - [ ] **Integration:** Feeds into `ReconciliationAgent`.

### 3.4. Reconciliation Agent (`reconciliationFlow`)
    - [ ] **Input:** `AppraisalCaseFile` (containing value indications from `SalesComparisonApproachAgent`, `IncomeApproachAgent`, `CostApproachAgent`). User input for weighting rationale and final value opinion.
    - [ ] **Functionality:**
        - **Prompt for Rationale:** "The Sales Comparison Approach indicated `{{{scaValue}}}`. The Income Approach indicated `{{{incomeValue}}}`. The Cost Approach indicated `{{{costValue}}}`. Please provide your rationale for weighting these approaches and your final concluded market value."
        - **Narrative Generation:** Based on the user's rationale and final value, draft the reconciliation section. "The Sales Comparison Approach yielded... The Income Approach indicated... The Cost Approach suggested... After considering the reliability and applicability of each approach, with greatest weight given to `[User's primary approach]` because `[User's rationale]`, the final opinion of market value is `{{{finalUserValue}}}`."
    - [ ] **Output (Zod Schema):** `reconciliationOutput: z.object({ finalReconciledValue: z.number(), narrative: z.string() })`.
    - [ ] **Integration:** This is a terminal analytical flow. Its `finalReconciledValue` updates the `AppraisalCaseFile` and is used by `CoverLetterAgent` and `ExecutiveSummaryAgent`.

### 3.5. USPAP & Compliance Check Agent (`complianceCheckFlow`)
    - [ ] **Input:** The near-final assembled `AppraisalCaseFile` or the full draft report text.
    - [ ] **Functionality (NLP & Rule-Based):**
        - **Checklist Verification:** "Verify the presence of key USPAP required elements: Stated Intended Use and Users? Definition of Market Value cited? Scope of Work adequate? Certification complete and signed (placeholder)? All three approaches considered or exclusion justified? Reconciliation present? Effective date and report date clear?"
        - **Consistency Checks:** "Cross-reference key data points for consistency: Is the `finalReconciledValue` the same in the Executive Summary, Cover Letter, and Reconciliation? Are property size, address, and effective date consistent across all sections?"
        - **Keyword/Phrase Flagging (Advanced):** "Scan for potentially problematic phrases, unsubstantiated claims, or language that might imply bias. (This is complex and requires careful prompt engineering and possibly fine-tuning)."
    - [ ] **Output (Zod Schema):** `complianceReport: z.object({ checksPassed: z.array(z.string()), potentialIssues: z.array(z.object({ section: z.string(), issue: z.string(), recommendation: z.string() })), overallComplianceScore: z.number().optional() })`.
    - [ ] **Integration:** Run as a final step by `masterReportGenerationFlow` before final output. Results displayed to user for action.

## IV. Genkit Usage Refinements

    - [ ] **Task:** Implement explicit flow chaining in `masterReportGenerationFlow` using `runFlow` or similar Genkit constructs, ensuring the `AppraisalCaseFile` (or relevant parts of it) is passed as context.
    - [ ] **Task:** Where feasible, create more granular Genkit tools (e.g., `fetchFEMADataTool`, `fetchCountyAssessorTool`) that encapsulate specific web search and data parsing logic. These tools can then be called by multiple agents.
    - [ ] **Task:** Enforce structured Zod schemas for all inter-flow data exchange. Narratives should be generated *from* this structured data.
    - [ ] **Task:** Implement robust `try...catch` blocks around all tool calls (especially web searches) and flow executions. Log errors comprehensively. Provide user-friendly error messages in the UI if a flow fails.
    - [ ] **Task:** Design the `generateFullReportAction` and UI to support iterative generation. Users should be able to run a flow, review/edit its structured output (and narrative), and then have subsequent flows use the updated data. This might involve saving intermediate states of the `AppraisalCaseFile`.

## V. UI/UX Considerations (`src/components/valu-gen-form.tsx` and new components)

    - [ ] **Task:** Redesign the main form to be more modular, perhaps using tabs or an accordion for different input sections (Subject Property, Client Info, Assignment Details, Valuation Assumptions).
    - [ ] **Task:** For each generated report section:
        - Display the AI-generated narrative in an editable text area (e.g., a simple Markdown editor or a rich text editor).
        - Display the underlying *structured data* that the narrative was based on (e.g., for Site Description, show the fetched Parcel ID, Zoning Code, Lot Size fields). Allow users to edit this structured data.
        - Clearly indicate `confidenceScore` for data points and sections.
        - Provide a "Regenerate Section" button that re-runs the agent flow using the (potentially edited) current `AppraisalCaseFile` data.
        - Provide an "Approve Section" button to mark it as reviewed and finalized by the appraiser.
    - [ ] **Task:** Create a "Compliance Check" view to display the output from the `ComplianceCheckAgent`, allowing users to address flagged issues.
    - [ ] **Task:** Implement a "Full Report Preview" that assembles all approved sections into a formatted document view.
    - [ ] **Task:** Add a section for managing "Comparable Sales" where users can review AI-suggested comps, add their own, and input adjustment data.
    - [ ] **Task:** Add input sections for Income Approach (rent, vacancy, expenses, cap rate) and Cost Approach (land value, costs, depreciation) parameters.

## VI. Data Sourcing & Management

    - [ ] **Task:** Develop a strategy for managing URLs of common public data sources (e.g., county assessor sites for key operational areas, FEMA portal). This could be a configuration file.
    - [ ] **Task:** For web searches, emphasize queries that lead to official government sources (.gov, .us) or reputable industry data providers first.
    - [ ] **Task:** Implement caching for web search results (for a limited time) to avoid redundant queries during a single session, especially for static data like zoning ordinances. Genkit's state management might assist here.
    - [ ] **Task (Future):** Explore direct API integrations for high-value data sources where feasible and cost-effective (e.g., property data aggregators, MLS RETS feeds if accessible).

## VII. Testing & Validation Strategy

    - [ ] **Task:** Create a suite of test cases with diverse property types and locations.
    - [ ] **Task:** For each agent, define expected outputs (both structured data and narrative quality) for given inputs.
    - [ ] **Task:** Regularly review AI-generated content against actual appraiser-written reports for quality, accuracy, and tone.
    - [ ] **Task:** Implement a feedback loop where appraisers can rate the usefulness/accuracy of AI outputs, which can inform prompt refinement.