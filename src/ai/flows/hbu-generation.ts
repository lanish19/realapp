// src/ai/flows/hbu-generation.ts
'use server';
/**
 * @fileOverview Generates the Highest & Best Use (HBU) analysis for an appraisal report.
 * Relies on outputs from Site Description and Market Analysis agents.
 * **Must use web search** to find specific zoning codes, permitted uses, and restrictions for the subject property if not clearly provided or to verify details.
 *
 * - generateHbu - A function that generates the HBU analysis.
 * - HbuInput - The input type for the generateHbu function.
 * - HbuOutput - The return type for the generateHbu function.
 */

import {ai} from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const HbuInputSchema = z.object({
  siteDescriptionSummary: z.string().describe('A comprehensive summary of the site description, derived from web search by the Site Description Agent. This includes physical characteristics, improvements, and any initial zoning information found.'),
  marketOverviewSummary: z.string().describe('A comprehensive summary of the market overview, derived from web search by the Market Analysis Agent. This includes economic, demographic, and real estate market trends.'),
  propertyAddress: z.string().describe('The full street address of the property.'),
  city: z.string().describe('The city where the property is located.'),
  county: z.string().describe('The county where the property is located.'),
  propertyTypeGeneral: z.string().optional().describe('A general classification of the property type to help guide analysis.'),
});
export type HbuInput = z.infer<typeof HbuInputSchema>;

const HbuOutputSchema = z.object({
  hbuAsVacant: z.string().describe("Conclusion for HBU as vacant, with brief rationale."),
  hbuAsImproved: z.string().describe("Conclusion for HBU as improved, with brief rationale."),
  detailedAnalysis: z.object({
    legallyPermissible: z.string(),
    physicallyPossible: z.string(),
    financiallyFeasible: z.string(),
    maximallyProductive: z.string(),
  }).describe("Detailed reasoning for each of the four tests, referencing specific data points."),
  narrativeSummary: z.string().describe("Synthesized narrative of the HBU analysis, covering As Vacant, As Improved, and key findings from the four tests."),
  confidenceScore: z.number().optional(),
});
export type HbuOutput = z.infer<typeof HbuOutputSchema>;

export async function generateHbu(input: HbuInput): Promise<HbuOutput> {
  return hbuFlow(input);
}

export async function generateHbuWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: HbuInput = {
    siteDescriptionSummary: caseFile.narratives?.siteDescription || '',
    marketOverviewSummary: caseFile.narratives?.marketAnalysis || '',
    propertyAddress: caseFile.propertyAddress,
    city: caseFile.city,
    county: caseFile.county,
    propertyTypeGeneral: caseFile.propertyDetails?.general?.propertyType || undefined,
  };
  const result = await hbuFlow(input, { caseFile });
  return {
    narratives: {
      ...caseFile.narratives,
      hbuAnalysis: result.narrativeSummary,
    },
  };
}

// New: Dynamic prompt assembly function
function assembleHbuPrompt(caseFile: AppraisalCaseFile): string {
  const propertyAddress = caseFile.propertyAddress || '[Property Address Not Found]';
  const city = caseFile.city || '[City Not Found]';
  const state = caseFile.state || 'MA'; // Default to MA
  const county = caseFile.county || '[County Not Found]';
  const propertyTypeGeneral = caseFile.propertyDetails?.type || '[General Property Type Not Found]';

  // Data expected from SiteDescriptionOutputSchema / DataExtractionOutputSchema
  const parcelId = caseFile.propertyDetails?.parcelId || '[Parcel ID Not Found]';
  const zoningCode = caseFile.propertyDetails?.zoningCodePrimary || caseFile.propertyDetails?.zoningCode || '[Zoning Code Not Found]';
  const zoningDescription = caseFile.propertyDetails?.zoningDescription || '[Zoning Description Not Found]';
  const permittedUsesSummary = caseFile.propertyDetails?.permittedUsesSummary || '[Permitted Uses Summary Not Found]';
  const keyDimensionalRequirements = caseFile.propertyDetails?.keyDimensionalRequirements || '[Key Dimensional Requirements Not Found]';
  const lotSizeSqFt = caseFile.propertyDetails?.lotSizeSqFt || '[Lot Size Not Found]';
  const siteDescriptionNarrative = caseFile.narratives?.siteDescription || "No detailed site description provided beyond structured data.";

  // Data expected from MarketAnalysisOutputSchema
  const marketPropertyTypeVacancyRate = caseFile.marketData?.propertyTypeVacancyRate !== undefined ? `${caseFile.marketData.propertyTypeVacancyRate * 100}%` : '[Property Type Vacancy Rate Not Found]';
  const marketDemandIndicators = caseFile.marketData?.narrativeSummary || "No specific market demand indicators provided beyond structured data."; // Or more specific fields if available

  return `You are an expert real estate appraiser AI assistant specializing in Highest and Best Use (HBU) analysis for properties in Eastern Massachusetts.

Your task is to conduct a Highest and Best Use analysis for the property located at: ${propertyAddress}, ${city}, ${county}, ${state}.
General Property Type: ${propertyTypeGeneral}
Parcel ID: ${parcelId}
Lot Size: ${lotSizeSqFt} sq ft (approx.)

**Provided Site Information (derived from prior data extraction/site description):**
Zoning Code: ${zoningCode}
Zoning Description: ${zoningDescription}
Permitted Uses Summary (from initial check): ${permittedUsesSummary}
Key Dimensional Requirements (from initial check): ${keyDimensionalRequirements}
Full Site Description Narrative Context: "${siteDescriptionNarrative}"

**Provided Market Information (derived from prior market analysis):**
Market Vacancy Rate for ${propertyTypeGeneral}: ${marketPropertyTypeVacancyRate}
Market Demand Summary Context: "${marketDemandIndicators}"

You MUST explicitly and sequentially address each of the four HBU tests: (1) Legally Permissible, (2) Physically Possible, (3) Financially Feasible, (4) Maximally Productive.

For each test, reference specific data from the provided site and market information. **If any data required to make a determination (especially regarding detailed zoning regulations or specific market demand for potential uses) is missing, unclear, generic, or seems insufficient from the provided summaries, you MUST use the google_search tool to find it from authoritative sources.**

**Web Search Guidance for HBU Analysis (Prioritize these sources):**
*   **Legally Permissible - Zoning Details:**
    *   If '${zoningCode}' is generic or details like '${permittedUsesSummary}' or '${keyDimensionalRequirements}' are insufficient:
        1.  Confirm the specific zoning code for ${propertyAddress} by simulating a search on the **official ${city}, MA Zoning Map or GIS Portal.** (Query: "${city} MA official GIS zoning map for ${propertyAddress}")
        2.  Once the precise code is confirmed, consult the **official ${city}, MA Zoning Ordinance/Bylaw document** for that specific zone. (Query: "${city} MA zoning ordinance text for zone '[Confirmed Zone Code]' permitted uses", or "... dimensional requirements", "... parking requirements")
    *   Also consider subdivision regulations, building codes, environmental regulations (e.g., wetlands, historical, if indicated by site description), and private restrictions (e.g., deed restrictions, if any were noted from prior deed search).
*   **Physically Possible:** Relate to lot size (${lotSizeSqFt} sq ft), shape, topography, access, availability of utilities (as per site description).
*   **Financially Feasible - Market Demand & Viability:**
    *   For potential legally permissible and physically possible uses, research their market demand and financial viability in ${city}/${county}.
    *   Consider data from specialized sources like Regional Planning Agencies (MAPC, MVPC, OCPC), Commercial Real Estate Organizations (NAIOP MA, GBREB), or Economic Development reports for ${city}/${county} that might have been surfaced by the Market Analysis agent. If not detailed enough in summaries, simulate targeted searches.
    *   Example Queries: "Market demand for [potential use, e.g., 'small office space'] in ${city} MA", "Vacancy rates for ${propertyTypeGeneral} in ${county} [from NAIOP/GBREB/Brokerage reports if mentioned in market summary]", "Rental rates for [potential use] ${city} MA".
*   **Maximally Productive:** Determine which financially feasible use produces the highest value or return.

For each of the four tests, provide a detailed rationale, referencing the provided data or your specific web search findings (including the query and source). If you cannot find a specific data point after diligent search, state so, assign a low confidence score for that aspect, and proceed with a reasoned assumption based on typical patterns for Eastern Massachusetts, clearly identifying it as an assumption.

**Output Format (JSON):**
-   `hbuAsVacant`: Your conclusion for HBU as vacant, with rationale.
-   `hbuAsImproved`: Your conclusion for HBU as improved, with rationale.
-   `detailedAnalysis`: An object with keys: `legallyPermissible`, `physicallyPossible`, `financiallyFeasible`, `maximallyProductive`. Each value should be a string containing your detailed reasoning for that test, referencing specific data points from site/market summaries or your own targeted search findings (including specific queries and cited sources like "${city} Zoning Bylaw Section X.Y").
-   `narrativeSummary`: After populating all other fields, synthesize a comprehensive narrative summary of your HBU analysis. This should flow logically, covering the four tests, the conclusions for HBU as vacant and as improved, and the overall reasoning. This narrative is for the main appraisal report.
-   `confidenceScore`: Your overall confidence (0.0-1.0) in the HBU conclusion, based on the reliability and completeness of the data for all four tests.

Be explicit, cite your sources or search queries, and do not skip any step.
`;
}

// Refactored: Use dynamic prompt assembly in the flow
const hbuPrompt = ai.definePrompt({
  name: 'hbuPrompt',
  input: {schema: HbuInputSchema},
  output: {schema: HbuOutputSchema},
  prompt: '', // Will be set dynamically
});

export const hbuFlow = ai.defineFlow(
  {
    name: 'hbuFlow',
    inputSchema: HbuInputSchema,
    outputSchema: HbuOutputSchema,
  },
  async (input: HbuInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleHbuPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...hbuPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        console.error('HbuFlow: LLM returned no output.');
        // Return a default/error structure conforming to HbuOutputSchema
        return {
          hbuAsVacant: "Error: LLM returned no output.",
          hbuAsImproved: "Error: LLM returned no output.",
          detailedAnalysis: {
            legallyPermissible: "Error",
            physicallyPossible: "Error",
            financiallyFeasible: "Error",
            maximallyProductive: "Error",
          },
          narrativeSummary: "Error: LLM returned no output for HBU analysis.",
          confidenceScore: 0,
        };
      }
      return output;
    } catch (error: any) {
      console.error("Error in hbuFlow:", error);
      // Return a default/error structure conforming to HbuOutputSchema
      return {
        hbuAsVacant: `Error: ${error.message}`,
        hbuAsImproved: `Error: ${error.message}`,
        detailedAnalysis: {
          legallyPermissible: "Error processing HBU",
          physicallyPossible: "Error processing HBU",
          financiallyFeasible: "Error processing HBU",
          maximallyProductive: "Error processing HBU",
        },
        narrativeSummary: `Error in HBU Flow: ${error.message}`,
        confidenceScore: 0,
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
