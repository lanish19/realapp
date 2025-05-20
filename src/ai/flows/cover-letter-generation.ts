'use server';

/**
 * @fileOverview Generates a cover letter for the appraisal report.
 * Relies on provided appraiser/client details and value conclusions.
 * Will use web search for standard phrasing, client address verification, or formatting if needed.
 *
 * - generateCoverLetter - A function that generates the cover letter.
 * - CoverLetterInput - The input type for the generateCoverLetter function.
 * - CoverLetterOutput - The return type for the generateCoverLetter function.
 */

import {ai} from '@/ai/genkit';
// @ts-ignore
import { z } from 'zod';
import { AppraisalCaseFile } from '@/lib/appraisal-case-file';

export const CoverLetterInputSchema = z.object({
  clientName: z.string().describe('The name of the client or intended user to whom the letter is addressed (user input).'),
  clientAddressLine1: z.string().optional().describe('The first line of the client\'s address (e.g., "123 Lender Lane") - may be a placeholder. If incomplete, AI will attempt to search.'),
  clientAddressLine2: z.string().optional().describe('The second line of the client\'s address (e.g., "Suite 100") - may be a placeholder. If incomplete, AI will attempt to search.'),
  clientCityStateZip: z.string().optional().describe('The city, state, and ZIP code of the client (e.g., "Financeville, FS 98765") - may be a placeholder. If incomplete, AI will attempt to search.'),
  propertyAddressFull: z.string().describe('The full street address of the property being appraised (from AppraisalCaseFile).'),
  intendedUse: z.string().describe('The intended use of the appraisal (from AppraisalCaseFile).'),
  appraisedValue: z.string().describe('The final appraised value of the property, including currency (populated in AppraisalCaseFile by ReconciliationAgent).'),
  effectiveDateOfValue: z.string().describe('The effective date of the valuation (populated in AppraisalCaseFile by ReconciliationAgent or earlier).'),
  reportDate: z.string().describe('The date the appraisal report is being issued (from AppraisalCaseFile).'),
  appraiserName: z.string().describe('The name of the appraiser signing the letter (from AppraisalCaseFile).'),
  appraiserTitle: z.string().optional().describe('The title of the appraiser (from AppraisalCaseFile).'),
  appraiserLicense: z.string().optional().describe('The license number and state of the appraiser (from AppraisalCaseFile).'),
  appraiserCompany: z.string().optional().describe('The name of the appraisal company (from AppraisalCaseFile).'),
});
export type CoverLetterInput = z.infer<typeof CoverLetterInputSchema>;

const CoverLetterOutputSchema = z.object({
  coverLetter: z.string().describe('The generated cover letter text, formatted professionally.'),
  searchedClientAddressLine1: z.string().optional().describe('The first line of the client\'s address, potentially updated from web search.'),
  searchedClientAddressLine2: z.string().optional().describe('The second line of the client\'s address, potentially updated from web search.'),
  searchedClientCityStateZip: z.string().optional().describe('The city, state, and ZIP code of the client, potentially updated from web search.'),
  clientAddressConfidenceScore: z.number().optional().describe('Confidence score (0.0-1.0) for the accuracy of the client address used/found.'),
  confidenceScore: z.number().optional().describe('Overall confidence in the cover letter (0.0-1.0), based on the reliability and completeness of all included information.'),
});
export type CoverLetterOutput = z.infer<typeof CoverLetterOutputSchema>;

export async function generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterOutput> {
  // This function might be deprecated if all calls go through generateCoverLetterWithCaseFile
  // For now, it would need a way to assemble a minimal caseFile or call the flow directly
  console.warn("generateCoverLetter direct call is likely deprecated in favor of generateCoverLetterWithCaseFile");
  // To make it work, it would need to create a mock caseFile or the prompt needs to be adaptable
  // For simplicity, let's assume it will be removed or refactored if direct calls are needed.
  // For now, just returning a placeholder to satisfy type checks if it were called.
  return coverLetterFlow(input, { caseFile: {} as AppraisalCaseFile }); // This will likely fail if caseFile is not complete
}

export async function generateCoverLetterWithCaseFile(caseFile: AppraisalCaseFile): Promise<Partial<AppraisalCaseFile>> {
  const input: CoverLetterInput = {
    clientName: caseFile.clientDetails?.name || caseFile.clientName || caseFile.intendedUser || '', // Use clientDetails first, then top-level clientName
    clientAddressLine1: caseFile.clientDetails?.addressLine1 || undefined,
    clientAddressLine2: caseFile.clientDetails?.addressLine2 || undefined,
    clientCityStateZip: caseFile.clientDetails?.cityStateZip || undefined,
    propertyAddressFull: caseFile.propertyAddress,
    intendedUse: caseFile.intendedUse,
    appraisedValue: caseFile.finalReconciledValue ? `\$${caseFile.finalReconciledValue.toLocaleString()}` : 'Value Not Determined',
    effectiveDateOfValue: caseFile.effectiveDate || '',
    reportDate: caseFile.reportDate || '',
    appraiserName: caseFile.appraiserDetails?.name || '',
    appraiserTitle: caseFile.appraiserDetails?.title || undefined,
    appraiserLicense: caseFile.appraiserDetails?.license || undefined,
    appraiserCompany: caseFile.appraiserDetails?.company || undefined,
  };
  
  const result = await coverLetterFlow(input, { caseFile }); // Pass caseFile in context
  
  const updatedClientDetails = {
    name: result.searchedClientAddressLine1 || result.searchedClientAddressLine2 || result.searchedClientCityStateZip ? input.clientName : (caseFile.clientDetails?.name || input.clientName),
    addressLine1: result.searchedClientAddressLine1 || caseFile.clientDetails?.addressLine1,
    addressLine2: result.searchedClientAddressLine2 || caseFile.clientDetails?.addressLine2,
    cityStateZip: result.searchedClientCityStateZip || caseFile.clientDetails?.cityStateZip,
  };

  return {
    narratives: {
      ...caseFile.narratives,
      coverLetter: result.coverLetter,
    },
    clientDetails: updatedClientDetails, // Update clientDetails
    confidenceScoresOverall: {
        ...(caseFile.confidenceScoresOverall || {}),
        coverLetter: result.confidenceScore,
        clientAddressSearch: result.clientAddressConfidenceScore
    }
  };
}

// New: Dynamic prompt assembly function
function assembleCoverLetterPrompt(caseFile: AppraisalCaseFile): string {
  const clientName = caseFile.clientDetails?.name || caseFile.clientName || caseFile.intendedUser || '[Client Name Not Provided]';
  const initialClientAddressLine1 = caseFile.clientDetails?.addressLine1 || '[Address Line 1 Placeholder]';
  const initialClientAddressLine2 = caseFile.clientDetails?.addressLine2 || '';
  const initialClientCityStateZip = caseFile.clientDetails?.cityStateZip || '[City, State, Zip Placeholder]';
  
  const propertyAddressFull = caseFile.propertyAddress || '[Property Address Not Provided]';
  const intendedUse = caseFile.intendedUse || '[Intended Use Not Provided]';
  
  const appraisedValue = caseFile.finalReconciledValue 
    ? `\$${caseFile.finalReconciledValue.toLocaleString()}` 
    : '[Appraised Value Not Determined]';
  const effectiveDateOfValue = caseFile.effectiveDate || '[Effective Date Not Set]';
  const reportDate = caseFile.reportDate || '[Report Date Not Set]';
  
  const appraiserName = caseFile.appraiserDetails?.name || '[Appraiser Name Not Provided]';
  const appraiserTitle = caseFile.appraiserDetails?.title || '[Appraiser Title Not Provided]';
  const appraiserLicense = caseFile.appraiserDetails?.license || '[Appraiser License Not Provided]';
  const appraiserCompany = caseFile.appraiserDetails?.company || '[Appraiser Company Not Provided]';

  return `You are an expert real estate appraiser AI assistant drafting a formal cover letter (Letter of Transmittal) for an appraisal report.
Your output **MUST** be a JSON object with the following fields: "coverLetter" (string), "searchedClientAddressLine1" (string, optional), "searchedClientAddressLine2" (string, optional), "searchedClientCityStateZip" (string, optional), "clientAddressConfidenceScore" (number, 0.0-1.0), and "confidenceScore" (number, 0.0-1.0).

**Client Address Verification (CRITICAL):**
Initial Client Address Data: 
Line 1: ${initialClientAddressLine1}
Line 2: ${initialClientAddressLine2}
City, State, Zip: ${initialClientCityStateZip}

If these initial client address details (Line 1: '${initialClientAddressLine1}', Line 2: '${initialClientAddressLine2}', City/State/Zip: '${initialClientCityStateZip}') appear to be placeholders, incomplete, or generic (e.g., '123 Main St', 'Anytown, USA', '[Placeholder]'), you **MUST** use the google_search tool to find a plausible, complete, and public address for the client: '${clientName}'.

**Example Search Queries (for AI to formulate if address is generic/missing):**
- "'${clientName}' corporate headquarters address"
- "'${clientName}' office address in '${initialClientCityStateZip.split(',')[0] || 'relevant city'}'"
- "official public address for '${clientName}'"

Prioritize official business websites, reputable directories (e.g., Bloomberg, financial filings, state business registries). 
If your search yields a more accurate or complete address, use it in the letter and populate the 'searchedClientAddressLine1', 'searchedClientAddressLine2', and 'searchedClientCityStateZip' fields in your JSON output. If no better address is found, use the initial address data and leave these 'searched...' fields null or empty in the JSON. Assign a 'clientAddressConfidenceScore' (0.0-1.0) based on how certain you are about the client address you used (or found). A score of 0.0 if no search was attempted or successful and placeholders were used, up to 1.0 for a verified official address.

**Letter Content Instructions:**
1.  **Addressee & Address Block:** Use the (potentially searched and verified) client name and address.
2.  **Date:** Use '${reportDate}' as the date of the letter.
3.  **Salutation:** Formal salutation (e.g., "Dear ${clientName}:").
4.  **Opening:** State that the appraisal report for the property at '${propertyAddressFull}' is attached. Mention the effective date of value: '${effectiveDateOfValue}'.
5.  **Purpose:** Briefly state the intended use of the appraisal: '${intendedUse}'.
6.  **Value Conclusion:** Clearly state the final appraised value: '${appraisedValue}'.
7.  **Closing:** Offer to answer any questions. Use a professional closing (e.g., "Sincerely,").
8.  **Signature Block:** Include '${appraiserName}', '${appraiserTitle}', '${appraiserLicense}', and '${appraiserCompany}'.

**Format the 'coverLetter' field contents:**
- Proper letter formatting. Assume appraiser's details are part of a pre-defined letterhead; focus on the letter body starting with the date.
- Professional tone. Standard appraisal terminology.

**Example 'coverLetter' field structure (adapt based on provided details and search findings):**

${reportDate}

${clientName} // Potentially from searchedClientName if different/better
[Searched or Initial Client Address Line 1]
[Searched or Initial Client Address Line 2]
[Searched or Initial Client City, State, Zip]

RE: Appraisal of ${propertyAddressFull}

Dear ${clientName}:

Transmitted herewith is the appraisal report for the property located at ${propertyAddressFull}. The purpose of this appraisal was ${intendedUse}, and the effective date of the valuation is ${effectiveDateOfValue}.

Based on our analysis, the market value of the subject property, as of ${effectiveDateOfValue}, is concluded to be:

**${appraisedValue}**

We trust this report meets your requirements. Should you have any questions regarding the appraisal, please do not hesitate to contact us.

Sincerely,

${appraiserName}
${appraiserTitle}
${appraiserLicense}
${appraiserCompany}

---
**Generate the JSON output containing the 'coverLetter' and other specified fields based on these instructions and the following input data pulled from the AppraisalCaseFile:**
Client Name: ${clientName}
Initial Client Address Line 1: ${initialClientAddressLine1}
Initial Client Address Line 2: ${initialClientAddressLine2}
Initial Client City, State, Zip: ${initialClientCityStateZip}
Property Full Address: ${propertyAddressFull}
Intended Use of Appraisal: ${intendedUse}
Appraised Value: ${appraisedValue}
Effective Date of Value: ${effectiveDateOfValue}
Report Date: ${reportDate}
Appraiser Name: ${appraiserName}
Appraiser Title: ${appraiserTitle}
Appraiser License: ${appraiserLicense}
Appraiser Company: ${appraiserCompany}

Assign an overall 'confidenceScore' (0.0-1.0) for the entire cover letter generation process, considering data completeness and search success.
`;
}

// Refactored: Use dynamic prompt assembly in the flow
const coverLetterPrompt = ai.definePrompt({
  name: 'coverLetterPrompt',
  input: {schema: CoverLetterInputSchema},
  output: {schema: CoverLetterOutputSchema},
  prompt: '', // Will be set dynamically
});

export const coverLetterFlow = ai.defineFlow(
  {
    name: 'coverLetterFlow',
    inputSchema: CoverLetterInputSchema,
    outputSchema: CoverLetterOutputSchema,
  },
  async (input: CoverLetterInput, context?: { caseFile: AppraisalCaseFile }) => {
    try {
      // Expect context.caseFile to be passed in
      const caseFile: AppraisalCaseFile = context?.caseFile;
      const dynamicPrompt = assembleCoverLetterPrompt(caseFile);
      const {output} = await ai.runPrompt({
        ...coverLetterPrompt,
        prompt: dynamicPrompt,
        input,
      });

      if (!output) {
        // Return a default/error structure conforming to CoverLetterOutputSchema
        console.error('CoverLetterFlow: LLM returned no output.');
        return {
          coverLetter: "Error: Could not generate cover letter. LLM returned no output.",
          clientAddressConfidenceScore: 0,
          confidenceScore: 0,
        };
  }
      return output;
    } catch (error: any) {
      console.error("Error in coverLetterFlow:", error);
      // Return a default/error structure conforming to CoverLetterOutputSchema
      return {
        coverLetter: `Error generating cover letter: ${error.message}`,
        clientAddressConfidenceScore: 0,
        confidenceScore: 0,
      };
    }
  }
);

// Document: This pattern (assemble[Agent]Prompt + dynamic prompt in flow) should be applied to all agent flows for dynamic, context-driven prompt engineering.
