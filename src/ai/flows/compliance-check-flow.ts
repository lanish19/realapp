import { z } from 'zod';
import { defineFlow } from 'ai-genkit';
import { ai } from '@/ai/genkit'; // Assuming genkit instance is exported as 'ai'
import { AppraisalCaseFile, AppraisalCaseFileSchema } from '@/lib/appraisal-case-file'; // Corrected path

// Input schema: AppraisalCaseFile or full report text
export const ComplianceCheckInputSchema = z.object({
  appraisalCaseFile: AppraisalCaseFileSchema // Corrected to use the schema directly
    .describe("The comprehensive AppraisalCaseFile containing all data and generated narratives."),
  fullReportText: z.string().optional()
    .describe("Optional: The full assembled report text, if available, for a more holistic review."),
});

export type ComplianceCheckInput = z.infer<typeof ComplianceCheckInputSchema>;

// Output schema
export const ComplianceCheckOutputSchema = z.object({
  checksPassed: z.array(z.string())
    .describe("List of compliance checks that were successfully verified."),
  potentialIssues: z.array(z.object({
    section: z.string().describe("The report section where the issue was identified (e.g., 'Executive Summary', 'Reconciliation')."),
    issue: z.string().describe("A description of the potential compliance issue or inconsistency."),
    recommendation: z.string().describe("A suggestion for how to address the issue."),
  })).describe("List of potential issues found, with details."),
  overallComplianceScore: z.number().min(0).max(1).optional()
    .describe("An overall score (0.0-1.0) reflecting the perceived compliance level, where 1.0 is fully compliant."),
});

export type ComplianceCheckOutput = z.infer<typeof ComplianceCheckOutputSchema>;

function assembleComplianceCheckPrompt(input: ComplianceCheckInput): string {
  const caseFile = input.appraisalCaseFile;
  let reportContentForReview = "Key Data from AppraisalCaseFile:\n";

  // Serialize key information from AppraisalCaseFile for the LLM to review
  reportContentForReview += `- Property Address: ${caseFile.propertyAddress || 'N/A'}\n`;
  reportContentForReview += `- Effective Date: ${caseFile.effectiveDate || 'N/A'}\n`;
  reportContentForReview += `- Report Date: ${caseFile.reportDate || 'N/A'}\n`;
  reportContentForReview += `- Client Name: ${caseFile.clientDetails?.name || caseFile.clientName || 'N/A'}\n`; // Updated path
  reportContentForReview += `- Intended User: ${caseFile.intendedUser || 'N/A'}\n`;
  reportContentForReview += `- Intended Use: ${caseFile.intendedUse || 'N/A'}\n`;
  reportContentForReview += `- Definition of Market Value Source: ${caseFile.definitionOfMarketValueSource || 'N/A'}\n`;
  reportContentForReview += `- Scope of Work Summary: ${caseFile.narratives?.scopeOfWork || 'N/A (Not explicitly stored as narrative)'}\n`; // Adjusted path and comment
  reportContentForReview += `- Site Description Summary: ${caseFile.narratives?.siteDescription?.substring(0, 200) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Market Analysis Summary: ${caseFile.narratives?.marketAnalysis?.substring(0, 200) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- HBU Narrative Summary: ${caseFile.narratives?.hbuAnalysis?.substring(0, 200) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Sales Comparison Indicated Value: ${caseFile.valuationResults?.salesComparisonApproach?.indicatedValueBySCA?.toLocaleString() || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Income Approach Indicated Value: ${caseFile.valuationResults?.incomeApproach?.indicatedValueByIA?.toLocaleString() || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Cost Approach Indicated Value: ${caseFile.valuationResults?.costApproach?.indicatedValueByCA?.toLocaleString() || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Reconciliation Narrative Summary: ${caseFile.narratives?.reconciliation?.substring(0, 200) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Final Reconciled Value: ${caseFile.finalReconciledValue?.toLocaleString() || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Executive Summary Text: ${caseFile.narratives?.executiveSummary?.substring(0, 300) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Cover Letter Text (excerpt): ${caseFile.narratives?.coverLetter?.substring(0, 200) + '...' || 'N/A'}\n`; // Corrected path
  reportContentForReview += `- Certification Statements Present: ${caseFile.narratives?.certification ? 'Yes' : 'No'}\n`; // Corrected path
  reportContentForReview += `- Extraordinary Assumptions: ${caseFile.extraordinaryAssumptions || 'None Stated'}\n`;
  reportContentForReview += `- Hypothetical Conditions: ${caseFile.hypotheticalConditions || 'None Stated'}\n`;

  if (input.fullReportText) {
    reportContentForReview = `Full Report Text Provided (excerpt below, full text in context if LLM supports large context):\n${input.fullReportText.substring(0, 2000)}...\n\nReview the full text for comprehensive analysis, then supplement with the key data from AppraisalCaseFile if needed:\n${reportContentForReview}`;
  }

  return `You are an expert USPAP Compliance Reviewer AI. Analyze the provided appraisal report information for compliance with standard appraisal practices and USPAP principles.\n\n--- REPORT CONTENT FOR REVIEW ---\n${reportContentForReview}\n---\n\n**Perform the following checks and report your findings in the specified JSON output format:**\n\n1.  **USPAP Checklist Verification:** Based on the provided data, verify the presence and apparent adequacy of these elements. For each, add to 'checksPassed' if adequate, or list in 'potentialIssues' if missing/problematic.\n    *   Stated Intended Use and Intended Users: Are they clearly identified?\n    *   Definition of Market Value: Is a source or the definition itself cited or present?\n    *   Scope of Work: Is there a summary of the scope of work undertaken?\n    *   Certification: Are certification statements indicated as present?\n    *   Consideration of Approaches: Is there evidence that all three valuation approaches (Sales, Income, Cost) were considered? If an approach was excluded, is a justification implicitly or explicitly available (e.g., HBU suggests new construction, making Cost Approach relevant; or property is non-income producing, making Income Approach less relevant)?\n    *   Reconciliation: Is a reconciliation narrative and final value present?\n    *   Effective Date and Report Date: Are both dates clearly identifiable?\n\n2.  **Consistency Checks:** Identify and report any inconsistencies in 'potentialIssues'.\n    *   Final Value Consistency: Compare the Final Reconciled Value with values mentioned in the Executive Summary and Cover Letter (if value is present in those summaries).\n    *   Key Data Consistency: Check for consistency of Property Address, Property Size (if available in multiple sections), and Effective Date across different report sections summarized above.\n\n3.  **General Review & Keyword/Phrase Flagging (Qualitative):** Review the summarized narratives.\n    *   Clarity and Professionalism: Does the language appear clear and professional?\n    *   Unsupported Claims: Are there any phrases that seem like strong conclusions without clear support from the summarized data (e.g., "the market is rapidly declining" without supporting market analysis data)?\n    *   Potential Bias: Is there any language that could be construed as biased or promoting a particular outcome?\n    *   Misleading Statements: Are there any statements that could be misleading?\n    *   (For this qualitative review, focus on clear examples. If narratives are short or N/A, state that.)\n\n4.  **Overall Compliance Score (0.0 to 1.0):** Based on your review, provide an estimated overall compliance score. 1.0 means no significant issues found. 0.0 means multiple critical issues.\n\n**Output Format:**\nReturn a single JSON object matching the ComplianceCheckOutputSchema, containing:\n-   \`checksPassed\`: An array of strings listing checks that were successfully verified (e.g., ["Intended Use Stated", "Effective Date Clear"]).\n-   \`potentialIssues\`: An array of objects, where each object has \`section\`, \`issue\`, and \`recommendation\` for each identified problem.\n-   \`overallComplianceScore\`: A number between 0.0 and 1.0.\n\nFocus on the information explicitly provided. If information for a check is marked 'N/A' or clearly missing from the summary, note it as a potential issue for that specific check.\n---\n`;
}

export const complianceCheckFlow = defineFlow({
  name: 'complianceCheckFlow',
  inputSchema: ComplianceCheckInputSchema,
  outputSchema: ComplianceCheckOutputSchema,
  async run({
    input,
    // tools, // Not directly used for this type of analytical review flow
    // context,
  }: {
    input: ComplianceCheckInput;
    tools: any; // Replace with specific Genkit tools type if available
    context: any; // Replace with specific Genkit context type if available
  }) {
    try {
      const prompt = assembleComplianceCheckPrompt(input);

      const { output } = await ai.runPrompt({
        name: 'complianceCheckAnalysisPrompt',
        output: { schema: ComplianceCheckOutputSchema },
        prompt,
      });

      if (!output) {
        console.error('ComplianceCheckFlow: LLM returned no output.');
        return {
          checksPassed: ["Error: LLM returned no output"],
          potentialIssues: [{ section: "Overall", issue: "LLM returned no output for compliance check.", recommendation: "Retry generation." }],
          overallComplianceScore: 0,
        };
      }
      return output;
    } catch (error: any) {
      console.error("Error in complianceCheckFlow:", error);
      return {
        checksPassed: [`Error: ${error.message}`],
        potentialIssues: [{ section: "Overall", issue: error.message, recommendation: "Check error logs and retry." }],
        overallComplianceScore: 0,
      };
    }
  },
}); 