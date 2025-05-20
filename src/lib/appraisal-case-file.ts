import { z } from 'zod';
// import { ComparableSaleSchema } from '../ai/flows/comparable-sales-flow'; // Removed to break circular dependency
import { SalesComparisonApproachOutputSchema } from '../ai/flows/sales-comparison-approach-flow';
import { IncomeApproachOutputSchema } from '../ai/flows/income-approach-flow';
import { CostApproachOutputSchema } from '../ai/flows/cost-approach-flow';
import { ComplianceCheckOutputSchema } from '../ai/flows/compliance-check-flow';

// Moved from comparable-sales-flow.ts to break circular dependency
export const ComparableSaleSchema = z.object({
  compNumber: z.number().optional(),
  address: z.string(),
  city: z.string().optional(),
  county: z.string().optional(),
  saleDate: z.string(),
  salePrice: z.number(),
  propertyType: z.string().optional(),
  source: z.string().optional(), // Where this comparable was found (e.g., MLS, Public Record, CoStar)
  buildingSizeSqFt: z.number().optional(),
  lotSizeSqFt: z.number().optional(),
  lotSizeAcres: z.number().optional(),
  yearBuilt: z.number().optional(),
  briefDescription: z.string().optional(),
  distanceToSubjectMiles: z.number().optional(),
  relevanceScore: z.number().min(0).max(1).optional(), // How relevant this comp is to the subject
  confidenceScore: z.number().min(0).max(1).optional(), // Confidence in the accuracy of this comp's data
});
export type ComparableSale = z.infer<typeof ComparableSaleSchema>;

// Define PropertyDetailsSchema separately for export and use
export const PropertyDetailsSchema = z.object({
  general: z.object({
    propertyType: z.string().optional(),
    yearBuilt: z.number().optional(),
    sizeSqFt: z.number().optional(), // Gross Building Area typically
  }).optional(),
  ownerName: z.string().optional(),
  parcelId: z.string().optional(), // Can be from GDB (e.g., PROP_ID or CAMA_ID) or web
  locationId: z.string().optional(), // Specifically for GDB LOC_ID
  camaId: z.string().optional(), // From GDB
  townId: z.string().optional(), // From GDB
  fiscalYear: z.string().optional(), // From GDB assessment data
  legalDescriptionSource: z.string().optional(), 
  lotSizeAcres: z.number().optional(),
  lotSizeSqFt: z.number().optional(),
  lotUnits: z.string().optional(), // From GDB (e.g. AC, SF)
  siteDimensions: z.string().optional(), 
  propertyClassCode: z.string().optional(), 
  assessedBuildingValue: z.number().optional(), // From GDB (BLDG_VAL)
  assessedLandValue: z.number().optional(), // From GDB (LAND_VAL)
  assessedTotalValue: z.number().optional(), // From GDB (TOTAL_VAL) or web (assessedValueTotal)
  lastSaleDate: z.string().optional(), 
  lastSalePrice: z.number().optional(), 
  lotDimensions: z.string().optional(),
  topography: z.string().optional(),
  accessDetails: z.string().optional(),
  visibility: z.string().optional(),
  zoningCode: z.string().optional(), 
  zoningDescription: z.string().optional(),
  useCode: z.string().optional(), // From GDB
  useDescription: z.string().optional(), // From GDB (M001UC_LUT)
  permittedUsesSummary: z.string().optional(),
  keyDimensionalRequirements: z.string().optional(),
  utilitiesAvailable: z.array(z.string()).optional(),
  femaFloodZoneId: z.string().optional(),
  femaPanelNumber: z.string().optional(),
  femaMapEffectiveDate: z.string().optional(),
  femaFloodSource: z.string().optional(), 
  easementsObservedOrReported: z.string().optional(),
  environmentalConcernsNoted: z.string().optional(),
  siteImprovementsNarrative: z.string().optional(),
  shapeArea: z.number().optional(), // From GDB
  shapeLength: z.number().optional(), // From GDB
  polyType: z.string().optional(), // From GDB
  improvementsSummary: z.object({
    type: z.string(),
    sizeSqFt: z.number().optional(),
    yearBuilt: z.number().optional(),
    condition: z.string().optional(),
    style: z.string().optional(),
    stories: z.number().optional(),
    units: z.number().optional(),
    residentialArea: z.number().optional(),
    numberOfRooms: z.number().optional(),
  }).optional(),
  confidenceScores: z.record(z.number()).optional(), 
});

// Schema for individual data source detail from web extraction
export const DataSourceDetailSchema = z.object({
  item: z.string().describe("Data item extracted (e.g., Parcel ID, Owner Name)."),
  value: z.any().describe("The extracted value."),
  source: z.string().describe("Specific source of the data (e.g., MassGIS Statewide Property Sales Viewer, Middlesex South Registry of Deeds, Boston Assessor Database)."),
  queryUsed: z.string().optional().describe("Example search query used or simulated."),
  confidence: z.number().min(0).max(1).describe("Confidence score for this specific data point."),
});

// Schema for preliminary comparable sales found by MarketAnalysisAgent
export const PreliminaryComparableSaleSchema = z.object({
  address: z.string(),
  saleDate: z.string(),
  salePrice: z.number(),
  sizeSqFt: z.number().optional(), // Note: uses sizeSqFt, not buildingSizeSqFt like full ComparableSaleSchema
  propertyType: z.string(),
  source: z.string(),
  confidenceScore: z.number(),
});

// Centralized AppraisalCaseFile schema for all appraisal data
export const AppraisalCaseFileSchema = z.object({
  // Initial user inputs
  reportId: z.string(),
  creationDate: z.string(),
  propertyAddress: z.string(),
  city: z.string(),
  county: z.string(),
  state: z.string(),
  zipCode: z.string(),
  propertyType: z.string(), 
  effectiveDate: z.string(),
  reportDate: z.string(),
  clientName: z.string(),
  intendedUse: z.string(),
  intendedUser: z.string(),
  finalReconciledValue: z.number().optional(), 
  extraordinaryAssumptions: z.string().optional(),
  hypotheticalConditions: z.string().optional(),
  definitionOfMarketValueSource: z.string().optional(),

  clientDetails: z.object({ // Added for cover letter and general client info
    name: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    cityStateZip: z.string().optional(),
  }).optional(),

  appraiserDetails: z.object({ 
    name: z.string().optional(),
    license: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(), // Added appraiser title
  }).optional(),

  narratives: z.object({ 
    siteDescription: z.string().optional(),
    marketAnalysis: z.string().optional(),
    hbuAnalysis: z.string().optional(),
    salesComparisonApproach: z.string().optional(),
    incomeApproach: z.string().optional(),
    costApproach: z.string().optional(),
    reconciliation: z.string().optional(),
    executiveSummary: z.string().optional(),
    coverLetter: z.string().optional(),
    certification: z.string().optional(),
    complianceReport: z.string().optional(), 
  }).optional(),

  propertyDetails: PropertyDetailsSchema.optional(), 

  marketData: z.object({
    comparableSales: z.array(ComparableSaleSchema).optional(),
    comparableSearchSummary: z.string().optional(),
    majorIndustries: z.array(z.string()).optional(),
    majorEmployers: z.array(z.string()).optional(),
    unemploymentRateCounty: z.number().optional(),
    unemploymentRateState: z.number().optional(),
    unemploymentTrend: z.string().optional(),
    significantEconomicDevelopments: z.string().optional(),
    populationCity: z.number().optional(),
    populationCounty: z.number().optional(),
    populationChangePercent: z.number().optional(),
    medianHouseholdIncome: z.number().optional(),
    perCapitaIncome: z.number().optional(),
    povertyRate: z.number().optional(),
    demographicTrends: z.string().optional(),
    propertyTypeVacancyRate: z.number().optional(),
    propertyTypeAvgRentalRate: z.string().optional(), 
    newConstructionActivity: z.string().optional(),
    absorptionRate: z.string().optional(),
    investorSentiment: z.string().optional(),
    capRateTrends: z.string().optional(),
    salesActivitySummary: z.string().optional(),
    neighborhoodSubmarketAnalysis: z.string().optional(),
    preliminaryComparableSales: z.array(PreliminaryComparableSaleSchema).optional(),
    confidenceScores: z.record(z.number()).optional(), 
  }).optional(),
  
  valuationResults: z.object({ 
    salesComparisonApproach: SalesComparisonApproachOutputSchema.optional(),
    incomeApproach: IncomeApproachOutputSchema.optional(),
    costApproach: CostApproachOutputSchema.optional(),
    valuationApproachesSummary: z.string().optional(), 
  }).optional(),

  metaData: z.object({ 
    webExtractionDetails: z.array(DataSourceDetailSchema).optional(),
    webExtractionOverallConfidence: z.number().optional(),
    gdbQueryStatus: z.enum(['ATTEMPTED', 'SUCCESS', 'NOT_FOUND', 'ERROR', 'SKIPPED']).optional(),
    gdbErrorMessage: z.string().optional(),
    gdbSourceLocId: z.string().optional(),
    gdbMatchConfidence: z.number().optional(),
    propertyDataSourcePrimary: z.enum(['GDB', 'WEB', 'NONE']).optional(),
    propertyDataSourceSecondary: z.enum(['GDB', 'WEB', 'NONE']).optional(),
  }).optional(),

  confidenceScoresOverall: z.record(z.number()).optional(),
  
  statusFlags: z.record(z.string()).optional(),

  userReconciliationInputs: z.object({
    rationale: z.string().optional(),
    finalValueOpinion: z.number().optional(),
  }).optional(),

  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
    flowError: z.boolean().optional(),
  }).optional(),

  complianceCheckOutput: ComplianceCheckOutputSchema.optional(),
});

export type AppraisalCaseFile = z.infer<typeof AppraisalCaseFileSchema>;

// Schema for ValuGenFormInput - based on fields accessed in masterReportGenerationFlow
export const ValuGenFormInputSchema = z.object({
  propertyAddress: z.string(),
  city: z.string(),
  county: z.string(),
  state: z.string(),
  zipCode: z.string(),
  propertyType: z.string(),
  yearBuilt: z.number().optional(),
  buildingSizeSqFt: z.number().optional(),
  effectiveDate: z.string(),
  clientName: z.string().optional(),
  intendedUse: z.string(),
  intendedUser: z.string(),
  marketRentPerSF: z.number().optional(),
  vacancyRate: z.number().optional(),
  operatingExpenses: z.number().optional(),
  capRate: z.number().optional(),
  discountRate: z.number().optional(),
  landValue: z.number().optional(),
  costNew: z.number().optional(),
  totalDepreciation: z.number().optional(),
  reconciliationRationale: z.string().optional(),
  finalValueOpinion: z.number().optional(),
  extraordinaryAssumptions: z.string().optional(),
  hypotheticalConditions: z.string().optional(),
  definitionOfMarketValueSource: z.string().optional(),

  // Appraiser Details from form
  appraiserName: z.string().optional(),
  appraiserTitle: z.string().optional(),
  appraiserLicense: z.string().optional(),
  appraiserCompany: z.string().optional(),

  // SCA Adjustment Guidelines from form
  scaMarketConditionsAdjustment: z.string().optional(),
  scaLocationAdjustment: z.string().optional(),
  scaPhysicalCharacteristicsAdjustment: z.string().optional(),
  scaPropertyRightsAdjustment: z.string().optional(),
  scaFinancingTermsAdjustment: z.string().optional(),
  scaConditionsOfSaleAdjustment: z.string().optional(),
});

export type ValuGenFormInput = z.infer<typeof ValuGenFormInputSchema>; 