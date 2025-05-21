// src/ai/flows/income-approach-flow.ts
'use server';
/**
 * @fileOverview Income Approach flow for ValuGen.
 * This flow calculates an indicated value for the subject property using the Income Approach.
 * It uses market data for rents, vacancy, expenses, and capitalization rates,
 * potentially supplemented by user inputs and web searches.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { AppraisalCaseFileSchema, AppraisalCaseFile } from '@/lib/appraisal-case-file';
// Assume googleSearch tool might be needed, similar to other flows.
import { googleSearch } from '@genkit-ai/google-vertexai'; // Or appropriate genkit google search import

// Input schema for the Income Approach flow
export const IncomeApproachInputSchema = z.object({
  appraisalCaseFile: AppraisalCaseFileSchema,
  // User-provided overrides or specific inputs for the Income Approach
  incomeApproachUserInputs: z.object({
    marketRentPerSFPerYear: z.number().optional().describe("User-provided market rent per square foot per year."),
    marketRentPerUnitPerYear: z.number().optional().describe("User-provided market rent per unit per year (for multi-unit)."),
    vacancyCollectionLossPercent: z.number().min(0).max(1).optional().describe("User-provided vacancy and collection loss as a percentage (e.g., 0.05 for 5%)."),
    operatingExpenseRatio: z.number().min(0).max(1).optional().describe("User-provided overall operating expense ratio as a percentage of EGI (e.g., 0.35 for 35%)."),
    operatingExpensesPerSFPerYear: z.number().optional().describe("User-provided operating expenses per square foot per year."),
    capitalizationRate: z.number().min(0).max(1).optional().describe("User-provided overall capitalization rate (OAR) (e.g., 0.07 for 7%)."),
    // For DCF (future enhancement)
    // discountRate: z.number().min(0).max(1).optional().describe("User-provided discount rate for DCF analysis."),
    // holdingPeriodYears: z.number().int().optional().describe("User-provided holding period in years for DCF."),
  }).optional().describe("Optional user-provided inputs to guide or override AI-derived figures for the Income Approach."),
});
export type IncomeApproachInput = z.infer<typeof IncomeApproachInputSchema>;

// Define a schema for the ProForma (Income Statement)
export const ProFormaSchema = z.object({
  potentialGrossIncome: z.object({
    description: z.string().describe("Basis for PGI (e.g., Market Rent per SF, Actual Rents)."),
    amountPerSFPerYear: z.number().optional(),
    amountPerUnitPerYear: z.number().optional(),
    totalAmount: z.number(),
  }).describe("Potential Gross Income details."),
  vacancyCollectionLoss: z.object({
    rate: z.number().min(0).max(1).describe("Vacancy and collection loss rate (e.g., 0.05 for 5%)."),
    amount: z.number(),
  }).describe("Vacancy and Collection Loss details."),
  effectiveGrossIncome: z.number().describe("Effective Gross Income (PGI minus Vacancy/Collection Loss)."),
  operatingExpenses: z.object({
    description: z.string().describe("Basis for Operating Expenses (e.g., Expense Ratio of EGI, Per SF amount, Detailed line items)."),
    expenseRatioOfEGI: z.number().min(0).max(1).optional(),
    amountPerSFPerYear: z.number().optional(),
    managementFee: z.object({ rate: z.number().optional(), amount: z.number().optional() }).optional(),
    propertyTaxes: z.number().optional(),
    insurance: z.number().optional(),
    utilities: z.number().optional(),
    repairsMaintenance: z.number().optional(),
    replacementReserves: z.number().optional(),
    otherExpenses: z.record(z.number()).optional().describe("Key-value pairs for other itemized expenses."),
    totalAmount: z.number(),
  }).describe("Operating Expenses details."),
  netOperatingIncome: z.number().describe("Net Operating Income (EGI minus Operating Expenses)."),
});
export type ProForma = z.infer<typeof ProFormaSchema>;

// Output schema for the Income Approach flow
export const IncomeApproachOutputSchema = z.object({
  indicatedValueByIA: z.number().describe("The value indicated for the subject property by the Income Approach."),
  potentialGrossIncome: z.number().optional().describe("Potential Gross Income (PGI). Conflated with ProFormaSchema, use ProFormaSchema.potentialGrossIncome.totalAmount instead"), // To be deprecated, use proForma object
  effectiveGrossIncome: z.number().optional().describe("Effective Gross Income (EGI). Conflated with ProFormaSchema, use ProFormaSchema.effectiveGrossIncome instead"), // To be deprecated, use proForma object
  netOperatingIncome: z.number().optional().describe("Net Operating Income (NOI). Conflated with ProFormaSchema, use ProFormaSchema.netOperatingIncome instead"), // To be deprecated, use proForma object
  proForma: ProFormaSchema.optional().describe("Structured pro-forma income statement."), // Added specific schema
  capitalizationRateUsed: z.number().optional().describe("The overall capitalization rate (OAR) used in the calculation."),
  // proForma: z.any().optional().describe("Structured pro-forma income statement. Could be an object with PGI, Vacancy, EGI, Expenses (detailed or total), NOI."),
  narrative: z.string().describe("Detailed narrative explaining the assumptions for income, vacancy, expenses, and cap rate, referencing market data and calculations."),
  confidenceScore: z.number().min(0).max(1).describe("Confidence in the IA-indicated value."),
  // Any new data to be merged back into AppraisalCaseFile.valuationResults
  valuationResultsUpdate: z.object({
    iaIndicatedValue: z.number().optional(),
    iaNarrative: z.string().optional(),
    iaPGI: z.number().optional(),
    iaEGI: z.number().optional(),
    iaNOI: z.number().optional(),
    iaCapRateUsed: z.number().optional(),
    iaConfidence: z.number().optional(),
  }).optional(),
});
export type IncomeApproachOutput = z.infer<typeof IncomeApproachOutputSchema>;

function assembleIncomeApproachPrompt(caseFile: AppraisalCaseFile, userInputs?: IncomeApproachInput['incomeApproachUserInputs']): string {
  const subject = caseFile.propertyDetails;
  const propertyType = subject?.general?.propertyType || caseFile.propertyType || 'Commercial Property';
  const city = caseFile.city;
  const county = caseFile.county;
  const state = caseFile.state;
  const buildingSizeSqFt = subject?.general?.sizeSqFt || subject?.buildingSizeSqFt;
  const numberOfUnits = subject?.improvementsSummary?.units; // Assuming units are in improvementsSummary

  let subjectSummary = `Subject Property: ${caseFile.propertyAddress}, ${city}, ${state}\\n`;
  subjectSummary += `Property Type: ${propertyType}\\n`;
  subjectSummary += buildingSizeSqFt ? `Building Size: ${buildingSizeSqFt} SF\\n` : '';
  subjectSummary += numberOfUnits ? `Number of Units: ${numberOfUnits}\\n` : '';
  subjectSummary += `Effective Date of Value: ${caseFile.effectiveDate || 'N/A'}\\n`;

  let userInputsSummary = "AI will research and determine all income approach parameters based on market data.\\n";
  if (userInputs) {
    userInputsSummary = "Appraiser-provided inputs (use these as primary if available, otherwise research market data):\\n";
    userInputsSummary += userInputs.marketRentPerSFPerYear ? `  - Market Rent/SF/Yr: $${userInputs.marketRentPerSFPerYear}\\n` : '';
    userInputsSummary += userInputs.marketRentPerUnitPerYear ? `  - Market Rent/Unit/Yr: $${userInputs.marketRentPerUnitPerYear}\\n` : '';
    userInputsSummary += userInputs.vacancyCollectionLossPercent ? `  - Vacancy/Collection Loss: ${(userInputs.vacancyCollectionLossPercent * 100).toFixed(1)}%\\n` : '';
    userInputsSummary += userInputs.operatingExpenseRatio ? `  - Operating Expense Ratio (of EGI): ${(userInputs.operatingExpenseRatio * 100).toFixed(1)}%\\n` : '';
    userInputsSummary += userInputs.operatingExpensesPerSFPerYear ? `  - Operating Expenses/SF/Yr: $${userInputs.operatingExpensesPerSFPerYear}\\n` : '';
    userInputsSummary += userInputs.capitalizationRate ? `  - Capitalization Rate (OAR): ${(userInputs.capitalizationRate * 100).toFixed(2)}%\\n` : '';
    if (userInputsSummary === "Appraiser-provided inputs (use these as primary if available, otherwise research market data):\\n") {
      userInputsSummary = "Appraiser provided an incomeApproachUserInputs object, but all fields were empty. AI to research all parameters.\\n";
    }
  }

  return `
You are an expert AI Appraiser for Lane Valuation group, specializing in the Income Approach to value for ${propertyType} properties in ${city}, ${county}, ${state}.

**Objective:** Develop an Indicated Value using the Direct Capitalization method of the Income Approach.

**Subject Property Information:**
${subjectSummary}
**User-Provided Income Approach Inputs:**
${userInputsSummary}
**Instructions:**

1.  **Determine Potential Gross Income (PGI):**
    *   If user provided market rent, use that. Otherwise, **research current market rental rates** for comparable ${propertyType} properties in the ${city} / ${county} market area.
    *   Use \\\`google_search\\\` for this. Example queries:
        *   "${propertyType} lease rates ${city} ${state}"
        *   "${propertyType} rental comps ${county} ${state} per square foot"
        *   "average office rent ${city} Class A" (if applicable)
    *   Cite sources for your market rent conclusions.
    *   Calculate PGI based on building size (if applicable, e.g., per SF) or number of units (if applicable, e.g., per unit).

2.  **Estimate Vacancy and Collection Loss:**
    *   If user provided a rate, use that. Otherwise, **research typical vacancy rates** for ${propertyType} in the ${city} / ${county} market.
    *   Use \\\`google_search\\\`. Example queries:
        *   "${propertyType} vacancy rates ${city} ${state} [current year]"
        *   "commercial real estate vacancy trends ${county}"
    *   Apply this percentage to PGI to arrive at Effective Gross Income (EGI).

3.  **Estimate Operating Expenses:**
    *   If user provided an expense ratio or per SF amount, use that. Otherwise, **research typical operating expenses** for ${propertyType} in the ${city} / ${county} market. These can be an overall ratio of EGI or a per SF amount.
    *   Use \\\`google_search\\\`. Example queries:
        *   "average operating expenses ${propertyType} ${city} percentage EGI"
        *   "typical opex ${propertyType} ${county} per square foot"
        *   "BOMA IREM operating expense survey ${propertyType} ${county}" (look for summaries)
    *   Subtract total operating expenses from EGI to arrive at Net Operating Income (NOI).
    *   Clearly state if your expenses include or exclude property taxes and insurance, and if they include reserves for replacement. Typically, for direct cap, property taxes are included in OPEX.

4.  **Determine an Overall Capitalization Rate (OAR):**
    *   If user provided a cap rate, use that. Otherwise, **research current market capitalization rates** for recently sold, comparable ${propertyType} properties in the ${city} / ${county} market.
    *   Use \\\`google_search\\\`. Example queries:
        *   "${propertyType} cap rate survey ${city} ${state} [current year]"
        *   "recent ${propertyType} sales cap rates ${county}"
        *   "PwC Korpacz real estate investor survey cap rates ${propertyType} ${county}" (look for summaries)
    *   Explain your rationale for the selected OAR based on your research and the subject's characteristics (risk, quality, location).

5.  **Calculate Indicated Value:**
    *   Divide NOI by the selected OAR (NOI / OAR = Value). This is your \\\`indicatedValueByIA\\\`.

6.  **Narrative Generation (Output as \\\`narrative\\\`):**
    *   Draft a comprehensive narrative for the Income Approach. This MUST:
        *   Explain the methodology (Direct Capitalization).
        *   Detail your assumptions and data sources for PGI (market rent), vacancy/collection loss, operating expenses, and the OAR. Reference any web searches performed and their findings.
        *   Show the step-by-step calculation: PGI -> EGI -> NOI -> Indicated Value.
        *   Ensure professional, clear, and concise language.

7.  **Confidence Score (Output as \\\`confidenceScore\\\`):**
    *   Provide an overall confidence score (0.0 to 1.0) for your \\\`indicatedValueByIA\\\`, considering the quality of market data found and the typical applicability of the income approach for this property type.

**Output Requirements:**
Return a single JSON object matching the IncomeApproachOutputSchema, including \\\`indicatedValueByIA\\\`, \\\`potentialGrossIncome\\\`, \\\`effectiveGrossIncome\\\`, \\\`netOperatingIncome\\\`, \\\`capitalizationRateUsed\\\`, \\\`narrative\\\`, \\\`confidenceScore\\\`, and an optional \\\`valuationResultsUpdate\\\` object.

---
Perform the Income Approach analysis now.
`;
}

export const incomeApproachFlow = ai.defineFlow(
  {
    name: 'incomeApproachFlow',
    inputSchema: IncomeApproachInputSchema,
    outputSchema: IncomeApproachOutputSchema,
  },
  async (input: IncomeApproachInput, flowContext?: any) => {
    const caseFile = input.appraisalCaseFile;
    // const caseFileFromContext = flowContext?.caseFile as AppraisalCaseFile | undefined;
    // const finalCaseFile = caseFileFromContext || input.appraisalCaseFile;

    // Check if income approach is applicable (e.g., property type suggests income generation)
    // This is a simplified check; more sophisticated logic could be added.
    const incomeProducingTypes = ['office', 'retail', 'industrial', 'multifamily', 'mixed-use', 'shopping center', 'hotel'];
    const propertyType = caseFile.propertyDetails?.general?.propertyType?.toLowerCase() || caseFile.propertyType.toLowerCase();
    
    if (!incomeProducingTypes.some(type => propertyType.includes(type))) {
      const notApplicableMessage = `Income Approach is generally not applicable or less relevant for the specified property type (${propertyType}). Skipping.`;
      return {
        indicatedValueByIA: 0,
        narrative: notApplicableMessage,
        confidenceScore: 0.2, // Low confidence as it's not typically applied
        valuationResultsUpdate: {
          iaNarrative: notApplicableMessage,
          iaConfidence: 0.2,
        }
      };
    }
    
    const prompt = assembleIncomeApproachPrompt(caseFile, input.incomeApproachUserInputs);

    const incomeGeneration = await ai.generate({
      prompt,
      output: { schema: IncomeApproachOutputSchema },
      tools: [googleSearch], // Uncomment if googleSearch tool is confirmed and needed
      toolChoice: 'auto',
    });

    const output = incomeGeneration.output();

    if (!output) {
      throw new Error("AI failed to generate Income Approach output or output was empty.");
    }
    
    // Prepare the valuationResultsUpdate part from the direct AI output
    const valuationResultsUpdate = {
      iaIndicatedValue: output.indicatedValueByIA,
      iaNarrative: output.narrative,
      iaPGI: output.potentialGrossIncome,
      iaEGI: output.effectiveGrossIncome,
      iaNOI: output.netOperatingIncome,
      iaCapRateUsed: output.capitalizationRateUsed,
      iaConfidence: output.confidenceScore,
    };

    return {
      ...output,
      valuationResultsUpdate: valuationResultsUpdate,
    };
  }
);

// Helper for master flow if needed, though master flow can construct input directly
// export function mapAppraisalCaseToIncomeApproachInput(caseFile: AppraisalCaseFile, userInputs?: IncomeApproachInput['incomeApproachUserInputs']): IncomeApproachInput {
//   return {
//     appraisalCaseFile: caseFile,
//     incomeApproachUserInputs: userInputs,
//   };
// }