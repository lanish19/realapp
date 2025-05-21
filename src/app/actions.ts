"use server";

import { generateCoverLetter, type CoverLetterInput } from '@/ai/flows/cover-letter-generation';
import { generateExecutiveSummary, type ExecutiveSummaryInput } from '@/ai/flows/executive-summary-generation';
import { generateSiteDescription, type SiteDescriptionInput } from '@/ai/flows/site-description-generation';
import { generateMarketAnalysis, type MarketAnalysisInput } from '@/ai/flows/market-analysis-generation';
import { generateHbu, type HbuInput } from '@/ai/flows/hbu-generation';
import { generateCertification, type CertificationInput } from '@/ai/flows/certification-generation';
import { z } from 'zod';
import { AppraisalCaseFileSchema, type AppraisalCaseFile } from '@/lib/appraisal-case-file';
import { masterReportGenerationFlow } from '@/ai/flows/master-report-generation';
import { salesComparisonApproachFlow } from '@/ai/flows/sales-comparison-approach-flow';
import { incomeApproachFlow } from '@/ai/flows/income-approach-flow';
import { costApproachFlow } from '@/ai/flows/cost-approach-flow';
import { reconciliationFlow } from '@/ai/flows/reconciliation-flow';
import { generateExecutiveSummaryWithCaseFile } from '@/ai/flows/executive-summary-generation';
import { generateCoverLetterWithCaseFile } from '@/ai/flows/cover-letter-generation';
import { complianceCheckFlow, type ComplianceCheckOutput } from '@/ai/flows/compliance-check-flow';

const formSchema = z.object({
  propertyAddress: z.string().min(5, "Property address must be at least 5 characters."),
  intendedUse: z.string().min(5, "Intended use must be at least 5 characters."),
  intendedUser: z.string().min(3, "Intended user must be at least 3 characters."),
  city: z.string().min(2, "City is required for market analysis."),
  county: z.string().min(2, "County is required for market analysis."),
  marketRentPerSF: z.coerce.number().min(0),
  vacancyRate: z.coerce.number().min(0).max(1),
  operatingExpenses: z.coerce.number().min(0),
  capRate: z.coerce.number().min(0).max(1),
  discountRate: z.coerce.number().min(0).max(1).optional(),
  landValue: z.coerce.number().min(0),
  costNew: z.coerce.number().min(0),
  totalDepreciation: z.coerce.number().min(0),
  userRationale: z.string().min(5),
  finalUserValue: z.coerce.number().min(0),
});

export type ValuGenFormInput = z.infer<typeof formSchema>;

export type ReportSectionsOutput = {
  // Existing sections
  coverLetter?: string;
  executiveSummary?: string;
  siteDescription?: string; // Covers Property ID, Site, parts of Improvement
  marketAnalysis?: string; // Covers Area/Neighborhood
  hbuAnalysis?: string;
  certification?: string; // Covers Certification & Limiting Conditions

  // New placeholder sections based on user's list
  reportingOption?: string;
  definitionOfMarketValue?: string;
  feeSimpleEstate?: string;
  purposeOfTheAppraisal?: string; // Partially covered by user input/cover letter
  appraisalDate?: string; // Placeholder, linked to effectiveDateOfValue
  intendedUseOfReport?: string; // User input
  intendedUserOfReport?: string; // User input
  scopeOfAssignment?: string;
  exposureTime?: string;
  marketingTime?: string;
  competencyProvision?: string;
  licenseProvision?: string;
  propertyIdentification?: string; // Covered by siteDescription, but can be a distinct placeholder
  areaAndNeighborhoodDescription?: string; // Covered by marketAnalysis
  neighborhoodDescription?: string; // Covered by marketAnalysis
  improvementDescription?: string; // Partially covered by siteDescription
  ownershipSalesHistoryLegalDescription?: string;
  assessment?: string;
  zoning?: string; // Covered by siteDescription
  valuationMethodologyAnalysis?: string;
  salesComparisonApproach?: string;
  incomeApproachValuation?: string;
  incomeAndExpenseStatement?: string;
  reconcilementOfOpinion?: string;

  error?: string;
};

// These placeholders are for data not yet derived from other agents (like ValuationAgent) or configuration
const PLACEHOLDER_APPRAISED_VALUE = "$1,234,567";
const PLACEHOLDER_REPORT_DATE = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const PLACEHOLDER_EFFECTIVE_DATE_OF_VALUE = PLACEHOLDER_REPORT_DATE; // Typically the date of inspection or as defined
const PLACEHOLDER_APPRAISER_NAME = "ValuGen Certified Appraiser";
const PLACEHOLDER_APPRAISER_TITLE = "MAI, AI-GRS";
const PLACEHOLDER_APPRAISER_LICENSE = "State Certified General REA #CG-12345";
const PLACEHOLDER_APPRAISER_COMPANY = "ValuGen Appraisal Services";


/**
 * Simulates fetching minimal necessary details for agents that rely on web search for the bulk of their data.
 * Provides core user inputs and some basic interpretations (like propertyTypeActual).
 * The goal is for narrative agents to become self-sufficient in data gathering via search.
 */
async function getBasePropertyContext(address: string, city: string, county: string, intendedUse: string, intendedUser: string) {
  console.log(`Getting base context for: ${address} in ${city}, ${county}`);
  // Basic interpretation to guide agents. Actual type details would be found via search by SiteDescriptionAgent.
  const isCommercialAddress = address.toLowerCase().includes("commercial") ||
                              address.toLowerCase().includes("plaza") ||
                              address.toLowerCase().includes("center") ||
                              address.toLowerCase().includes("blvd") ||
                              address.toLowerCase().includes("industrial") ||
                              address.toLowerCase().includes("tech park") ||
                              city.toLowerCase().includes("commerce city");

  const propertyTypeActual = isCommercialAddress ? "Commercial Property (General)" : "Residential Property (General)";

  // Generic client address placeholders for Cover Letter, which CoverLetterAgent might try to verify/augment via search.
  const randomInt = Math.random();
  const clientAddressLine1 = randomInt < 0.4 ? "100 Finance Tower" : (randomInt < 0.7 ? "Acquisitions Department" : "PO Box 54321");
  const clientAddressLine2 = randomInt < 0.3 ? "Loan Origination Unit, MS 10A" : (randomInt < 0.6 ? "Suite 200" : "");
  const clientCityStateZip = randomInt < 0.4 ? "Major City, MC 10001" : (randomInt < 0.7 ? `Regional Hub, RH 60606` : `${city}, ST 90210 (Generic)`);

  return {
    propertyTypeActual,
    clientAddressLine1,
    clientAddressLine2,
    clientCityStateZip,
    // Removed most detailed property fields; agents must search for these.
    // Passing through user inputs that are critical context
    intendedUse,
    intendedUser,
  };
}


export async function generateFullReportAction(data: ValuGenFormInput): Promise<AppraisalCaseFile | { error: string }> {
  try {
    // Use the orchestrator flow for full report generation
    const caseFile = await masterReportGenerationFlow(data);

    // For now, return the main report sections from the case file
    return caseFile;
  } catch (e: any) {
    return { error: e.message || 'An unexpected error occurred.' };
  }
}

export async function regenerateSalesComparisonSection(caseFile: AppraisalCaseFile) {
  const result = await salesComparisonApproachFlow({ caseFile });
  return {
    narrative: result.narrative,
    output: result,
    confidenceScore: result.confidenceScore,
  };
}

export async function regenerateIncomeApproachSection(caseFile: AppraisalCaseFile, params: { marketRentPerSF: number; vacancyRate: number; operatingExpenses: number; capRate: number; discountRate?: number }) {
  const result = await incomeApproachFlow({
    appraisalCaseFile: caseFile,
    ...params,
  });
  return {
    narrative: result.narrative,
    output: result,
    confidenceScore: result.confidenceScore,
  };
}

export async function regenerateCostApproachSection(caseFile: AppraisalCaseFile, params: { landValue: number; costNew: number; totalDepreciation: number }) {
  const result = await costApproachFlow({
    appraisalCaseFile: caseFile,
    ...params,
  });
  return {
    narrative: result.narrative,
    output: result,
    confidenceScore: result.confidenceScore,
  };
}

export async function regenerateReconciliationSection(caseFile: AppraisalCaseFile, params: { userRationale: string; finalUserValue: number }) {
  const updatedCaseFile: AppraisalCaseFile = {
      ...caseFile,
      userReconciliationInputs: {
          ...(caseFile.userReconciliationInputs || {}), // Preserve existing fields if any
          rationale: params.userRationale,
          finalValueOpinion: params.finalUserValue,
      }
  };

  const result = await reconciliationFlow({
    appraisalCaseFile: updatedCaseFile,
    salesComparisonApproach: updatedCaseFile.valuationResults?.salesComparisonApproach,
    incomeApproach: updatedCaseFile.valuationResults?.incomeApproach,
    costApproach: updatedCaseFile.valuationResults?.costApproach,
  });
  return {
    narrative: result.narrative,
    output: result,
  };
}

export async function regenerateComplianceCheckSection(caseFile: AppraisalCaseFile): Promise<ComplianceCheckOutput> {
  try {
    const result = await complianceCheckFlow({ appraisalCaseFile: caseFile });
    return result;
  } catch (e: any) {
    console.error("Error in regenerateComplianceCheckSection:", e);
    return {
      checksPassed: [`Error: ${e.message}`],
      potentialIssues: [{ section: "Overall Error", issue: e.message || 'An unexpected error occurred during compliance check regeneration.', recommendation: "Check server logs and retry." }],
      overallComplianceScore: 0,
    };
  }
}

export async function saveSalesComparisonGrid(caseFile: AppraisalCaseFile, newGrid: any) {
  return {
    ...caseFile,
    valuationResults: {
      ...(caseFile.valuationResults || {}),
      salesComparison: {
        ...(caseFile.valuationResults?.salesComparison || {}),
        adjustmentGrid: newGrid,
      },
    },
  };
}

export async function saveIncomeProForma(caseFile: AppraisalCaseFile, newProForma: any) {
  return {
    ...caseFile,
    valuationResults: {
      ...(caseFile.valuationResults || {}),
      income: {
        ...(caseFile.valuationResults?.income || {}),
        proForma: newProForma,
      },
    },
  };
}

export async function saveCostApproachData(caseFile: AppraisalCaseFile, newCostData: any) {
  return {
    ...caseFile,
    valuationResults: {
      ...(caseFile.valuationResults || {}),
      cost: newCostData,
    },
  };
}

export async function regenerateExecutiveSummarySection(caseFile: AppraisalCaseFile) {
  const result = await generateExecutiveSummaryWithCaseFile(caseFile);
  return {
    narrative: result.narratives?.executiveSummary,
    output: result,
  };
}

export async function regenerateCoverLetterSection(caseFile: AppraisalCaseFile) {
  const result = await generateCoverLetterWithCaseFile(caseFile);
  return {
    narrative: result.narratives?.coverLetter,
    output: result,
  };
}

    