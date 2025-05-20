// src/ai/flows/sales-comparison-approach-flow.ts
'use server';
/**
 * @fileOverview Sales Comparison Approach (SCA) flow.
 * This flow takes subject property details and comparable sales data from the AppraisalCaseFile.
 * It guides the AI to determine and apply adjustments to the comparables,
 * calculate an indicated value for the subject property, and generate a supporting narrative.
 */

import { ai } from '@/ai/genkit';
import { googleSearch } from '@genkit-ai/google-vertexai';
import { z } from 'zod';
import { AppraisalCaseFileSchema, AppraisalCaseFile, ComparableSaleSchema, ComparableSale } from '@/lib/appraisal-case-file';

// Define input schema for the SCA flow
// It will primarily operate on the AppraisalCaseFile passed in context or directly.
export const SalesComparisonApproachInputSchema = z.object({
  appraisalCaseFile: AppraisalCaseFileSchema,
  // User-provided adjustment guidelines (optional, AI can be prompted to suggest if missing)
  adjustmentGuidelines: z.object({
    marketConditions: z.string().optional().describe("Guideline for time/market condition adjustments, e.g., '+0.25% per month' or 'stable'"),
    location: z.string().optional().describe("Guideline for location adjustments, e.g., '$10/SF for superior view', '-5% for secondary street'"),
    physicalCharacteristics: z.string().optional().describe("Guideline for size, age, condition, features, e.g., '$50/SF for GLA differences', '-$10,000 for deferred maintenance'"),
    propertyRights: z.string().optional().describe("Guideline if property rights conveyed differ, e.g., 'Fee simple vs. leased fee adjustment'"),
    financingTerms: z.string().optional().describe("Guideline for non-market financing terms, e.g., 'Cash equivalency adjustment for seller financing'"),
    conditionsOfSale: z.string().optional().describe("Guideline for non-arm's length sales, e.g., 'Adjustment for duress sale'"),
  }).optional().describe("Appraiser-provided guidelines for adjustments."),
});
export type SalesComparisonApproachInput = z.infer<typeof SalesComparisonApproachInputSchema>;

// Define a schema for individual adjustment details
export const AdjustmentDetailSchema = z.object({
  marketConditions: z.number().optional().describe("Dollar or percentage adjustment for market conditions/time."),
  location: z.number().optional().describe("Dollar or percentage adjustment for location."),
  physicalCharacteristics: z.object({
    sizeGLA: z.number().optional().describe("Adjustment for Gross Living Area (GLA) or other building size differences."),
    age: z.number().optional().describe("Adjustment for age differences."),
    condition: z.number().optional().describe("Adjustment for condition differences."),
    features: z.number().optional().describe("Adjustment for other features/amenities."),
  }).optional(),
  propertyRightsConveyed: z.number().optional().describe("Adjustment for differences in property rights conveyed."),
  financingTerms: z.number().optional().describe("Adjustment for non-market financing terms."),
  conditionsOfSale: z.number().optional().describe("Adjustment for non-arm's length sale conditions."),
  other: z.number().optional().describe("Any other specific adjustments made.")
}).describe("Detailed breakdown of adjustments applied to a comparable.");

// Define a schema for an adjusted comparable sale
export const AdjustedComparableSchema = z.object({
  compNumber: z.number().describe("Identifier for the comparable (e.g., 1, 2, 3)."),
  address: z.string().describe("Address of the comparable property."),
  salePrice: z.number().describe("Original sale price of the comparable."),
  saleDate: z.string().describe("Original sale date of the comparable."),
  adjustments: AdjustmentDetailSchema.describe("Object containing all applied adjustments."),
  totalNetAdjustmentValue: z.number().describe("Total net dollar value of all adjustments. Positive if adjusted upwards, negative if downwards."),
  totalGrossAdjustmentPercentage: z.number().optional().describe("Sum of absolute percentage adjustments, if percentages were used primarily."),
  adjustedSalePrice: z.number().describe("Sale price after all adjustments."),
  pricePerSqFtAdjusted: z.number().optional().describe("Adjusted sale price per square foot (or other relevant unit)."),
  briefRationaleForAdjustments: z.string().optional().describe("Brief summary of why key adjustments were made.")
});

// Define output schema for the SCA flow
export const SalesComparisonApproachOutputSchema = z.object({
  indicatedValueBySCA: z.number().describe("The value indicated for the subject property by the Sales Comparison Approach."),
  adjustmentGrid: z.array(AdjustedComparableSchema).describe("A structured representation of the sales comparison adjustment grid."),
  narrative: z.string().describe("Detailed narrative explaining the selection of comparables, the adjustment process, rationale for each adjustment, and summarization of adjusted values leading to the indicated value."),
  confidenceScore: z.number().min(0).max(1).describe("Confidence in the SCA-indicated value and the adjustments applied."),
  // Any new data to be merged back into AppraisalCaseFile.valuationResults
  valuationResultsUpdate: z.object({
    scaIndicatedValue: z.number().optional(),
    scaNarrative: z.string().optional(),
    scaAdjustmentGrid: z.any().optional(), // Store the grid in the case file too
    scaConfidence: z.number().optional(),
  }).optional()
});
export type SalesComparisonApproachOutput = z.infer<typeof SalesComparisonApproachOutputSchema>;

function assembleSCAPrompt(caseFile: AppraisalCaseFile, adjustmentGuidelines?: SalesComparisonApproachInput['adjustmentGuidelines']): string {
  const subject = caseFile.propertyDetails;
  const comparables = caseFile.marketData?.comparableSales || [];

  // Basic subject property summary
  let subjectSummary = `Subject Property: ${caseFile.propertyAddress}, ${caseFile.city}, ${caseFile.state}\n`;
  subjectSummary += `Property Type: ${subject?.general?.propertyType || caseFile.propertyType || 'N/A'}\n`;
  subjectSummary += `Building Size: ${subject?.general?.sizeSqFt || subject?.buildingSizeSqFt || 'N/A'} SF\n`;
  subjectSummary += `Lot Size: ${subject?.lotSizeSqFt || subject?.lotSizeAcres || 'N/A'} ${subject?.lotUnits || ''}\n`;
  subjectSummary += `Year Built: ${subject?.general?.yearBuilt || subject?.yearBuilt || 'N/A'}\n`;
  subjectSummary += `Effective Date of Value: ${caseFile.effectiveDate || 'N/A'}\n`;

  // Basic comparables summary
  let compsSummary = comparables.map((comp: ComparableSale, index: number) => {
    return `Comp ${index + 1}: ${comp.address}\n` +
           `  Sale Date: ${comp.saleDate}, Sale Price: $${comp.salePrice?.toLocaleString()}\n` +
           `  Building Size: ${comp.buildingSizeSqFt || 'N/A'} SF, Property Type: ${comp.propertyType || 'N/A'}\n` +
           `  Source: ${comp.source || 'N/A'}`;
  }).join('\n\n');
  if (comparables.length === 0) {
    compsSummary = "No comparable sales provided in the AppraisalCaseFile.";
  }

  // Adjustment guidelines summary
  let guidelinesSummary = "No specific adjustment guidelines provided by appraiser. You will need to determine appropriate market-derived adjustments.";
  if (adjustmentGuidelines) {
    guidelinesSummary = "Appraiser-provided Adjustment Guidelines:\n";
    guidelinesSummary += adjustmentGuidelines.marketConditions ? `  - Market Conditions/Time: ${adjustmentGuidelines.marketConditions}\n` : '';
    guidelinesSummary += adjustmentGuidelines.location ? `  - Location: ${adjustmentGuidelines.location}\n` : '';
    guidelinesSummary += adjustmentGuidelines.physicalCharacteristics ? `  - Physical (Size, Age, Condition, Features): ${adjustmentGuidelines.physicalCharacteristics}\n` : '';
    guidelinesSummary += adjustmentGuidelines.propertyRights ? `  - Property Rights Conveyed: ${adjustmentGuidelines.propertyRights}\n` : '';
    guidelinesSummary += adjustmentGuidelines.financingTerms ? `  - Financing Terms: ${adjustmentGuidelines.financingTerms}\n` : '';
    guidelinesSummary += adjustmentGuidelines.conditionsOfSale ? `  - Conditions of Sale: ${adjustmentGuidelines.conditionsOfSale}\n` : '';
    if (guidelinesSummary === "Appraiser-provided Adjustment Guidelines:\n") guidelinesSummary = "Appraiser provided an adjustment guidelines object, but all fields were empty. Determine market-derived adjustments.";
  }

  return `
As an expert AI Appraiser for Lane Valuation group, your task is to perform a Sales Comparison Approach (SCA).

**Objective:** Determine an Indicated Value for the subject property by analyzing comparable sales. You must generate a detailed adjustment grid and a comprehensive narrative.

**Subject Property Information:**
${subjectSummary}

**Provided Comparable Sales (from ComparableSalesAgent):**
${compsSummary}

**Adjustment Guidelines from Appraiser:**
${guidelinesSummary}

**Instructions:**

1.  **Review Comparables:** If no comparables were provided, state that an SCA cannot be completed and return an error or low confidence output. If comparables are present, critically evaluate their suitability. You may suggest (but not find new ones here) if some are weak.

2.  **Adjustment Process (Key Task - Output as 'adjustmentGrid'):**
    *   For each comparable sale, determine and apply quantitative (dollar or percentage) adjustments for differences between the comp and the subject. 
    *   Common adjustment categories (apply as relevant):
        *   Property Rights Conveyed (e.g., fee simple vs. leased fee)
        *   Financing Terms (e.g., non-market financing)
        *   Conditions of Sale (e.g., duress, related parties)
        *   Market Conditions (Time of Sale - adjust to effective date of value for subject)
        *   Location (e.g., superior/inferior neighborhood, frontage, traffic)
        *   Physical Characteristics (e.g., building size (GLA/GBA), lot size, age, condition, quality of construction, features, amenities, site improvements).
    *   **Adhere to Appraiser Guidelines:** If guidelines are provided, use them as your primary basis for adjustment amounts/rates. Clearly state when you are using a provided guideline.
    *   **Market-Derived Adjustments:** If no guidelines (or insufficient guidelines) are provided for a category, you MUST determine and apply a market-derived adjustment. Briefly explain your rationale for any market-derived adjustment (e.g., "Based on paired sales analysis (simulated), a -5% adjustment was applied for inferior condition.").
    *   **Web Search for Market Condition/Time Adjustments (If Necessary):** If a market condition/time adjustment is needed and no guideline is provided, you MAY use the \`google_search\` tool to find supporting data. Example queries:
        *   "commercial property price index ${caseFile.city} ${caseFile.state} last 2 years"
        *   "${subject?.general?.propertyType || 'property'} appreciation rate ${caseFile.county} from [Comp Sale Date] to ${caseFile.effectiveDate}"
        *   Focus on reliable sources like real estate market reports, government statistics, or reputable financial news for your search.
    *   **Structure for 'adjustmentGrid':** The output for \`adjustmentGrid\` should be an array of objects. Each object represents a comparable and should include:
        *   \`compNumber: number\` (e.g., 1, 2, 3)
        *   \`address: string\`
        *   \`salePrice: number\`
        *   \`saleDate: string\`
        *   \`adjustments: object\` (e.g., { marketConditions: number, location: number, size: number, condition: number, other: number } where values are $ or % adjustments)
        *   \`totalNetAdjustment: number\`
        *   \`totalGrossAdjustmentPercentage: number\` (Absolute sum of all percentage adjustments)
        *   \`adjustedSalePrice: number\`
        *   \`pricePerSqFtAdjusted: number\` (if applicable)

3.  **Reconciliation within SCA:**
    *   Analyze the range of adjusted sale prices from the grid.
    *   Determine a single point value conclusion for the Indicated Value by Sales Comparison Approach (\`indicatedValueBySCA\').
    *   Explain your reasoning for the final value conclusion, considering the strengths/weaknesses of each comp and the magnitude of adjustments.

4.  **Narrative Generation (Output as 'narrative'):**
    *   Draft a comprehensive narrative section. This narrative MUST:
        *   Describe the subject property briefly.
        *   Summarize the search for and selection of comparable sales (reference the \`ComparableSalesAgent\` if this flow is chained).
        *   Detail the adjustment grid, explaining EACH adjustment made to EACH comparable, whether based on appraiser guidelines or market derivation. Justify the amounts/percentages.
        *   Discuss the range of adjusted values and reconcile them to your final \`indicatedValueBySCA\`.
        *   Ensure professional, clear, and concise language suitable for Lane Valuation group.

5.  **Confidence Score (Output as 'confidenceScore'):**
    *   Provide an overall confidence score (0.0 to 1.0) for your \`indicatedValueBySCA\`, considering the quality/quantity of comps, magnitude of adjustments, and reliability of adjustment data.

**Output Requirements:**
Return a JSON object with the following fields: \`indicatedValueBySCA\`, \`adjustmentGrid\`, \`narrative\`, \`confidenceScore\`, and an optional \`valuationResultsUpdate\` object to merge these key SCA results back into the AppraisalCaseFile.

---\nPerform the Sales Comparison Approach analysis now.
`;
}

export const salesComparisonApproachFlow = ai.defineFlow(
  {
    name: 'salesComparisonApproachFlow',
    inputSchema: SalesComparisonApproachInputSchema,
    outputSchema: SalesComparisonApproachOutputSchema,
  },
  async (input: SalesComparisonApproachInput, flowContext: any) => {
    const caseFile = input.appraisalCaseFile;
    
    // The context might also carry the caseFile if run via master flow with context propagation
    // const caseFileFromContext = flowContext?.caseFile as AppraisalCaseFile | undefined;
    // const finalCaseFile = caseFileFromContext || input.appraisalCaseFile;

    if (!caseFile.marketData?.comparableSales || caseFile.marketData.comparableSales.length === 0) {
      const noCompsMessage = "No comparable sales found in the AppraisalCaseFile. Sales Comparison Approach cannot be completed.";
      return {
        indicatedValueBySCA: 0,
        adjustmentGrid: [],
        narrative: noCompsMessage,
        confidenceScore: 0.1, // Very low confidence
        valuationResultsUpdate: {
          scaNarrative: noCompsMessage,
          scaConfidence: 0.1,
        }
      };
    }

    const prompt = assembleSCAPrompt(caseFile, input.adjustmentGuidelines);

    const scaGeneration = await ai.generate({
      prompt,
      model: 'gemini-pro',
      output: { schema: SalesComparisonApproachOutputSchema },
      tools: [googleSearch],
      toolChoice: 'auto',
    });

    const output = scaGeneration.output();
    if (!output) {
      throw new Error("AI failed to generate SCA output or output was empty.");
    }
    
    // Prepare the valuationResultsUpdate part from the direct AI output
    const valuationResultsUpdate = {
        scaIndicatedValue: output.indicatedValueBySCA,
        scaNarrative: output.narrative,
        scaAdjustmentGrid: output.adjustmentGrid, 
        scaConfidence: output.confidenceScore,
    };

    return {
        ...output, // includes indicatedValueBySCA, adjustmentGrid, narrative, confidenceScore
        valuationResultsUpdate: valuationResultsUpdate
    };
  }
);

// Helper function to be used in masterReportGenerationFlow // This line and below will be deleted
// export function mapAppraisalCaseToSalesComparisonInput(caseFile: AppraisalCaseFile, comparablesOutput: SalesComparisonOutput, userAdjustments?: any): SalesComparisonApproachInput {
//   if (!caseFile.propertyDetails) throw new Error("Property details missing in CaseFile for SCA.");
//   if (!comparablesOutput || !comparablesOutput.comparableSales) throw new Error("Comparable sales missing for SCA.");
// 
//   return {
//     appraisalCaseFile: caseFile,
//     adjustmentGuidelines: userAdjustments,
//   };
// } 