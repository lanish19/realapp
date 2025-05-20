# ValuGen AI Appraisal System - TODO V2 (Pending Tasks)

**Version:** 2.0
**Date:** June 12, 2024

**Objective:** This document lists pending tasks for completing the ValuGen enhancement.

## II. Enhancements to Existing Genkit Flows

### 2.2. Site Description Agent (`src/ai/flows/site-description-generation.ts`)
    - [x] **Prompt Enhancement for Proactive & Specific Web Searches:** (Completed: 2024-06-12, Verified existing prompt meets requirements)
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

## III. New Agents/Flows to Develop

### 3.1.B. Local Geodatabase Integration
    - [x] **Task:** Implement actual GDB querying logic within `src/ai/tools/local_gis_extractor.py` using `geopandas` or similar (requires GDAL with FileGDB driver). (Completed: 2024-06-12)
        - **Details:** Focus on robust address matching against `M001Assess` (e.g., `SITE_ADDR`, `ADDR_NUM`, `FULL_STR`, `CITY`) and joining with `M001TaxPar` on `LOC_ID` and relevant lookup tables (`M001_LUT`, `M001UC_LUT`). Extract key fields identified in the GDB inventory.
        - **Data to Extract (Example):**
            - From `M001Assess`: `PROP_ID`, `LOC_ID`, `BLDG_VAL`, `LAND_VAL`, `TOTAL_VAL`, `FY`, `LOT_SIZE`, `LS_DATE`, `LS_PRICE`, `USE_CODE`, `SITE_ADDR`, `ADDR_NUM`, `FULL_STR`, `LOCATION`, `CITY`, `LS_BOOK`, `LS_PAGE`, `ZONING`, `YEAR_BUILT`, `BLD_AREA`, `UNITS`, `RES_AREA`, `STYLE`, `STORIES`, `NUM_ROOMS`, `CAMA_ID`, `TOWN_ID`.
            - From `M001TaxPar` (joined on `LOC_ID`): `MAP_PAR_ID`, `POLY_TYPE`, `SHAPE_Area` (parcel geometry area).
            - From Lookups: `USE_DESC` (from `M001UC_LUT` joined on `USE_CODE`), `CODE_DESC` for other coded fields (from `M001_LUT`).
    - [x] **Task:** Make `GDB_PATH` in `masterReportGenerationFlow.ts` configurable (e.g., environment variable or via `AppraisalCaseFile.metaData.config`). (Completed: 2024-06-12)
    - [ ] **Task:** Test the GDB integration thoroughly with sample MA addresses, including edge cases (address variations, no match found).
    - [x] **Task:** Ensure error handling in `local_gis_extractor.py` is robust (e.g., GDB not found, layer missing, address not found) and returns informative error messages to `localGisDataTool.ts`. (Completed: 2024-06-12)
    - [x] **Task:** Refine confidence scoring in `localGisDataTool.ts` based on the success/failure of GDB query and the completeness of data retrieved. (Completed: 2024-06-12)

### 3.3. Valuation Approaches Agents (New Genkit Flows)

#### 3.3.1. Sales Comparison Approach Agent (`salesComparisonApproachFlow`)
    - [x] **Task:** Implement `src/ai/flows/sales-comparison-approach-flow.ts`. (Completed: 2024-06-13 - Initial structure, schemas, prompt, and flow definition. Schema for `adjustmentGrid` refined, web search enabled, prompt reviewed.)
    - [x] **Input:** `AppraisalCaseFile` (subject details, `comparableSales` from `ComparableSalesAgent`). User inputs for specific adjustment factors (e.g., dollar or percentage for location, condition, size, time). (Completed: 2024-06-13 - Handled via `adjustmentGuidelines` in `SalesComparisonApproachInputSchema` populated from `formInput` in `masterReportGenerationFlow`)
    - [x] **Functionality:** (Completed: 2024-06-13 - Prompt refined, web search enabled for supporting adjustments.)
        - **Prompt for Adjustments:** "Review the provided comparable sales. For each comparable, determine and apply necessary adjustments for differences in property rights conveyed, financing terms, conditions of sale, market conditions (time), location, physical characteristics (size, age, condition, features), etc., to make them comparable to the subject. Use the appraiser-provided adjustment guidelines/factors. If specific adjustment factors are not provided by the user for a category, note that market-derived adjustments would typically be applied here."
        - **Web Search (Supporting Adjustments - Advanced):** "If justifying a market condition (time) adjustment, search for '`{{{subjectPropertyType}}}` price index `{{{marketArea}}}` `[relevant time period]`' or '`{{{subjectPropertyType}}}` appreciation rate `{{{marketArea}}}`'."
        - **Calculations:** Apply adjustments to each comp's sale price. Calculate adjusted price per SF (or other relevant unit).
        - **Narrative Generation:** Explain the selection of comps, the adjustment process, and the rationale for adjustments. Summarize the range of adjusted values.
    - [x] **Output (Zod Schema):** `scaOutput: z.object({ indicatedValue: z.number(), adjustmentGrid: z.array(AdjustedComparableSchema), narrative: z.string(), confidenceScore: z.number() })`. (Completed: 2024-06-13 - `adjustmentGrid` now uses `AdjustedComparableSchema` with `AdjustmentDetailSchema`)
    - [x] **Integration:** Feeds into `ReconciliationAgent`. (Completed: 2024-06-12 - Integrated into `masterReportGenerationFlow`)

#### 3.3.2. Income Approach Agent (`incomeApproachFlow`)
    - [x] **Task:** Implement `src/ai/flows/income-approach-flow.ts`. (Completed: 2024-06-13 - Initial structure, schemas, prompt, and flow definition. Schema for `proForma` refined, web search enabled, prompt reviewed.)
    - [x] **Input:** `AppraisalCaseFile` (subject details). User inputs for market rent per SF/unit, vacancy/collection loss %, operating expense line items (or overall ratio), and desired capitalization rate (OAR) or discount rate for DCF. (Completed: 2024-06-13 - Handled via `incomeApproachUserInputs` in `IncomeApproachInputSchema` populated from `formInput` in `masterReportGenerationFlow`)
    - [x] **Functionality:** (Completed: 2024-06-13 - Prompt emphasizes web search for market data, calculations, and narrative.)
        - **Web Search (Crucial for Market Data):**
            - **Market Rents:** "Research current market rental rates for `{{{subjectPropertyType}}}` in `{{{subjectSubmarket}}}`. Queries: '`{{{subjectPropertyType}}}` office lease rates `{{{subjectCity}}}`', 'industrial rental comps `{{{subjectCounty}}}`'."
            - **Vacancy Rates:** "Find typical vacancy rates for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: '`{{{subjectPropertyType}}}` vacancy trends `{{{subjectCity}}}` `[current year]`'."
            - **Operating Expenses:** "Research typical operating expense ratios or per SF costs for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: 'average operating expenses `{{{subjectPropertyType}}} {{{city}}}` BOMA IREM', '`{{{subjectPropertyType}}}` NNN expenses `{{{county}}}`'."
            - **Capitalization Rates:** "Research current market capitalization rates for `{{{subjectPropertyType}}}` in `{{{subjectMarketArea}}}`. Queries: '`{{{subjectPropertyType}}}` cap rate survey `[year]` PwC CBRE', 'office building cap rates `{{{subjectCity}}}` `[recent sales]`'."
        - **Calculations:** Calculate PGI, EGI, NOI. Apply OAR for Direct Capitalization. If DCF, project cash flows and apply discount rate.
        - **Narrative Generation:** Explain assumptions for income, vacancy, expenses, and cap/discount rate, referencing searched market data. Detail the calculation steps.
    - [x] **Output (Zod Schema):** `incomeApproachOutput: z.object({ indicatedValue: z.number(), proForma: ProFormaSchema.optional(), capRateUsed: z.number().optional(), discountRateUsed: z.number().optional(), narrative: z.string(), confidenceScore: z.number() })`. (Completed: 2024-06-13 - `proForma` now uses specific `ProFormaSchema`)
    - [x] **Integration:** Feeds into `ReconciliationAgent`. (Completed: 2024-06-12 - Integrated into `masterReportGenerationFlow`)

#### 3.3.3. Cost Approach Agent (`costApproachFlow`) - Optional but Recommended
    - [x] **Task:** Implement `src/ai/flows/cost-approach-flow.ts`. (Completed: 2024-06-13 - Initial structure, schemas, prompt, and flow definition. Output schema refined for detailed components, web search enabled, prompt reviewed.)
    - [x] **Input:** `AppraisalCaseFile` (subject details, site description with land size). User inputs for land value estimate, reproduction/replacement cost new source, and estimates for accrued depreciation. (Completed: 2024-06-13 - Handled via `costApproachUserInputs` in `CostApproachInputSchema` populated from `formInput` in `masterReportGenerationFlow`)
    - [x] **Functionality:** (Completed: 2024-06-13 - Prompt emphasizes web search for supporting data, calculations, and narrative.)
        - **Web Search (Supporting Data):**
            - **Land Value:** "If appraiser has not provided a land value, search for recent comparable land sales for `{{{subjectZoningCode}}}` zoned land in `{{{subjectCity}}}`. Queries: 'commercial land sales `{{{subjectCity}}}` `[last year]`', 'industrial lot prices `{{{subjectCounty}}}`'." (This could be its own dedicated "Land Valuation Agent" in a more advanced system).
            - **Construction Costs:** "Research typical construction costs per SF for a `{{{subjectPropertyType}}}` of `{{{subjectQuality}}}` quality in `{{{city}}}, {{{state}}}`. Queries: '`{{{subjectPropertyType}}}` construction cost per sq ft `{{{city}}} {{{state}}}` `[year]`', 'Marshall & Swift building cost estimator `{{{propertyType}}}`'." (Acknowledge direct database access is unlikely, look for summaries/articles).
            - **Depreciation:** "Research typical economic life and depreciation factors for `{{{subjectPropertyType}}}`. Queries: 'economic life `{{{subjectPropertyType}}}` office building', 'functional obsolescence examples `{{{subjectPropertyType}}}`'." (Primarily appraiser expertise, but AI can provide general ranges).
        - **Calculations:** Estimate cost new, subtract depreciation, add land value.
        - **Narrative Generation:** Explain sources for costs, land value, and depreciation estimates.
    - [x] **Output (Zod Schema):** `costApproachOutput: z.object({ indicatedValueByCA: z.number(), estimatedLandValue: z.number().optional(), landValueSource: z.string().optional(), reproductionReplacementCostNew: z.object(...).optional(), depreciationDetails: DepreciationDetailsSchema.optional(), totalAccruedDepreciation: z.number().optional(), narrative: z.string(), confidenceScore: z.number() })`. (Completed: 2024-06-13 - Output schema now includes `landValueSource`, detailed `reproductionReplacementCostNew` object, and `DepreciationDetailsSchema`)
    - [x] **Integration:** Feeds into `ReconciliationAgent`. (Completed: 2024-06-12 - Integrated into `masterReportGenerationFlow`)

### 3.4. Reconciliation Agent (`reconciliationFlow`)
    - [x] **Task:** Implement `src/ai/flows/reconciliation-flow.ts`. (Completed: 2024-06-13 - Initial structure, schemas, prompt, and flow definition. Verified escaping in prompt and integration into master flow.)
    - [x] **Input:** `AppraisalCaseFile` (containing value indications from `SalesComparisonApproachAgent`, `IncomeApproachAgent`, `CostApproachAgent`). User input for weighting rationale and final value opinion. (Completed: 2024-06-13 - Handled by `assembleReconciliationPrompt` using data from `AppraisalCaseFile`)
    - [x] **Functionality:** (Completed: 2024-06-13 - Implemented in `reconciliationFlow` and `assembleReconciliationPrompt`)
        - **Prompt for Rationale:** "The Sales Comparison Approach indicated `{{{scaValue}}}`. The Income Approach indicated `{{{incomeValue}}}`. The Cost Approach indicated `{{{costValue}}}`. Please provide your rationale for weighting these approaches and your final concluded market value."
        - **Narrative Generation:** Based on the user's rationale and final value, draft the reconciliation section. "The Sales Comparison Approach yielded... The Income Approach indicated... The Cost Approach suggested... After considering the reliability and applicability of each approach, with greatest weight given to `[User's primary approach]` because `[User's rationale]`, the final opinion of market value is `{{{finalUserValue}}}`."
    - [x] **Output (Zod Schema):** `reconciliationOutput: z.object({ finalReconciledValue: z.number(), narrative: z.string() })`. (Completed: 2024-06-13 - `ReconciliationOutputSchema` defines `reconciledValue`, `narrative`, `confidenceScore`, `sources`)
    - [x] **Integration:** This is a terminal analytical flow. Its `finalReconciledValue` updates the `AppraisalCaseFile` and is used by `CoverLetterAgent` and `ExecutiveSummaryAgent`. (Completed: 2024-06-13 - Integration in `masterReportGenerationFlow` confirmed and refined)

### 3.5. USPAP & Compliance Check Agent (`complianceCheckFlow`)
    - [x] **Task:** Implement `src/ai/flows/compliance-check-flow.ts`. (Completed: 2024-06-13 - Initial structure, schemas, prompt, and flow definition. Corrected data paths in prompt.)
    - [x] **Input:** The near-final assembled `AppraisalCaseFile` or the full draft report text. (Completed: 2024-06-13 - `ComplianceCheckInputSchema` defined using `AppraisalCaseFileSchema`)
    - [x] **Functionality (NLP & Rule-Based):** (Completed: 2024-06-13 - Implemented in `complianceCheckFlow` and `assembleComplianceCheckPrompt`)
        - Define a set of USPAP checklist items (e.g., presence of appraiser signature, correct effective date, necessary certifications, identification of client and intended users, scope of work disclosure, etc.).
        - Use LLM to semantically check the report content against these items.
        - Flag potential omissions or inconsistencies.
        - **Example checks:** "Is the effective date of appraisal clearly stated and consistent?", "Does the certification include all required statements?", "Is the scope of work adequately described?"
    - [x] **Output (Zod Schema):** `complianceOutput: z.object({ checklist: z.record(z.object({ status: z.enum(['Pass', 'Fail', 'Verify']), finding: z.string() })), overallAssessment: z.string() })`. (Completed: 2024-06-13 - `ComplianceCheckOutputSchema` defined; stored in `AppraisalCaseFile.complianceCheckOutput`)
    - [x] **Integration:** A final review step. Could potentially gate report finalization. (Completed: 2024-06-13 - Integrated into `masterReportGenerationFlow` as the last analytical step.)

## IV. UI & User Experience (Review & Refine)

### 4.1. Confidence Scoring & Human-in-the-Loop (HITL) Display
    - [ ] **Task:** Review and refine the `ValuGenForm` UI (`