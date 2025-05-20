// src/ai/flows/comparable-sales-flow.ts
'use server';
/**
 * @fileOverview Comparable Sales Agent for ValuGen
 * Finds and structures recent comparable sales for the subject property using LLM with web search.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { AppraisalCaseFile, AppraisalCaseFileSchema, ComparableSaleSchema } from '@/lib/appraisal-case-file';

// Schema for individual comparable sale - MOVED to appraisal-case-file.ts
// export const ComparableSaleSchema = z.object({ ... });
export type ComparableSale = z.infer<typeof ComparableSaleSchema>; // Keep type alias if needed locally

// Output schema for the flow - aligns with todo.md
export const ComparableSalesOutputSchema = z.object({
  comparableSales: z.array(ComparableSaleSchema),
  searchSummary: z.string().optional().describe("Brief summary of the search process, areas searched, and any challenges encountered."),
});
export type ComparableSalesOutput = z.infer<typeof ComparableSalesOutputSchema>;

// Internal interface for prompt assembly, derived from AppraisalCaseFile
interface ComparableSalesPromptInput {
  subjectPropertyType: string;
  subjectCity: string;
  subjectCounty: string;
  subjectState: string;
  subjectAddress?: string;
  subjectSizeSqFt?: number;
  subjectYearBuilt?: number;
  effectiveDate: string;
  numberOfComps?: number;
}

function assembleComparableSalesPrompt(promptInput: ComparableSalesPromptInput): string {
  const {
    subjectPropertyType,
    subjectCity,
    subjectCounty,
    subjectState,
    subjectSizeSqFt,
    subjectYearBuilt,
    effectiveDate,
    numberOfComps = 5
  } = promptInput;

  return `You are an expert real estate research AI assistant for ${subjectCity}, ${subjectCounty}, ${subjectState}.
Your primary task is to find ${numberOfComps} (aim for 3-5) recent (within 1-3 years of ${effectiveDate}, prioritizing most recent) *SOLD* comparable properties for a ${subjectPropertyType}.

Subject Property Context:
- Location: ${subjectCity}, ${subjectCounty}, ${subjectState}
- Type: ${subjectPropertyType}
- Approximate Size: ${subjectSizeSqFt ? subjectSizeSqFt + ' sq ft' : 'N/A'}
- Approximate Year Built: ${subjectYearBuilt || 'N/A'}
- Effective Date for Recency: ${effectiveDate}

Web Search Strategy:
You **MUST** use the google_search tool extensively.
1.  **Prioritize Official Public Records:**
    *   Search for municipal assessor databases for ${subjectCity} and ${subjectCounty}.
    *   Search MassLandRecords.com for deed information in ${subjectCounty}.
    *   Search MassGIS (Massachusetts Official Website Geo-Information Service) for property sales data.
2.  **Consult Reputable Commercial Listing Sites (for SOLD data only):**
    *   Look for *SOLD* listings on sites like LoopNet, Crexi, CoStar (if public data is accessible via search). Clearly indicate if data is from a listing site and verify it appears genuinely sold.
3.  **Filter for SOLD Properties:** Ensure properties are actually sold, not just listed, for lease, or assessments.
4.  **Prioritize Similarity:** Focus on sales closest in time to ${effectiveDate}, location to ${subjectCity}/${subjectCounty}, and physical characteristics (size: ${subjectSizeSqFt} sq ft, year built: ${subjectYearBuilt}) to the subject.

Example Search Queries to Formulate:
*   "${subjectPropertyType} recent sales ${subjectCity} ${subjectState} public records"
*   "MassLandRecords ${subjectCounty} property sales ${promptInput.subjectAddress || subjectCity}"
*   "Massachusetts Property Sales Viewer ${subjectPropertyType} ${subjectCity} [last 2 years]"
*   "LoopNet ${subjectPropertyType} sold ${subjectCity} ${subjectState}"
*   "Crexi ${subjectPropertyType} sold ${subjectCity} ${subjectState}"
*   "Commercial property sales ${subjectCounty} ${subjectState} [last 2 years]"
*   "Assessor database ${subjectCity} MA property sales"

Data Extraction for Each Comparable Found (MUST Extract all these fields if available):
For each potential comparable property identified as *SOLD* and relevant, you MUST extract the following information into a structured format:
-   **address:** Full street address.
-   **saleDate:** Date of sale (YYYY-MM-DD).
-   **salePrice:** Sale price (numeric, e.g., 1250000).
-   **buildingSizeSqFt:** Building size in square feet (numeric, if applicable).
-   **lotSizeSqFt:** Lot size in square feet (numeric, if applicable).
-   **propertyType:** Specific property type (e.g., "Single-Tenant Retail", "Multi-Tenant Industrial").
-   **yearBuilt:** Year the comparable was built (numeric, if available).
-   **briefDescription:** A brief description of its condition or key features from the listing/record (e.g., "Renovated in 2018, good condition", "Corner lot, high visibility").
-   **source:** The specific source of your information (e.g., "${subjectCity} Assessor Database, Sale ID 123", "LoopNet Listing #XYZ - Sold section, verified YYYY-MM-DD", "MassLandRecords Book A, Page B").
-   **confidenceScore:** Your confidence (0.0 to 1.0) in the accuracy of the data for THIS specific comparable, with public records being higher confidence.
-   **parcelId:** (Optional, but good to include if found with public records) Assessor's Parcel Number.

Output Requirements:
- Your entire response **MUST** be a single JSON object matching the ComparableSalesOutputSchema.
- This object must contain a 'comparableSales' array, where each element is an object matching the ComparableSaleSchema.
- Include a 'searchSummary' string detailing your search process, challenges (e.g., "Limited public sales data for this specific property type in the last year"), and overall confidence.
- If you find fewer than 3 reliable sold comparables after a diligent search, report what you found. Do not invent data or include unreliable listings.

Begin your search and data extraction.
`;
}

// Define the Genkit flow
export const comparableSalesFlow = ai.defineFlow(
  {
    name: 'comparableSalesFlow',
    inputSchema: AppraisalCaseFileSchema, // Takes the full AppraisalCaseFile
    outputSchema: ComparableSalesOutputSchema,
  },
  async (caseFile: AppraisalCaseFile, flowContext?: any) => {
    console.log("Starting comparableSalesFlow with AppraisalCaseFile ID:", caseFile.reportId);

    // Map AppraisalCaseFile to the internal prompt input structure
    const promptInput: ComparableSalesPromptInput = {
      subjectPropertyType: caseFile.propertyDetails?.general?.propertyType || caseFile.propertyType || 'Commercial Property',
      subjectCity: caseFile.city,
      subjectCounty: caseFile.county,
      subjectState: caseFile.state,
      subjectAddress: caseFile.propertyAddress,
      subjectSizeSqFt: caseFile.propertyDetails?.general?.sizeSqFt || caseFile.propertyDetails?.lotSizeSqFt,
      subjectYearBuilt: caseFile.propertyDetails?.general?.yearBuilt || caseFile.propertyDetails?.yearBuilt,
      effectiveDate: caseFile.effectiveDate || new Date().toISOString().split('T')[0],
      numberOfComps: 5, // Can be made configurable if added to AppraisalCaseFile or as a flow option
    };

    const promptText = assembleComparableSalesPrompt(promptInput);

    try {
      const llmResponse = await ai.runPrompt(
        {
          name: 'findComparableSalesPrompt',
          prompt: promptText,
          output: { schema: ComparableSalesOutputSchema, format: 'json' },
        },
        { context: flowContext } 
      );

      if (llmResponse.output) {
        console.log(`Comparable sales search successful. Found ${llmResponse.output.comparableSales?.length || 0} comps.`);
        return {
          comparableSales: llmResponse.output.comparableSales || [],
          searchSummary: llmResponse.output.searchSummary || "Search completed.",
        };
      } else {
        console.warn("Comparable sales flow returned no output from LLM.");
        return {
          comparableSales: [],
          searchSummary: "LLM returned no output for comparable sales search.",
        };
      }
    } catch (error: any) {
      console.error("Error in comparableSalesFlow:", error);
      return {
        comparableSales: [],
        searchSummary: `Error generating comparable sales: ${error.message}`,
      };
    }
  }
);

// The generateComparableSalesWithCaseFile function is no longer needed as the flow now directly takes AppraisalCaseFile.
// The masterReportGenerationFlow will call comparableSalesFlow using runFlow and merge its output. 