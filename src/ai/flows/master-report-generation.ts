import { defineFlow, runFlow, runTool } from 'ai-genkit';
import { z } from 'zod';
import { AppraisalCaseFile, AppraisalCaseFileSchema, ValuGenFormInputSchema, PropertyDetailsSchema } from '@/lib/appraisal-case-file';
import { process } from 'node:process';

// Import new GIS tool
import { localGisDataTool, LocalGisDataToolInputSchema, LocalGisDataToolOutputSchema } from '../tools/local-gis-data-tool';

// Import existing Genkit flows and their InputSchemas
import { dataExtractionTool, DataExtractionInputSchema, DataExtractionOutputSchema } from './data-extraction-tool';
import { siteDescriptionFlow, SiteDescriptionInputSchema } from './site-description-generation';
import { marketAnalysisFlow, MarketAnalysisInputSchema } from './market-analysis-generation';
import { hbuFlow, HbuInputSchema } from './hbu-generation';
import { executiveSummaryFlow, ExecutiveSummaryInputSchema } from './executive-summary-generation';
import { coverLetterFlow, CoverLetterInputSchema } from './cover-letter-generation';
import { certificationFlow, CertificationInputSchema } from './certification-generation';
import { comparableSalesFlow } from './comparable-sales-flow'; // comparableSalesFlow now takes AppraisalCaseFile
import { salesComparisonApproachFlow, SalesComparisonApproachInputSchema } from './sales-comparison-approach-flow';
import { incomeApproachFlow, IncomeApproachInputSchema } from './income-approach-flow';
import { costApproachFlow, CostApproachInputSchema } from './cost-approach-flow';
import { reconciliationFlow, ReconciliationInputSchema, ReconciliationOutput } from './reconciliation-flow';
import { complianceCheckFlow, ComplianceCheckInputSchema } from './compliance-check-flow';

// Define input schema for the master flow
const MasterFlowInputSchema = z.object({
  formInput: ValuGenFormInputSchema,
  initialCaseFile: AppraisalCaseFileSchema.optional(),
});

export type MasterFlowInput = z.infer<typeof MasterFlowInputSchema>;

// --- CONFIGURATION ---
const DEFAULT_GDB_PATH = '/Users/harrisonlane/Downloads/MassGIS_L3_Parcels_gdb/MassGIS_L3_Parcels.gdb'; 
const GDB_PATH = process.env.GDB_PATH_OVERRIDE || DEFAULT_GDB_PATH;

const MIN_GDB_CONFIDENCE_THRESHOLD = 0.8; // Minimum confidence to consider GDB data primary

// Main orchestrator flow for full report generation
export const masterReportGenerationFlow = defineFlow(
  {
    name: 'masterReportGenerationFlow',
    inputSchema: MasterFlowInputSchema,
    outputSchema: AppraisalCaseFileSchema,
  },
  async ({ formInput, initialCaseFile }: MasterFlowInput, flowContext: any) => {
    let caseFile: AppraisalCaseFile = initialCaseFile || {
      reportId: `VAL-${Date.now()}`,
      creationDate: new Date().toISOString(),
      propertyAddress: formInput.propertyAddress,
      city: formInput.city,
      county: formInput.county,
      state: formInput.state,
      zipCode: formInput.zipCode,
      propertyType: formInput.propertyType,
      effectiveDate: formInput.effectiveDate,
      reportDate: new Date().toISOString(),
      clientName: formInput.clientName || 'Not Provided',
      intendedUse: formInput.intendedUse,
      intendedUser: formInput.intendedUser,
      clientDetails: {
        name: formInput.clientName || formInput.intendedUser || 'Not Provided',
      },
      appraiserDetails: {
        name: formInput.appraiserName || 'ValuGen Appraisal Services',
        license: formInput.appraiserLicense,
        company: formInput.appraiserCompany || 'Lane Valuation Group',
        title: formInput.appraiserTitle || 'Certified General Appraiser',
      },
      narratives: {},
      statusFlags: {},
      confidenceScoresOverall: {},
      propertyDetails: {
        general: {
          propertyType: formInput.propertyType,
          yearBuilt: formInput.yearBuilt,
          sizeSqFt: formInput.buildingSizeSqFt
        }
      },
      marketData: { comparableSales: [] },
      valuationResults: {},
      metaData: {
        webExtractionDetails: [],
        gdbQueryStatus: 'ATTEMPTED' // Initialize status
      },
      extraordinaryAssumptions: formInput.extraordinaryAssumptions,
      hypotheticalConditions: formInput.hypotheticalConditions,
      definitionOfMarketValueSource: formInput.definitionOfMarketValueSource,
    };

    // Populate userReconciliationInputs from formInput
    if (formInput.reconciliationRationale || formInput.finalValueOpinion) {
      caseFile.userReconciliationInputs = {
        rationale: formInput.reconciliationRationale,
        finalValueOpinion: formInput.finalValueOpinion,
      };
    }

    if (!caseFile.propertyDetails) {
      caseFile.propertyDetails = PropertyDetailsSchema.parse({});
    }
    if (!caseFile.metaData) {
      // Ensure metaData and its nested structures are initialized correctly
      caseFile.metaData = {
        webExtractionDetails: [],
        gdbQueryStatus: 'ATTEMPTED'
      };
    }

    let currentSubFlowContext = { ...flowContext, caseFile };

    try {
      // 1. Data Extraction - Phase 1: Local GDB Query
      let gdbSucceeded = false;
      if (caseFile.state.toUpperCase() === 'MA') { // Only attempt GDB query for MA properties
        try {
          const gdbInput: z.infer<typeof LocalGisDataToolInputSchema> = {
            gdbPath: GDB_PATH,
            siteAddress: caseFile.propertyAddress,
            city: caseFile.city,
            state: caseFile.state,
            zipCode: caseFile.zipCode,
          };
          const gdbResult = await runTool(localGisDataTool, gdbInput) as z.infer<typeof LocalGisDataToolOutputSchema>;

          caseFile.metaData!.gdbSourceLocId = gdbResult.sourceLocId;
          caseFile.metaData!.gdbMatchConfidence = gdbResult.matchConfidence;

          if (gdbResult.error) {
            console.warn(`GDB Extraction Error: ${gdbResult.error}`);
            caseFile.metaData!.gdbQueryStatus = 'ERROR';
            caseFile.metaData!.gdbErrorMessage = gdbResult.error;
          } else if (gdbResult.data && gdbResult.matchConfidence && gdbResult.matchConfidence >= MIN_GDB_CONFIDENCE_THRESHOLD) {
            console.log(`GDB Extraction Successful (Confidence: ${gdbResult.matchConfidence})`);
            caseFile.metaData!.gdbQueryStatus = 'SUCCESS';
            caseFile.metaData!.propertyDataSourcePrimary = 'GDB';
            // Merge GDB data into caseFile.propertyDetails
            caseFile.propertyDetails = {
              ...caseFile.propertyDetails,
              ownerName: gdbResult.data.ownerName || caseFile.propertyDetails.ownerName,
              parcelId: gdbResult.data.propertyId || gdbResult.data.camaId || caseFile.propertyDetails.parcelId, 
              locationId: gdbResult.data.locationId,
              camaId: gdbResult.data.camaId,
              townId: gdbResult.data.townId,
              fiscalYear: gdbResult.data.fiscalYear,
              lotSizeAcres: gdbResult.data.lotSizeAcres,
              lotSizeSqFt: gdbResult.data.lotSizeSqFt,
              lotUnits: gdbResult.data.lotUnits,
              // assessedValueTotal: gdbResult.data.totalValue, // Keep existing name for assessedTotalValue 
              assessedBuildingValue: gdbResult.data.buildingValue,
              assessedLandValue: gdbResult.data.landValue,
              assessedTotalValue: gdbResult.data.totalValue, // GDB total value
              lastSaleDate: gdbResult.data.landSaleDate, // GDB uses landSaleDate
              lastSalePrice: gdbResult.data.landSalePrice, // GDB uses landSalePrice
              zoningCode: gdbResult.data.zoning, // GDB uses zoning
              useCode: gdbResult.data.useCode,
              useDescription: gdbResult.data.useDescription,
              yearBuilt: gdbResult.data.yearBuilt || caseFile.propertyDetails.general?.yearBuilt,
              buildingSizeSqFt: gdbResult.data.buildingArea || caseFile.propertyDetails.general?.sizeSqFt, // GDB buildingArea maps to buildingSizeSqFt
              shapeArea: gdbResult.data.shapeArea,
              shapeLength: gdbResult.data.shapeLength,
              polyType: gdbResult.data.polyType,
              improvementsSummary: {
                ...(caseFile.propertyDetails.improvementsSummary || {}),
                style: gdbResult.data.style,
                stories: gdbResult.data.stories,
                units: gdbResult.data.units,
                residentialArea: gdbResult.data.residentialArea,
                numberOfRooms: gdbResult.data.numberOfRooms,
                // Ensure yearBuilt and sizeSqFt are also potentially updated here if GDB has them under specific improvement fields
                yearBuilt: gdbResult.data.yearBuilt || caseFile.propertyDetails.improvementsSummary?.yearBuilt || caseFile.propertyDetails.general?.yearBuilt,
                sizeSqFt: gdbResult.data.buildingArea || caseFile.propertyDetails.improvementsSummary?.sizeSqFt || caseFile.propertyDetails.general?.sizeSqFt,
              },
              // Ensure general section is also updated with GDB values if more specific
              general: {
                ...(caseFile.propertyDetails.general || {}),
                propertyType: gdbResult.data.useDescription || caseFile.propertyDetails.general?.propertyType, // GDB useDescription can refine propertyType
                yearBuilt: gdbResult.data.yearBuilt || caseFile.propertyDetails.general?.yearBuilt,
                sizeSqFt: gdbResult.data.buildingArea || caseFile.propertyDetails.general?.sizeSqFt,
              }
            };
            gdbSucceeded = true;
          } else {
            console.log(`GDB data found but confidence low (${gdbResult.matchConfidence}) or data missing.`);
            caseFile.metaData!.gdbQueryStatus = 'NOT_FOUND'; // Or 'LOW_CONFIDENCE'
          }
        } catch (err: any) {
          console.error('Error running localGisDataTool:', err);
          caseFile.metaData!.gdbQueryStatus = 'ERROR';
          caseFile.metaData!.gdbErrorMessage = err.message || 'Unknown error during GDB tool execution';
        }
      } else {
        console.log('Skipping GDB query as property is not in MA.');
        caseFile.metaData!.gdbQueryStatus = 'SKIPPED'; // New status if needed in schema
      }

      // 1. Data Extraction - Phase 2: Web-based Extraction (if needed)
      if (!gdbSucceeded || (caseFile.metaData?.gdbQueryStatus !== 'SUCCESS')) { // If GDB failed or low confidence, run web extraction.
        console.log('Proceeding with web-based data extraction.');
        const extractionInput: z.infer<typeof DataExtractionInputSchema> = {
          address: caseFile.propertyAddress,
          city: caseFile.city,
          county: caseFile.county,
          state: caseFile.state,
          // Potentially add context if GDB returned partial data, to guide verification
          existingDataSummary: gdbSucceeded && caseFile.metaData?.gdbQueryStatus === 'SUCCESS' ? "GDB data found, verify and supplement." : undefined,
        };
        const webExtractionResult = await runTool(dataExtractionTool, extractionInput) as z.infer<typeof DataExtractionOutputSchema>;
        
        // Merge webExtractionResult into caseFile.propertyDetails
        // Prioritize GDB data if it was successful, otherwise fill with web data
        // Or, if GDB was successful, web data acts as verification/supplement
        if (webExtractionResult) {
          caseFile.metaData!.webExtractionDetails = webExtractionResult.dataSources;
          caseFile.metaData!.webExtractionOverallConfidence = webExtractionResult.overallConfidence;
          if (!caseFile.metaData!.propertyDataSourcePrimary) {
            caseFile.metaData!.propertyDataSourcePrimary = 'WEB';
          } else if (caseFile.metaData!.propertyDataSourcePrimary === 'GDB') {
            caseFile.metaData!.propertyDataSourceSecondary = 'WEB';
          }

          caseFile.propertyDetails = {
            ...caseFile.propertyDetails,
            ownerName: caseFile.propertyDetails.ownerName || webExtractionResult.ownerName,
            parcelId: caseFile.propertyDetails.parcelId || webExtractionResult.parcelId,
            legalDescriptionSource: caseFile.propertyDetails.legalDescriptionSource || webExtractionResult.legalDescriptionRef, 
            lotSizeAcres: caseFile.propertyDetails.lotSizeAcres ?? webExtractionResult.lotSizeAcres, // Use ?? to take web if GDB was null/undefined
            lotSizeSqFt: caseFile.propertyDetails.lotSizeSqFt ?? webExtractionResult.lotSizeSqFt,
            zoningCode: caseFile.propertyDetails.zoningCode || webExtractionResult.zoningCodePrimary, 
            zoningDescription: caseFile.propertyDetails.zoningDescription || webExtractionResult.zoningDescription,
            siteDimensions: caseFile.propertyDetails.siteDimensions || webExtractionResult.siteDimensions,
            propertyClassCode: caseFile.propertyDetails.propertyClassCode || webExtractionResult.propertyClassCode,
            yearBuilt: caseFile.propertyDetails.yearBuilt || webExtractionResult.yearBuilt || caseFile.propertyDetails.general?.yearBuilt,
            buildingSizeSqFt: caseFile.propertyDetails.buildingSizeSqFt || webExtractionResult.buildingSizeSqFt || caseFile.propertyDetails.general?.sizeSqFt, 
            assessedTotalValue: caseFile.propertyDetails.assessedTotalValue ?? webExtractionResult.assessedValueTotal, // Prioritize GDB assessed values if present
            lastSaleDate: caseFile.propertyDetails.lastSaleDate || webExtractionResult.lastSaleDate,
            lastSalePrice: caseFile.propertyDetails.lastSalePrice ?? webExtractionResult.lastSalePrice,
            femaFloodZoneId: caseFile.propertyDetails.femaFloodZoneId || webExtractionResult.floodZoneData?.zone,
            femaPanelNumber: caseFile.propertyDetails.femaPanelNumber || webExtractionResult.floodZoneData?.panel,
            femaMapEffectiveDate: caseFile.propertyDetails.femaMapEffectiveDate || webExtractionResult.floodZoneData?.date,
            femaFloodSource: caseFile.propertyDetails.femaFloodSource || webExtractionResult.floodZoneData?.source,
            // Ensure general section is also updated if GDB didn\'t populate fully
            general: {
                ...(caseFile.propertyDetails.general || {}),
                propertyType: caseFile.propertyDetails.general?.propertyType || caseFile.propertyType, // Fallback to initial form if nothing else
                yearBuilt: caseFile.propertyDetails.general?.yearBuilt || webExtractionResult.yearBuilt || caseFile.propertyDetails.yearBuilt,
                sizeSqFt: caseFile.propertyDetails.general?.sizeSqFt || webExtractionResult.buildingSizeSqFt || caseFile.propertyDetails.buildingSizeSqFt,
            },
            // Update improvements summary similarly, prioritizing GDB if present, then web
            improvementsSummary: {
                ...(caseFile.propertyDetails.improvementsSummary || {}),
                yearBuilt: caseFile.propertyDetails.improvementsSummary?.yearBuilt || webExtractionResult.yearBuilt || caseFile.propertyDetails.yearBuilt,
                sizeSqFt: caseFile.propertyDetails.improvementsSummary?.sizeSqFt || webExtractionResult.buildingSizeSqFt || caseFile.propertyDetails.buildingSizeSqFt,
            }
          };
        } else if (!caseFile.metaData!.propertyDataSourcePrimary) {
          caseFile.metaData!.propertyDataSourcePrimary = 'NONE'; // If both GDB and Web fail somehow
        }
      }
      
      currentSubFlowContext = { ...flowContext, caseFile };

      // 2. Site Description
      const siteInput: z.infer<typeof SiteDescriptionInputSchema> = {
        address: caseFile.propertyAddress,
        city: caseFile.city,
        county: caseFile.county,
        propertyTypeGeneral: caseFile.propertyType,
      };
      const siteResult = await runFlow(siteDescriptionFlow, siteInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...siteResult };
      currentSubFlowContext = { ...flowContext, caseFile }; 

      // 3. Market Analysis
      const marketInput: z.infer<typeof MarketAnalysisInputSchema> = {
        city: caseFile.city,
        county: caseFile.county,
        propertyAddress: caseFile.propertyAddress,
        propertyType: caseFile.propertyType,
      };
      const marketResult = await runFlow(marketAnalysisFlow, marketInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...marketResult };
      currentSubFlowContext = { ...flowContext, caseFile }; 

      // 4. HBU Analysis
      const hbuInput: z.infer<typeof HbuInputSchema> = {
        siteDescriptionSummary: caseFile.narratives?.siteDescription || '', 
        marketOverviewSummary: caseFile.narratives?.marketAnalysis || '', 
        propertyAddress: caseFile.propertyAddress,
        city: caseFile.city,
        county: caseFile.county,
        propertyTypeGeneral: caseFile.propertyType,
      };
      const hbuResult = await runFlow(hbuFlow, hbuInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...hbuResult };
      currentSubFlowContext = { ...flowContext, caseFile }; 

      // 5. Comparable Sales Analysis (Refactored to take full CaseFile)
      try {
        console.log("Attempting Comparable Sales Flow...");
        const comparableSalesResult = await runFlow(comparableSalesFlow, caseFile, currentSubFlowContext);
        if (comparableSalesResult) {
          caseFile.marketData = {
            ...(caseFile.marketData || {}),
            comparableSales: comparableSalesResult.comparableSales,
            comparableSalesSearchSummary: comparableSalesResult.searchSummary,
          };
          caseFile.statusFlags!.comparableSalesFlow = 'SUCCESS';
          console.log(`Comparable Sales Flow successful. Found ${comparableSalesResult.comparableSales?.length || 0} comps.`);
        } else {
          console.warn("Comparable Sales Flow did not return a result.");
          caseFile.statusFlags!.comparableSalesFlow = 'ERROR';
          caseFile.marketData = {
            ...(caseFile.marketData || {}),
            comparableSalesSearchSummary: "Comparable Sales Flow did not return a result.",
          };
        }
      } catch (error: any) {
        console.error("Error in Comparable Sales Flow:", error);
        caseFile.statusFlags!.comparableSalesFlow = 'ERROR';
        caseFile.narratives!.comparableSalesError = `Error in Comparable Sales Flow: ${error.message || 'Unknown error'}`;
        caseFile.marketData = {
          ...(caseFile.marketData || {}),
          comparableSalesSearchSummary: `Error in Comparable Sales Flow: ${error.message || 'Unknown error'}`,
        };
      }
      currentSubFlowContext.caseFile = caseFile; // Update context

      // 6. Valuation - Sales Comparison Approach
      if (caseFile.marketData?.comparableSales && caseFile.marketData.comparableSales.length > 0) {
        try {
          console.log("Attempting Sales Comparison Approach Flow...");
          
          const scaInput: z.infer<typeof SalesComparisonApproachInputSchema> = {
            appraisalCaseFile: caseFile,
            adjustmentGuidelines: {
              marketConditions: formInput.scaMarketConditionsAdjustment,
              location: formInput.scaLocationAdjustment,
              physicalCharacteristics: formInput.scaPhysicalCharacteristicsAdjustment,
              propertyRights: formInput.scaPropertyRightsAdjustment,
              financingTerms: formInput.scaFinancingTermsAdjustment,
              conditionsOfSale: formInput.scaConditionsOfSaleAdjustment,
            }
          };

          const scaResult = await runFlow(salesComparisonApproachFlow, scaInput, currentSubFlowContext);

          if (scaResult) {
            caseFile.valuationResults = {
              ...(caseFile.valuationResults || {}),
              salesComparisonApproach: {
                indicatedValue: scaResult.indicatedValueBySCA,
                adjustmentGrid: scaResult.adjustmentGrid,
                confidenceScore: scaResult.confidenceScore,
              },
            };
            caseFile.narratives!.salesComparisonApproach = scaResult.narrative;
            caseFile.statusFlags!.salesComparisonApproachFlow = 'SUCCESS';
            
            // Merge valuationResultsUpdate into the main valuationResults
            if (scaResult.valuationResultsUpdate) {
              caseFile.valuationResults = {
                ...caseFile.valuationResults,
                ...scaResult.valuationResultsUpdate,
              };
            }
            console.log("Sales Comparison Approach Flow successful. Indicated Value: ", scaResult.indicatedValueBySCA);
          } else {
            console.warn("Sales Comparison Approach Flow did not return a result.");
            caseFile.statusFlags!.salesComparisonApproachFlow = 'ERROR';
          }
        } catch (error: any) {
          console.error("Error in Sales Comparison Approach Flow:", error);
          caseFile.statusFlags!.salesComparisonApproachFlow = 'ERROR';
          caseFile.narratives!.salesComparisonApproachError = `Error in Sales Comparison Approach Flow: ${error.message || 'Unknown error'}`;
        }
      } else {
        console.warn("Skipping Sales Comparison Approach Flow: No comparable sales found.");
        caseFile.statusFlags!.salesComparisonApproachFlow = 'SKIPPED_NO_COMPS';
        caseFile.narratives!.salesComparisonApproach = "Sales Comparison Approach was skipped because no comparable sales were available in the Appraisal Case File.";
      }
      currentSubFlowContext.caseFile = caseFile; // Update context

      // 7. Valuation - Income Approach
      try {
        console.log("Attempting Income Approach Flow...");
        // The IncomeApproachInputSchema expects appraisalCaseFile and optional user inputs.
        // For now, we pass the caseFile and an empty object for user inputs.
        // These user inputs could be collected from ValuGenFormInput in the future.
        const incomeApproachInput: z.infer<typeof IncomeApproachInputSchema> = {
          appraisalCaseFile: caseFile,
          incomeApproachUserInputs: { 
            marketRentPerSFPerYear: formInput.marketRentPerSF,
            vacancyCollectionLossPercent: formInput.vacancyRate,
            operatingExpenseRatio: formInput.operatingExpenses, // Assuming formInput.operatingExpenses is a ratio. If it's a total amount, logic in flow/prompt needs to adapt.
            capitalizationRate: formInput.capRate,
          }
        };
        const incomeResult = await runFlow(incomeApproachFlow, incomeApproachInput, currentSubFlowContext);

        if (incomeResult) {
          caseFile.valuationResults = {
            ...(caseFile.valuationResults || {}),
            incomeApproach: {
              indicatedValue: incomeResult.indicatedValueByIA,
              PGI: incomeResult.potentialGrossIncome,
              EGI: incomeResult.effectiveGrossIncome,
              NOI: incomeResult.netOperatingIncome,
              capRateUsed: incomeResult.capitalizationRateUsed,
              confidenceScore: incomeResult.confidenceScore,
            },
          };
          caseFile.narratives!.incomeApproach = incomeResult.narrative;
          caseFile.statusFlags!.incomeApproachFlow = 'SUCCESS';

          // Merge valuationResultsUpdate into the main valuationResults
          if (incomeResult.valuationResultsUpdate) {
            caseFile.valuationResults = {
              ...caseFile.valuationResults,
              ...incomeResult.valuationResultsUpdate,
            };
          }
          console.log("Income Approach Flow successful. Indicated Value: ", incomeResult.indicatedValueByIA);
        } else {
          console.warn("Income Approach Flow did not return a result.");
          caseFile.statusFlags!.incomeApproachFlow = 'ERROR';
        }
      } catch (error: any) {
        console.error("Error in Income Approach Flow:", error);
        caseFile.statusFlags!.incomeApproachFlow = 'ERROR';
        caseFile.narratives!.incomeApproachError = `Error in Income Approach Flow: ${error.message || 'Unknown error'}`;
      }
      currentSubFlowContext.caseFile = caseFile; // Update context

      // 8. Valuation - Cost Approach
      try {
        console.log("Attempting Cost Approach Flow...");
        const costApproachInput: z.infer<typeof CostApproachInputSchema> = {
          appraisalCaseFile: caseFile,
          costApproachUserInputs: { 
            landValue: formInput.landValue,
            reproductionCostNewPerSF: formInput.costNew, // Assuming formInput.costNew is per SF. If total, logic in flow/prompt needs to adapt.
            totalAccruedDepreciationPercent: formInput.totalDepreciation // Assuming formInput.totalDepreciation is a percent.
          }
        };
        const costResult = await runFlow(costApproachFlow, costApproachInput, currentSubFlowContext);

        if (costResult) {
          caseFile.valuationResults = {
            ...(caseFile.valuationResults || {}),
            costApproach: {
              indicatedValue: costResult.indicatedValueByCA,
              estimatedLandValue: costResult.estimatedLandValue,
              reproductionReplacementCostNew: costResult.reproductionReplacementCostNew,
              totalAccruedDepreciation: costResult.totalAccruedDepreciation,
              depreciatedCostOfImprovements: costResult.depreciatedCostOfImprovements,
              confidenceScore: costResult.confidenceScore,
            },
          };
          caseFile.narratives!.costApproach = costResult.narrative;
          caseFile.statusFlags!.costApproachFlow = 'SUCCESS';

          if (costResult.valuationResultsUpdate) {
            caseFile.valuationResults = {
              ...caseFile.valuationResults,
              ...costResult.valuationResultsUpdate,
            };
          }
          console.log("Cost Approach Flow successful. Indicated Value: ", costResult.indicatedValueByCA);
        } else {
          console.warn("Cost Approach Flow did not return a result.");
          caseFile.statusFlags!.costApproachFlow = 'ERROR';
        }
      } catch (error: any) {
        console.error("Error in Cost Approach Flow:", error);
        caseFile.statusFlags!.costApproachFlow = 'ERROR';
        caseFile.narratives!.costApproachError = `Error in Cost Approach Flow: ${error.message || 'Unknown error'}`;
      }
      currentSubFlowContext.caseFile = caseFile; // Update context

      // 9. Reconciliation
      const reconciliationInput: z.infer<typeof ReconciliationInputSchema> = {
        appraisalCaseFile: caseFile, // Pass the entire, updated caseFile
      };
      const reconciliationResult = await runFlow(reconciliationFlow, reconciliationInput, { context: currentSubFlowContext }) as ReconciliationOutput;
      
      if (reconciliationResult) {
        caseFile.finalReconciledValue = reconciliationResult.reconciledValue;
        if (!caseFile.narratives) caseFile.narratives = {};
        caseFile.narratives.reconciliation = reconciliationResult.narrative;
        if (!caseFile.confidenceScoresOverall) caseFile.confidenceScoresOverall = {};
        caseFile.confidenceScoresOverall.reconciliation = reconciliationResult.confidenceScore;
        caseFile.statusFlags!.reconciliationFlow = 'SUCCESS';
        // Optionally, log or store reconciliationResult.sources if needed
        console.log("Reconciliation Flow successful. Final Reconciled Value: ", reconciliationResult.reconciledValue);
      } else {
        console.warn("Reconciliation Flow did not return a result.");
        caseFile.statusFlags!.reconciliationFlow = 'ERROR';
      }
      currentSubFlowContext = { ...flowContext, caseFile };

      // 10. Executive Summary
      const summaryInput: z.infer<typeof ExecutiveSummaryInputSchema> = {
        // assembleExecutiveSummaryPrompt will pull from the caseFile in context
        appraisalCaseFile: caseFile, // Provide the full caseFile
      };
      const summaryResult = await runFlow(executiveSummaryFlow, summaryInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...summaryResult };
      currentSubFlowContext = { ...flowContext, caseFile };

      // 11. Cover Letter
      const coverInput: z.infer<typeof CoverLetterInputSchema> = {
         appraisalCaseFile: caseFile, // Provide the full caseFile
      };
      const coverResult = await runFlow(coverLetterFlow, coverInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...coverResult };
      currentSubFlowContext = { ...flowContext, caseFile };

      // 12. Certification
      const certInput: z.infer<typeof CertificationInputSchema> = {
         appraisalCaseFile: caseFile, // Provide the full caseFile
      };
      const certResult = await runFlow(certificationFlow, certInput, { context: currentSubFlowContext });
      caseFile = { ...caseFile, ...certResult };
      currentSubFlowContext = { ...flowContext, caseFile };

      // 13. Compliance Check
      try {
        console.log("Attempting Compliance Check Flow...");
        const complianceInput: z.infer<typeof ComplianceCheckInputSchema> = { appraisalCaseFile: caseFile };
        const complianceResult = await runFlow(complianceCheckFlow, complianceInput, { context: currentSubFlowContext });
        
        if (complianceResult) {
          caseFile.complianceCheckOutput = complianceResult; // Store the structured output
          // Optionally, store a narrative summary if the output schema had one, e.g.:
          // if (!caseFile.narratives) caseFile.narratives = {};
          // caseFile.narratives.complianceReport = complianceResult.overallAssessment || "Compliance check completed."; 
          caseFile.statusFlags!.complianceCheckFlow = 'SUCCESS';
          console.log("Compliance Check Flow successful.");
        } else {
          console.warn("Compliance Check Flow did not return a result.");
          caseFile.statusFlags!.complianceCheckFlow = 'ERROR';
        }
      } catch (error: any) {
        console.error("Error in Compliance Check Flow:", error);
        caseFile.statusFlags!.complianceCheckFlow = 'ERROR';
        // Optionally, store error in narratives or a specific error field for compliance check
        // if (!caseFile.narratives) caseFile.narratives = {};
        // caseFile.narratives.complianceReport = `Error in Compliance Check Flow: ${error.message || 'Unknown error'}`;
      }
      currentSubFlowContext.caseFile = caseFile; // Update context

      console.log('Master report generation flow completed.');
      return caseFile;

    } catch (error: any) {
      console.error('Error in masterReportGenerationFlow:', error);
      // Log the error to the caseFile
      caseFile.error = {
        message: error.message,
        stack: error.stack,
        flowError: true,
      };
      // Depending on the error, you might want to throw it, or return the caseFile with error info
      // For now, returning the caseFile with error details so client can see partial progress/error.
      return caseFile;
    }
  }
); 