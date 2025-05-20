// src/ai/flows/cost-approach-flow.ts
'use server';
/**
 * @fileOverview Cost Approach flow for ValuGen.
 * This flow estimates value based on the principle of substitution:
 * cost of land + cost of new improvements - accrued depreciation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { AppraisalCaseFileSchema, AppraisalCaseFile } from '@/lib/appraisal-case-file';
import { googleSearch } from '@genkit-ai/google-vertexai'; // Or appropriate genkit google search import

// Input schema for the Cost Approach flow
export const CostApproachInputSchema = z.object({
  appraisalCaseFile: AppraisalCaseFileSchema,
  costApproachUserInputs: z.object({
    landValue: z.number().optional().describe("User-provided estimate of land value."),
    reproductionCostNewPerSF: z.number().optional().describe("User-provided reproduction/replacement cost new per SF (e.g., from Marshall & Swift)."),
    totalAccruedDepreciationPercent: z.number().min(0).max(1).optional().describe("User-provided estimate of total accrued depreciation as a percentage of cost new."),
    physicalDeteriorationAmount: z.number().optional().describe("User-provided amount for physical deterioration."),
    functionalObsolescenceAmount: z.number().optional().describe("User-provided amount for functional obsolescence."),
    externalObsolescenceAmount: z.number().optional().describe("User-provided amount for external obsolescence."),
  }).optional().describe("Optional user-provided inputs for the Cost Approach."),
});
export type CostApproachInput = z.infer<typeof CostApproachInputSchema>;

// Define a more detailed schema for Depreciation
export const DepreciationDetailsSchema = z.object({
  physicalDeterioration: z.object({
    amount: z.number().optional(),
    percentage: z.number().min(0).max(1).optional(),
    description: z.string().optional().describe("Explanation of physical deterioration (e.g., age-life method, observed condition).")
  }).optional(),
  functionalObsolescence: z.object({
    amount: z.number().optional(),
    percentage: z.number().min(0).max(1).optional(),
    description: z.string().optional().describe("Explanation of functional obsolescence (e.g., outdated design, deficiencies).")
  }).optional(),
  externalObsolescence: z.object({
    amount: z.number().optional(),
    percentage: z.number().min(0).max(1).optional(),
    description: z.string().optional().describe("Explanation of external obsolescence (e.g., market conditions, neighborhood decline).")
  }).optional(),
  totalCalculatedDepreciation: z.number().optional().describe("Sum of all depreciation components if calculated individually.")
});

// Output schema for the Cost Approach flow
export const CostApproachOutputSchema = z.object({
  indicatedValueByCA: z.number().describe("The value indicated for the subject property by the Cost Approach."),
  estimatedLandValue: z.number().optional().describe("Estimated land value used in the approach."),
  landValueSource: z.string().optional().describe("Source or method for land value estimation (e.g., 'User Provided', 'Comparable Land Sales Analysis')."),
  reproductionReplacementCostNew: z.object({
    costType: z.enum(['Reproduction', 'Replacement']).optional().describe("Whether Reproduction or Replacement Cost New was used."),
    costPerSqFt: z.number().optional(),
    totalAmount: z.number().optional(),
    source: z.string().optional().describe("Source of cost data (e.g., 'User Provided', 'Marshall & Swift', 'RSMeans', 'Derived from Market Data').")
  }).optional().describe("Estimated reproduction or replacement cost new of improvements."),
  depreciationDetails: DepreciationDetailsSchema.optional().describe("Breakdown of accrued depreciation."),
  totalAccruedDepreciation: z.number().optional().describe("Total estimated accrued depreciation (sum of physical, functional, external). This might be directly from user or sum from depreciationDetails."),
  depreciatedCostOfImprovements: z.number().optional().describe("Cost of improvements less total accrued depreciation."),
  narrative: z.string().describe("Detailed narrative explaining the sources/methods for land value, cost new, and depreciation estimates."),
  confidenceScore: z.number().min(0).max(1).describe("Confidence in the CA-indicated value."),
  valuationResultsUpdate: z.object({
    caIndicatedValue: z.number().optional(),
    caNarrative: z.string().optional(),
    caLandValue: z.number().optional(),
    caCostNew: z.number().optional(),
    caTotalDepreciation: z.number().optional(),
    caDepreciatedCostOfImprovements: z.number().optional(),
    caConfidence: z.number().optional(),
  }).optional(),
});
export type CostApproachOutput = z.infer<typeof CostApproachOutputSchema>;

function assembleCostApproachPrompt(caseFile: AppraisalCaseFile, userInputs?: CostApproachInput['costApproachUserInputs']): string {
  const subject = caseFile.propertyDetails;
  const propertyType = subject?.general?.propertyType || caseFile.propertyType || 'N/A';
  const city = caseFile.city;
  const county = caseFile.county;
  const state = caseFile.state;
  const buildingSizeSqFt = subject?.general?.sizeSqFt || subject?.buildingSizeSqFt;
  const lotSizeSqFt = subject?.lotSizeSqFt;
  const yearBuilt = subject?.general?.yearBuilt || subject?.yearBuilt;
  const effectiveDate = caseFile.effectiveDate || new Date().toISOString().split('T')[0];
  const effectiveAge = yearBuilt ? new Date(effectiveDate).getFullYear() - yearBuilt : undefined;

  let subjectSummary = `Subject Property: ${caseFile.propertyAddress}, ${city}, ${state}\\n`;
  subjectSummary += `Property Type: ${propertyType}\\n`;
  subjectSummary += buildingSizeSqFt ? `Building Size: ${buildingSizeSqFt} SF\\n` : '';
  subjectSummary += lotSizeSqFt ? `Lot Size: ${lotSizeSqFt} SF\\n` : '';
  subjectSummary += yearBuilt ? `Year Built: ${yearBuilt}` : '';
  subjectSummary += effectiveAge && effectiveAge > 0 ? ` (Effective Age: approx. ${effectiveAge} years as of ${effectiveDate})\\n` : `\\n`;
  subjectSummary += `Effective Date of Value: ${effectiveDate}\\n`;

  let userInputsSummary = "AI to research/derive all Cost Approach components (Land Value, Cost New, Depreciation).\\n";
  if (userInputs) {
    userInputsSummary = "Appraiser-provided inputs (use as primary if available, otherwise research/derive market data):\\n";
    userInputsSummary += userInputs.landValue ? `  - Land Value: $${userInputs.landValue.toLocaleString()}\\n` : '';
    userInputsSummary += userInputs.reproductionCostNewPerSF ? `  - Reproduction Cost New/SF: $${userInputs.reproductionCostNewPerSF.toLocaleString()}\\n` : '';
    userInputsSummary += userInputs.totalAccruedDepreciationPercent ? `  - Total Accrued Depreciation %: ${(userInputs.totalAccruedDepreciationPercent * 100).toFixed(1)}%\\n` : '';
    userInputsSummary += userInputs.physicalDeteriorationAmount ? `  - Physical Deterioration: $${userInputs.physicalDeteriorationAmount.toLocaleString()}\\n` : '';
    userInputsSummary += userInputs.functionalObsolescenceAmount ? `  - Functional Obsolescence: $${userInputs.functionalObsolescenceAmount.toLocaleString()}\\n` : '';
    userInputsSummary += userInputs.externalObsolescenceAmount ? `  - External Obsolescence: $${userInputs.externalObsolescenceAmount.toLocaleString()}\\n` : '';
    if (userInputsSummary === "Appraiser-provided inputs (use as primary if available, otherwise research/derive market data):\\n") {
      userInputsSummary = "Appraiser provided costApproachUserInputs, but all fields were empty. AI to research/derive components.\\n";
    }
  }

  return `
You are an expert AI Appraiser for Lane Valuation group, performing a Cost Approach valuation for a ${propertyType} in ${city}, ${county}, ${state}.

**Objective:** Estimate the value of the subject property using the Cost Approach (Market Value of Land + Replacement/Reproduction Cost New of Improvements - Accrued Depreciation).

**Subject Property Information:**
${subjectSummary}
**User-Provided Cost Approach Inputs:**
${userInputsSummary}

**Instructions:**

1.  **Estimate Land Value:**
    *   If user provided land value, use it. State this source.
    *   Otherwise, **research and estimate the market value of the subject site as if vacant and available for its highest and best use.** Use \\\`google_search\\\` to find comparable land sales or authoritative sources on land values for ${propertyType}-zoned land in the ${city}/${county} market.
    *   Example Queries: "commercial land sales ${city} ${state} per SF", "industrial lot prices ${county} ${state}", "${subject?.zoningCode || 'similar'} zoned land value ${city}".
    *   Explain your methodology (e.g., sales comparison for land) and cite data sources. Output as \\\`estimatedLandValue\\\`.

2.  **Estimate Reproduction/Replacement Cost New (RCN) of Improvements:**
    *   If user provided RCN/SF, use it. Clearly state this source and multiply by subject building size (\` ${buildingSizeSqFt || '[Building Size Needed for Calc]'} \` SF) to get total RCN.
    *   Otherwise, **estimate the RCN of the subject improvements** using \\\`google_search\\\` to find construction cost data (e.g., per SF) for a similar ${propertyType} of similar size, quality, and age in the ${city}, ${state} market. Acknowledge that direct database access (e.g., Marshall & Swift) is unlikely, so look for summaries, articles, or cost estimator tools that provide general ranges.
    *   Example Queries: "construction cost per sq ft ${propertyType} ${city} ${state} [current year]", "commercial building cost estimator ${propertyType} ${state}", "Marshall & Swift cost data summary ${propertyType}".
    *   Specify whether you are using Reproduction Cost New (exact replica) or Replacement Cost New (modern equivalent utility). Replacement cost is more common for older properties.
    *   Output as \\\`reproductionReplacementCostNew\\\`.

3.  **Estimate Accrued Depreciation:**
    *   This is the most challenging part. Depreciation comes from three sources: Physical Deterioration, Functional Obsolescence, and External (Economic) Obsolescence.
    *   **If user provided a total depreciation percentage OR individual component amounts, prioritize those.** Calculate total depreciation based on these inputs.
    *   **If no specific user inputs for depreciation:**
        *   **Physical Deterioration:** Estimate based on the subject's actual age (${yearBuilt ? yearBuilt : 'N/A'}) and effective age (approx. ${effectiveAge || 'N/A'} years), and overall condition (if known). You might use an age-life method (Effective Age / Economic Life). Research typical economic life for a ${propertyType}. Example Query: "economic life ${propertyType} building IRS", "effective age vs actual age real estate appraisal".
        *   **Functional Obsolescence:** Consider if the property has outdated features or design flaws compared to modern standards for a ${propertyType}. This is qualitative unless specific costs-to-cure are known. If evident from property description or type, discuss qualitatively. Example Query: "functional obsolescence examples ${propertyType}".
        *   **External Obsolescence:** Consider negative influences from outside the property boundaries (e.g., market decline, adverse zoning changes nearby). Difficult to quantify without specific market data. Discuss qualitatively if relevant. Example Query: "external obsolescence real estate ${city}".
    *   Sum all forms of depreciation to get \\\`totalAccruedDepreciation\\\`.

4.  **Calculate Indicated Value by Cost Approach:**
    *   Value = Estimated Land Value + RCN of Improvements - Total Accrued Depreciation.
    *   This is your \\\`indicatedValueByCA\\\`.

5.  **Narrative Generation (Output as \\\`narrative\\\`):**
    *   Draft a comprehensive narrative. This MUST:
        *   Explain the Cost Approach methodology.
        *   Detail your assumptions, data sources, and reasoning for: Land Value, RCN (including source and per SF cost if applicable), and each component of Accrued Depreciation.
        *   Show the calculation: Land Value + RCN - Depreciation = Indicated Value.
        *   Discuss the reliability and limitations of the Cost Approach for this specific property.

6.  **Confidence Score (Output as \\\`confidenceScore\\\`):**
    *   Provide a confidence score (0.0 to 1.0) for your \\\`indicatedValueByCA\\\`, considering data quality for each component (land value, cost new, depreciation estimates).

**Output Requirements:**
Return a JSON object matching CostApproachOutputSchema.

---
Perform the Cost Approach analysis now.
`;
}

export const costApproachFlow = ai.defineFlow(
  {
    name: 'costApproachFlow',
    inputSchema: CostApproachInputSchema,
    outputSchema: CostApproachOutputSchema,
  },
  async (input: CostApproachInput, flowContext?: any) => {
    const caseFile = input.appraisalCaseFile;
    const subjectDetails = caseFile.propertyDetails;
    const userInputs = input.costApproachUserInputs; // Corrected variable name

    // Basic check: Cost approach generally requires building size for RCN calculation.
    if (!subjectDetails?.general?.sizeSqFt && !subjectDetails?.buildingSizeSqFt && !userInputs?.reproductionCostNewPerSF) {
        // This check can be refined based on whether the intent is land-only valuation via CA.
        // For a full cost approach on an improved property, RCN is essential.
        // If only land value is provided by user, and no building data, it's more like a land valuation.
        // Consider if flow should proceed if only landValue is sought.
        // For now, if it looks like an improved property cost approach is intended but size is missing,
        // it might be problematic.
        console.warn("CostApproachFlow: Building size is missing and no RCN/SF provided by user. RCN calculation might be impaired.");
    }

    const prompt = assembleCostApproachPrompt(caseFile, userInputs);

    const costGeneration = await ai.generate({
      prompt,
      model: 'gemini-pro',
      output: { schema: CostApproachOutputSchema },
      tools: [googleSearch], 
      toolChoice: 'auto',
    });

    const output = costGeneration.output();
    if (!output) {
      throw new Error("AI failed to generate Cost Approach output or output was empty.");
    }

    const valuationResultsUpdate = {
      caIndicatedValue: output.indicatedValueByCA,
      caNarrative: output.narrative,
      caLandValue: output.estimatedLandValue,
      caCostNew: output.reproductionReplacementCostNew.totalAmount,
      caTotalDepreciation: output.totalAccruedDepreciation,
      caDepreciatedCostOfImprovements: output.depreciatedCostOfImprovements,
      caConfidence: output.confidenceScore,
    };

    return {
      ...output,
      valuationResultsUpdate: valuationResultsUpdate,
    };
  }
);