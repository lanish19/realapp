'use server';
/**
 * @fileOverview Reconciliation flow for ValuGen.
 * This flow takes the indicated values from SCA, IA, and CA,
 * along with appraiser rationale, to arrive at a final value opinion.
 */

import { defineFlow, runFlow } from '@genkit-ai/flow';
import { z } from 'zod';
import { geminiPro } from '@genkit-ai/googleai';
import { AppraisalCaseFileSchema } from '../../lib/appraisal-case-file';
import { SalesComparisonApproachOutputSchema } from './sales-comparison-approach-flow';
import { IncomeApproachOutputSchema } from './income-approach-flow';
import { CostApproachOutputSchema } from './cost-approach-flow';

// Input schema for the Reconciliation flow
export const ReconciliationInputSchema = z.object({
  appraisalCaseFile: AppraisalCaseFileSchema,
  salesComparisonApproach: SalesComparisonApproachOutputSchema.optional(),
  incomeApproach: IncomeApproachOutputSchema.optional(),
  costApproach: CostApproachOutputSchema.optional(),
});
export type ReconciliationInput = z.infer<typeof ReconciliationInputSchema>;

// Output schema for the Reconciliation flow
export const ReconciliationOutputSchema = z.object({
  reconciledValue: z.number().describe("The final reconciled market value of the subject property."),
  narrative: z.string().describe("A detailed narrative explaining the reconciliation process, including how the different valuation approaches were weighed, the rationale for the final value, and any assumptions made."),
  confidenceScore: z.number().min(0).max(1).describe("A score between 0 and 1 indicating the confidence in the reconciled value."),
  sources: z.array(z.string()).optional().describe("List of sources or tools used for reconciliation, if any beyond the provided approach values."),
});
export type ReconciliationOutput = z.infer<typeof ReconciliationOutputSchema>;

export async function assembleReconciliationPrompt(input: z.infer<typeof ReconciliationInputSchema>): Promise<string> {
  const { appraisalCaseFile, salesComparisonApproach, incomeApproach, costApproach } = input;
  const { propertyDetails, marketAnalysis, highestAndBestUse, userReconciliationInputs } = appraisalCaseFile;

  let prompt = `
You are an AI Real Estate Appraisal Reconciliation Specialist. Your task is to review the outputs from different valuation approaches and arrive at a final, reconciled opinion of market value for the subject property.

Subject Property Details:
Address: ${propertyDetails?.address || 'N/A'}
Property Type: ${propertyDetails?.propertyType || 'N/A'}
Description: ${propertyDetails?.description || 'N/A'}

Market Analysis Summary:
${marketAnalysis?.summary || 'N/A'}

Highest and Best Use Conclusion:
${highestAndBestUse?.conclusion || 'N/A'}

Valuation Approach Outputs:
`;

  if (salesComparisonApproach) {
    prompt += `
Sales Comparison Approach:
Indicated Value: ${salesComparisonApproach.indicatedValueBySCA ? `\$${salesComparisonApproach.indicatedValueBySCA.toLocaleString()}` : 'N/A'}
Confidence: ${salesComparisonApproach.confidenceScore || 'N/A'}
Narrative: ${salesComparisonApproach.narrative || 'N/A'}
Adjustment Grid Summary: ${(salesComparisonApproach.adjustmentGrid && salesComparisonApproach.adjustmentGrid.comparables) ? `Used ${salesComparisonApproach.adjustmentGrid.comparables.length} comparables.` : 'N/A'}
`;
  } else {
    prompt += `
Sales Comparison Approach: Not provided or not applicable.
`;
  }

  if (incomeApproach) {
    prompt += `
Income Approach:
Indicated Value: ${incomeApproach.indicatedValueByIA ? `\$${incomeApproach.indicatedValueByIA.toLocaleString()}` : 'N/A'}
Confidence: ${incomeApproach.confidenceScore || 'N/A'}
Narrative: ${incomeApproach.narrative || 'N/A'}
Key Assumptions: ${incomeApproach.valuationResultsUpdate?.keyAssumptions || 'N/A'}
`;
  } else {
    prompt += `
Income Approach: Not provided or not applicable.
`;
  }

  if (costApproach) {
    prompt += `
Cost Approach:
Indicated Value: ${costApproach.indicatedValueByCA ? `\$${costApproach.indicatedValueByCA.toLocaleString()}` : 'N/A'}
Confidence: ${costApproach.confidenceScore || 'N/A'}
Narrative: ${costApproach.narrative || 'N/A'}
Depreciation Estimate: ${costApproach.valuationResultsUpdate?.totalDepreciation ? `\$${costApproach.valuationResultsUpdate.totalDepreciation.toLocaleString()}`: 'N/A'}
`;
  } else {
    prompt += `
Cost Approach: Not provided or not applicable.
`;
  }

  // Add user-provided reconciliation inputs if available
  if (userReconciliationInputs?.rationale || userReconciliationInputs?.finalValueOpinion) {
    prompt += `

Appraiser-Provided Reconciliation Guidance:
`;
    if (userReconciliationInputs.finalValueOpinion) {
      prompt += `- Appraiser's Concluded Final Value Opinion: \$${userReconciliationInputs.finalValueOpinion.toLocaleString()}\n`;
    }
    if (userReconciliationInputs.rationale) {
      prompt += `- Appraiser's Rationale/Weighting: ${userReconciliationInputs.rationale}\n`;
    }
    prompt += `Consider this guidance heavily when forming your reconciliation and narrative.
`;
  }

  prompt += `
Reconciliation Task:
1.  Critically evaluate each valuation approach utilized. Consider its applicability to the subject property type, the reliability of the data used, and the strengths and weaknesses of the methodology in this specific case. 
    ${userReconciliationInputs?.rationale ? "Incorporate the appraiser\'s provided rationale regarding weighting." : "Determine appropriate weighting based on standard appraisal principles."}
2.  Discuss the range of values indicated by the approaches.
3.  Explain the rationale for placing more or less weight on particular approaches. For example, the Sales Comparison Approach is often most relevant for residential properties, while the Income Approach might be primary for income-producing commercial properties. The Cost Approach may be more relevant for new construction or unique properties.
4.  Clearly state your final reconciled opinion of market value. 
    ${userReconciliationInputs?.finalValueOpinion ? "This should align with or justify any significant deviation from the appraiser\'s provided final value opinion." : ""}
5.  Provide a comprehensive narrative explaining your reasoning. This narrative should be suitable for inclusion in a formal appraisal report.
6.  Assign a confidence score (0.0 to 1.0) to your final reconciled value.

Output Format:
Provide your response as a JSON object adhering to the following schema:
{
  "reconciledValue": number, // Final reconciled market value
  "narrative": "string", // Detailed reconciliation narrative
  "confidenceScore": number, // Confidence score (0.0 to 1.0)
  "sources": ["string"] // Optional: List of any external tools or specific data points you used beyond the provided inputs.
}

Begin your analysis now.
`;

  return prompt;
}

export const reconciliationFlow = defineFlow(
  {
    name: 'reconciliationFlow',
    inputSchema: ReconciliationInputSchema,
    outputSchema: ReconciliationOutputSchema,
    promptConfig: {
      temperature: 0.2, // Lower temperature for more deterministic reconciliation
    },
  },
  async (input: ReconciliationInput) => {
    const prompt = assembleReconciliationPrompt(input);

    const llmResponse = await geminiPro.generate({
      prompt: prompt,
      output: {
        format: 'json',
        schema: ReconciliationOutputSchema,
      },
    });

    const output = llmResponse.output();
    if (!output) {
      throw new Error('No output from LLM in reconciliationFlow');
    }
    return output;
  }
); 