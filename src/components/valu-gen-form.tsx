"use client";

import { useState, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { generateFullReportAction, type ValuGenFormInput, regenerateSalesComparisonSection, regenerateIncomeApproachSection, regenerateCostApproachSection, regenerateReconciliationSection, regenerateExecutiveSummarySection, regenerateCoverLetterSection, regenerateComplianceCheckSection, saveSalesComparisonGrid, saveIncomeProForma, saveCostApproachData } from '@/app/actions';
import { type AppraisalCaseFile } from '@/lib/appraisal-case-file';
import { 
  Loader2, FileText, ClipboardList, MapPin, BarChartBig, AlertCircle, ScrollText, ShieldCheck,
  Landmark, BookOpen, CalendarDays, Users, Telescope, Clock, Award, BadgeCheck, Building,
  AreaChart, Home, Briefcase, FileSearch, DollarSign, TrendingUp, Scale, ChevronDown, ChevronUp
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const formSchema = z.object({
  propertyAddress: z.string().min(5, "Property address must be at least 5 characters."),
  intendedUse: z.string().min(5, "Intended use must be at least 5 characters."),
  intendedUser: z.string().min(3, "Intended user must be at least 3 characters."),
  city: z.string().min(2, "City is required for market analysis."),
  county: z.string().min(2, "County is required for market analysis."),
  marketRentPerSF: z.coerce.number().min(0, 'Market rent must be non-negative.'),
  vacancyRate: z.coerce.number().min(0).max(1, 'Vacancy rate must be between 0 and 1.'),
  operatingExpenses: z.coerce.number().min(0, 'Operating expenses must be non-negative.'),
  capRate: z.coerce.number().min(0).max(1, 'Cap rate must be between 0 and 1.'),
  discountRate: z.coerce.number().min(0).max(1, 'Discount rate must be between 0 and 1.').optional(),
  landValue: z.coerce.number().min(0, 'Land value must be non-negative.'),
  costNew: z.coerce.number().min(0, 'Cost new must be non-negative.'),
  totalDepreciation: z.coerce.number().min(0, 'Total depreciation must be non-negative.'),
  userRationale: z.string().min(5, 'Please provide a rationale for reconciliation.'),
  finalUserValue: z.coerce.number().min(0, 'Final value must be non-negative.'),
});

interface ReportSectionDisplayProps {
  title: string;
  content?: string;
  icon: React.ReactNode;
  lowConfidence?: boolean;
  editable?: boolean;
  onApprove?: (newContent: string) => void;
}

async function approveSection(sectionKey: string) {
  // This is a placeholder for a real API call or server action
  // In a real app, you would POST to an endpoint or call a server action
  // For now, just simulate a delay
  return new Promise((resolve) => setTimeout(resolve, 300));
}

const ReportSectionDisplay: React.FC<ReportSectionDisplayProps> = ({ title, content, icon, lowConfidence, editable, onApprove }) => {
  const [editValue, setEditValue] = useState(content || '');
  const [isEditing, setIsEditing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleApprove = async () => {
    setIsSaving(true);
    await approveSection(title); // Use section title as key for now; in real app, use section.key
    setIsSaving(false);
    setApproved(true);
    onApprove && onApprove(editValue);
  };

  if (approved) {
    // Once approved, show as normal (no warning)
    return (
      <Card className="shadow-lg border-2 border-green-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center text-xl text-primary">
            {icon}
            <span className="ml-2">{title}</span>
            <span className="ml-2 text-green-600" title="Approved">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-secondary/30">
            <p className="text-sm text-foreground whitespace-pre-wrap">{editValue}</p>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`shadow-lg ${lowConfidence ? 'border-2 border-yellow-500' : ''}`}>
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center text-xl text-primary">
        {icon}
        <span className="ml-2">{title}</span>
          {lowConfidence && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-2 text-yellow-600" title="Low Confidence">
                    <AlertCircle className="h-5 w-5 animate-pulse" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span>This section was flagged as low confidence and requires appraiser review.</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
      </CardTitle>
    </CardHeader>
    <CardContent>
        {editable && lowConfidence ? (
          <div className="space-y-2">
            <textarea
              className="w-full min-h-[120px] border rounded-md p-2 text-sm"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setIsEditing(false)} variant="secondary">Cancel</Button>
              <Button size="sm" onClick={handleApprove} disabled={isSaving}>{isSaving ? 'Saving...' : 'Approve'}</Button>
            </div>
          </div>
        ) : content ? (
        <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-secondary/30">
          <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
            {lowConfidence && (
              <Button size="sm" className="mt-2" onClick={() => setIsEditing(true)}>Edit & Approve</Button>
            )}
        </ScrollArea>
      ) : (
        <p className="text-sm text-muted-foreground italic">No content generated or available for this section yet.</p>
      )}
    </CardContent>
  </Card>
);
};

// Define the full report structure, ensuring keys match AppraisalCaseFile['narratives'] or are handled if elsewhere
const reportStructure: Array<{ title: string; key: string; icon: React.ReactNode }> = [
  { title: "EXECUTIVE SUMMARY", key: "executiveSummary", icon: <ClipboardList className="h-5 w-5" /> },
  // Assuming these are placeholders or will be mapped to specific narrative fields if they exist
  { title: "REPORTING OPTION", key: "reportingOption", icon: <FileSearch className="h-5 w-5" /> }, 
  { title: "CERTIFICATION", key: "certification", icon: <ShieldCheck className="h-5 w-5" /> },
  { title: "CONTINGENT & LIMITING CONDITIONS", key: "certification", icon: <ScrollText className="h-5 w-5" /> }, // Uses certification content
  { title: "DEFINITION OF MARKET VALUE", key: "definitionOfMarketValue", icon: <BookOpen className="h-5 w-5" /> },
  { title: "FEE SIMPLE ESTATE", key: "feeSimpleEstate", icon: <Landmark className="h-5 w-5" /> },
  { title: "PURPOSE OF THE APPRAISAL", key: "purposeOfTheAppraisal", icon: <Telescope className="h-5 w-5" /> },
  { title: "APPRAISAL DATE", key: "appraisalDate", icon: <CalendarDays className="h-5 w-5" /> }, // Placeholder
  { title: "INTENDED USE OF REPORT", key: "intendedUseOfReport", icon: <Users className="h-5 w-5" /> }, // User input
  { title: "INTENDED USER OF REPORT", key: "intendedUserOfReport", icon: <Users className="h-5 w-5" /> }, // User input
  { title: "SCOPE OF ASSIGNMENT", key: "scopeOfAssignment", icon: <Briefcase className="h-5 w-5" /> },
  { title: "EXPOSURE TIME", key: "exposureTime", icon: <Clock className="h-5 w-5" /> },
  { title: "MARKETING TIME", key: "marketingTime", icon: <Clock className="h-5 w-5" /> },
  { title: "COMPETENCY PROVISION", key: "competencyProvision", icon: <Award className="h-5 w-5" /> },
  { title: "LICENSE PROVISION", key: "licenseProvision", icon: <BadgeCheck className="h-5 w-5" /> },
  { title: "PROPERTY IDENTIFICATION", key: "propertyIdentification", icon: <MapPin className="h-5 w-5" /> }, 
  { title: "AREA AND NEIGHBORHOOD DESCRIPTION", key: "marketAnalysis", icon: <AreaChart className="h-5 w-5" /> }, // map to marketAnalysis
  { title: "NEIGHBORHOOD DESCRIPTION", key: "marketAnalysis", icon: <Home className="h-5 w-5" /> },  // map to marketAnalysis
  { title: "SITE DESCRIPTION", key: "siteDescription", icon: <MapPin className="h-5 w-5" /> },
  { title: "IMPROVEMENT DESCRIPTION", key: "improvementDescription", icon: <Building className="h-5 w-5" /> }, 
  { title: "OWNERSHIP, SALES HISTORY, & LEGAL DESCRIPTION OF PROPERTY", key: "ownershipSalesHistoryLegalDescription", icon: <FileText className="h-5 w-5" /> },
  { title: "ASSESSMENT", key: "assessment", icon: <Landmark className="h-5 w-5" /> },
  { title: "ZONING", key: "zoning", icon: <FileSearch className="h-5 w-5" /> }, 
  { title: "HIGHEST AND BEST USE", key: "hbuAnalysis", icon: <TrendingUp className="h-5 w-5" /> },
  { title: "VALUATION METHODOLOGY & ANALYSIS", key: "valuationMethodologyAnalysis", icon: <Scale className="h-5 w-5" /> },
  { title: "SALES COMPARISON APPROACH", key: "salesComparisonApproach", icon: <DollarSign className="h-5 w-5" /> },
  { title: "INCOME APPROACH VALUATION", key: "incomeApproach", icon: <DollarSign className="h-5 w-5" /> }, // Corrected key
  { title: "INCOME AND EXPENSE STATEMENT", key: "incomeAndExpenseStatement", icon: <FileText className="h-5 w-5" /> }, // Special handling
  { title: "RECONCILEMENT OF OPINION", key: "reconciliation", icon: <Scale className="h-5 w-5" /> }, // Corrected key
];

// Placeholder async function to simulate regeneration
async function regenerateSection(section: string) {
  return new Promise((resolve) => setTimeout(resolve, 1200));
}

// Helper to check if all required sections are approved and compliance passes
function canExportReport(generatedReport: AppraisalCaseFile | null) {
  if (!generatedReport) return false;
  const requiredSections: (keyof AppraisalCaseFile['statusFlags'])[] = [
    'salesComparisonApproach',
    'incomeApproach', // Corrected key
    'reconciliation', // Corrected key
    'executiveSummary',
    'coverLetter',
    'costApproach',
  ];
  const flags = generatedReport.statusFlags || {};
  const allApproved = requiredSections.every(
    (key) => flags[key] === 'approved'
  );
  const compliance = generatedReport.complianceCheckOutput; // Corrected field
  const compliancePass = compliance && (!compliance.potentialIssues || compliance.potentialIssues.length === 0);
  return allApproved && compliancePass;
}

export default function ValuGenForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<AppraisalCaseFile | null>(null);
  const [showValuationDetails, setShowValuationDetails] = useState(false);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);
  const [lastCaseFile, setLastCaseFile] = useState<AppraisalCaseFile | null>(null);
  const [editState, setEditState] = useState<{ [key: string]: boolean }>({});
  const [editValue, setEditValue] = useState<{ [key: string]: string }>({});
  const [editError, setEditError] = useState<{ [key: string]: string | null }>({});

  const form = useForm<ValuGenFormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      propertyAddress: "",
      intendedUse: "",
      intendedUser: "",
      city: "",
      county: "",
      marketRentPerSF: 20,
      vacancyRate: 0.05,
      operatingExpenses: 50000,
      capRate: 0.07,
      discountRate: undefined,
      landValue: 100000,
      costNew: 500000,
      totalDepreciation: 100000,
      userRationale: '',
      finalUserValue: 0,
    },
  });

  const onSubmit: SubmitHandler<ValuGenFormInput> = async (data) => {
    setIsLoading(true);
    setError(null);
    setGeneratedReport(null);
    setLastCaseFile(null); // Also reset lastCaseFile
    try {
      const result = await generateFullReportAction(data);
      if ('error' in result && result.error) {
        setError(result.error);
        setGeneratedReport(null); // Ensure report is null on error
      } else if (!('error' in result)) { // It's an AppraisalCaseFile
        setGeneratedReport(result);
        setLastCaseFile(result); 
      } else {
        // Should not happen if the action always returns AppraisalCaseFile or {error: string}
        setError("An unexpected response format was received.");
        setGeneratedReport(null);
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while submitting the form.");
      setGeneratedReport(null); // Ensure report is null on catch
    }
    setIsLoading(false);
  };

  // Helper to parse pro forma JSON if present
  const parsedProForma = useMemo(() => {
    if (!generatedReport?.valuationResults?.income?.proForma) return null;
    try {
      // Assuming proForma is an object. If it's already a string, this might not be necessary.
      return generatedReport.valuationResults.income.proForma;
    } catch {
      // Should not happen if proForma is accessed correctly
      return null;
    }
  }, [generatedReport?.valuationResults?.income?.proForma]);

  return (
    <div className="space-y-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Report Inputs</CardTitle>
          <CardDescription>Please provide the following details to generate the appraisal report.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="propertyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Main St, Anytown, USA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="intendedUse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intended Use</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Mortgage financing" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="intendedUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intended User</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., ABC Bank" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Anytown" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="county"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>County</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Sample County" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Valuation Parameters Section */}
              <div className="mt-8 p-4 border rounded-md bg-secondary/20">
                <h3 className="text-lg font-semibold mb-4">Valuation Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Income Approach */}
                  <FormField
                    control={form.control}
                    name="marketRentPerSF"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Market Rent per SF ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="e.g., 20" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vacancyRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vacancy Rate (0-1)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="e.g., 0.05" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="operatingExpenses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operating Expenses ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="e.g., 50000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="capRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capitalization Rate (0-1)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="e.g., 0.07" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="discountRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Rate (0-1, optional)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="e.g., 0.08" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Cost Approach */}
                  <FormField
                    control={form.control}
                    name="landValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Land Value ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="e.g., 100000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="costNew"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost New ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="e.g., 500000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalDepreciation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Depreciation ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="e.g., 100000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Reconciliation */}
                  <FormField
                    control={form.control}
                    name="userRationale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reconciliation Rationale</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="e.g., Weight given to SCA due to most reliable data." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="finalUserValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Reconciled Value ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="e.g., 600000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Full Report Structure'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {error && (
        <Card className="bg-destructive/10 border-destructive shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive text-lg">
              <AlertCircle className="mr-2 h-5 w-5" />
              Error Generating Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {generatedReport && !error && (
        <div className="space-y-6 mt-8">
          {/* STATUS DASHBOARD */}
          <Card className="shadow-lg border-2 border-primary/60">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <ClipboardList className="h-5 w-5 mr-2 text-primary" />
                Report Approval & Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row md:items-start md:gap-8">
                {/* Section Approval Checklist */}
                <div className="flex-1 mb-4 md:mb-0">
                  <div className="font-semibold mb-2">Major Sections</div>
                  <ul className="space-y-1">
                    {['salesComparisonApproach','incomeApproach','reconciliation','executiveSummary','coverLetter','costApproach'].map((key) => {
                      const status = generatedReport.statusFlags?.[key as keyof AppraisalCaseFile['statusFlags']];
                      let icon, color, label;
                      if (status === 'approved') {
                        icon = <ShieldCheck className="inline h-4 w-4 text-green-600 mr-1" />;
                        color = 'text-green-700';
                        label = 'Approved';
                      } else if (status === 'lowConfidence') {
                        icon = <AlertCircle className="inline h-4 w-4 text-yellow-600 animate-pulse mr-1" />;
                        color = 'text-yellow-700';
                        label = 'Low Confidence';
                      } else {
                        icon = <Clock className="inline h-4 w-4 text-gray-400 mr-1" />;
                        color = 'text-gray-600';
                        label = 'Pending';
                      }
                      // Human-readable section name
                      const sectionName = {
                        salesComparisonApproach: 'Sales Comparison',
                        incomeApproach: 'Income Approach', // Corrected key
                        reconciliation: 'Reconciliation', // Corrected key
                        executiveSummary: 'Executive Summary',
                        coverLetter: 'Cover Letter',
                        costApproach: 'Cost Approach',
                      }[key as string] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Fallback for other keys
                      return (
                        <li key={key as string} className={`flex items-center gap-2 ${color}`}>
                          {icon}
                          <span className="font-medium">{sectionName}</span>
                          <span className="ml-2 text-xs">{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {/* Compliance Status */}
                <div className="flex-1">
                  <div className="font-semibold mb-2">Compliance</div>
                  {generatedReport.complianceCheckOutput?.potentialIssues && generatedReport.complianceCheckOutput.potentialIssues.length > 0 ? (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 rounded mb-2">
                      <div className="flex items-center text-yellow-800 mb-1">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        <span className="font-medium">Compliance Issues Detected</span>
                      </div>
                      <ul className="list-disc ml-6 text-yellow-900 text-xs">
                        {generatedReport.complianceCheckOutput.potentialIssues.map((issue: any, i: number) => (
                          <li key={i}><b>{issue.section}:</b> {issue.issue} <i>({issue.recommendation})</i></li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="bg-green-100 border-l-4 border-green-500 p-3 rounded flex items-center text-green-800">
                      <ShieldCheck className="h-4 w-4 mr-1" />
                      <span className="font-medium">All compliance checks passed!</span>
                    </div>
                  )}
                  {typeof generatedReport.complianceCheckOutput?.overallComplianceScore === 'number' && (
                    <div className="mt-2 text-xs text-gray-700">Overall Compliance Score: <b>{generatedReport.complianceCheckOutput.overallComplianceScore}</b></div>
                  )}
                </div>
              </div>
              {/* Export/Print gating summary */}
              <div className="mt-4">
                {canExportReport(generatedReport) ? (
                  <div className="flex items-center text-green-700"><BadgeCheck className="h-4 w-4 mr-1" /> Ready to export/print.</div>
                ) : (
                  <div className="flex items-center text-red-700"><AlertCircle className="h-4 w-4 mr-1" /> Not ready: Approve all sections and resolve compliance issues.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <h2 className="text-2xl font-semibold text-primary text-center mb-6">Generated Report Sections Overview</h2>
          
          {generatedReport.narratives?.coverLetter && (
             <ReportSectionDisplay
                title="COVER LETTER (TRANSMITTAL)"
                content={generatedReport.narratives.coverLetter}
                icon={<FileText className="h-5 w-5" />}
              />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {reportStructure.map((section) => {
              const sectionKey = section.key as keyof AppraisalCaseFile['narratives'];
              const content = generatedReport.narratives?.[sectionKey];
              // Handle incomeAndExpenseStatement specifically
              const displayContent = section.key === 'incomeAndExpenseStatement' 
                ? generatedReport.valuationResults?.income?.proForma 
                  ? JSON.stringify(generatedReport.valuationResults.income.proForma, null, 2) 
                  : undefined
                : content;

              return (
                <ReportSectionDisplay
                  key={section.title}
                  title={section.title}
                  content={displayContent}
                  icon={section.icon}
                  lowConfidence={generatedReport.statusFlags && generatedReport.statusFlags[sectionKey] === 'lowConfidence'}
                  editable={generatedReport.statusFlags && generatedReport.statusFlags[sectionKey] === 'lowConfidence'}
                  onApprove={() => {
                    setGeneratedReport(prev => {
                      if (!prev) return prev;
                    const newFlags = { ...prev.statusFlags, [sectionKey as keyof AppraisalCaseFile['statusFlags']]: 'approved' };
                    return { ...prev, statusFlags: newFlags };
                    });
                  }}
                />
              );
            })}
             {/* Explicitly display Market Analysis if not covered by specific items in reportStructure for clarity */}
          {generatedReport.narratives?.marketAnalysis && !reportStructure.find(s => s.key === 'marketAnalysis' as any) && (
              <ReportSectionDisplay
                title="MARKET ANALYSIS (OVERVIEW)"
                content={generatedReport.narratives.marketAnalysis}
                icon={<BarChartBig className="h-5 w-5" />}
              />
            )}
          </div>

          {/* Valuation Details Section */}
          <Card className="shadow-lg border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setShowValuationDetails(v => !v)}>
              <CardTitle className="flex items-center text-lg">
                <DollarSign className="h-5 w-5 mr-2 text-primary" />
                Valuation Details (Sales Comparison, Income, Cost, Reconciliation)
              </CardTitle>
              <span>{showValuationDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
            </CardHeader>
            {showValuationDetails && (
              <CardContent className="space-y-6">
                {/* Sales Comparison Approach */}
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center"><DollarSign className="h-5 w-5 mr-2" />Sales Comparison Approach</h3>
                  {generatedReport.narratives?.salesComparisonApproach ? (
                    <>
                      <p className="mb-2 text-sm text-foreground whitespace-pre-wrap">{generatedReport.narratives.salesComparisonApproach}</p>
                      {generatedReport.valuationResults?.salesComparison?.adjustmentGrid && (
                        <div className="mb-2">
                          <span className="font-medium">Adjustment Grid:</span>
                          {editState['salesComparisonGrid'] ? (
                            <>
                              <textarea
                                className="w-full min-h-[120px] border rounded-md p-2 text-xs mt-1"
                                value={editValue['salesComparisonGrid'] ?? JSON.stringify(generatedReport.valuationResults.salesComparison.adjustmentGrid, null, 2)}
                                onChange={e => setEditValue(v => ({ ...v, salesComparisonGrid: e.target.value }))}
                              />
                              {editError['salesComparisonGrid'] && <div className="text-red-600 text-xs">{editError['salesComparisonGrid']}</div>}
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={() => setEditState(s => ({ ...s, salesComparisonGrid: false }))}>Cancel</Button>
                                <Button size="sm" onClick={async () => {
                                  const salesComparisonGridString = editValue['salesComparisonGrid'];
                                  let parsed = null;

                                  if (salesComparisonGridString && salesComparisonGridString.trim() !== '') {
                                    try {
                                      parsed = JSON.parse(salesComparisonGridString);
                                      setEditError(e => ({ ...e, salesComparisonGrid: null })); // Clear previous error
                                    } catch (err) {
                                      setEditError(e => ({ ...e, salesComparisonGrid: 'Invalid JSON format.' }));
                                      return; // Prevent further execution
                                    }
                                  } else {
                                    setEditError(e => ({ ...e, salesComparisonGrid: 'Sales comparison grid data cannot be empty.' }));
                                    return; // Prevent further execution
                                  }

                                  // Subsequent code only runs if parsed is not null and no error occurred
                                  if (parsed === null) { // Should be caught by previous checks, but as a safeguard
                                      setEditError(e => ({ ...e, salesComparisonGrid: 'An unexpected error occurred with parsing.' }));
                                      return;
                                  }

                                  try {
                                    const updatedCaseFile = await saveSalesComparisonGrid(lastCaseFile!, parsed); 
                                    setLastCaseFile(updatedCaseFile);
                                    setGeneratedReport(prev => prev ? ({
                                      ...prev,
                                      valuationResults: {
                                        ...(prev.valuationResults || {}),
                                        salesComparison: {
                                          ...(prev.valuationResults?.salesComparison || {}),
                                          adjustmentGrid: parsed,
                                        },
                                      },
                                    }) : prev);
                                    setEditState(s => ({ ...s, salesComparisonGrid: false }));
                                    setEditError(e => ({ ...e, salesComparisonGrid: null }));
                                    // Auto-regenerate reconciliation
                                    const values = form.getValues();
                                    try {
                                      const regen = await regenerateReconciliationSection(updatedCaseFile, {
                                        userRationale: values.userRationale || '',
                                        finalUserValue: Number(values.finalUserValue) || 0,
                                      });
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), reconciliation: regen.narrative },
                                        valuationResults: { ...(prev.valuationResults || {}), reconciliation: regen.output },
                                      }) : prev);
                                      toast ? toast.success('Reconciliation updated after Sales Comparison edit!') : alert('Reconciliation updated after Sales Comparison edit!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Reconciliation after Sales Comparison edit.') : alert('Failed to update Reconciliation after Sales Comparison edit.');
                                    }
                                    // After reconciliation regeneration, update Executive Summary and Cover Letter
                                    try {
                                      const exec = await regenerateExecutiveSummarySection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), executiveSummary: exec.narrative },
                                      }) : prev);
                                      toast ? toast.success('Executive Summary updated!') : alert('Executive Summary updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Executive Summary.') : alert('Failed to update Executive Summary.');
                                    }
                                    try {
                                      const cover = await regenerateCoverLetterSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), coverLetter: cover.narrative },
                                      }) : prev);
                                      toast ? toast.success('Cover Letter updated!') : alert('Cover Letter updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Cover Letter.') : alert('Failed to update Cover Letter.');
                                    }
                                    try {
                                      const compliance = await regenerateComplianceCheckSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        complianceCheckOutput: compliance,
                                      }) : prev);
                                      toast ? toast.success('Compliance Check updated!') : alert('Compliance Check updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Compliance Check.') : alert('Failed to update Compliance Check.');
                                    }
                                  } catch (err) {
                                    setEditError(e => ({ ...e, salesComparisonGrid: 'Invalid JSON or failed to save' }));
                                  }
                                }}>Save</Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <pre className="bg-secondary/30 rounded p-2 text-xs overflow-x-auto mt-1">{JSON.stringify(generatedReport.valuationResults.salesComparison.adjustmentGrid, null, 2)}</pre>
                              <Button size="xs" className="mt-1" onClick={() => {
                                setEditState(s => ({ ...s, salesComparisonGrid: true }));
                                setEditValue(v => ({ ...v, salesComparisonGrid: JSON.stringify(generatedReport.valuationResults.salesComparison.adjustmentGrid, null, 2) }));
                              }}>Edit</Button>
                            </>
                          )}
                        </div>
                      )}
                      {typeof generatedReport.valuationResults?.salesComparison?.indicatedValue === 'number' && (
                        <div className="mb-2"><span className="font-medium">Indicated Value: </span>${generatedReport.valuationResults.salesComparison.indicatedValue.toLocaleString()}</div>
                      )}
                      <Button size="sm" className="mt-2" onClick={async () => {
                        setRegenLoading('salesComparison');
                        try {
                          const regen = await regenerateSalesComparisonSection(lastCaseFile!); 
                          setGeneratedReport(prev => prev ? ({
                            ...prev,
                            narratives: { ...(prev.narratives || {}), salesComparisonApproach: regen.narrative },
                            valuationResults: { ...(prev.valuationResults || {}), salesComparison: regen.output },
                          }) : prev);
                          toast ? toast.success('Sales Comparison Approach regenerated!') : alert('Sales Comparison Approach regenerated!');
                        } catch (e) {
                          toast ? toast.error('Failed to regenerate Sales Comparison Approach.') : alert('Failed to regenerate Sales Comparison Approach.');
                        }
                        setRegenLoading(null);
                      }} disabled={regenLoading === 'salesComparison'}>
                        {regenLoading === 'salesComparison' ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}
                        Regenerate Section
                      </Button>
                    </>
                  ) : <span className="text-muted-foreground italic">No Sales Comparison Approach data.</span>}
                </div>
                {/* Income Approach */}
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center"><DollarSign className="h-5 w-5 mr-2" />Income Approach</h3>
                  {generatedReport.narratives?.incomeApproach ? (
                    <>
                      <p className="mb-2 text-sm text-foreground whitespace-pre-wrap">{generatedReport.narratives.incomeApproach}</p>
                      {generatedReport.valuationResults?.income?.proForma && (
                        <div className="mb-2">
                          <span className="font-medium">Pro Forma:</span>
                          {editState['incomeProForma'] ? (
                            <>
                              <textarea
                                className="w-full min-h-[120px] border rounded-md p-2 text-xs mt-1"
                                value={editValue['incomeProForma'] ?? JSON.stringify(generatedReport.valuationResults?.income?.proForma, null, 2)}
                                onChange={e => setEditValue(v => ({ ...v, incomeProForma: e.target.value }))}
                              />
                              {editError['incomeProForma'] && <div className="text-red-600 text-xs">{editError['incomeProForma']}</div>}
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={() => setEditState(s => ({ ...s, incomeProForma: false }))}>Cancel</Button>
                                <Button size="sm" onClick={async () => {
                                  try {
                                    const parsed = JSON.parse(editValue['incomeProForma'] ?? '');
                                    const updatedCaseFile = await saveIncomeProForma(lastCaseFile!, parsed); 
                                    setLastCaseFile(updatedCaseFile);
                                    setGeneratedReport(prev => prev ? ({
                                      ...prev,
                                      valuationResults: {
                                        ...(prev.valuationResults || {}),
                                        income: { ...(prev.valuationResults?.income || {}), proForma: parsed },
                                      },
                                    }) : prev);
                                    setEditState(s => ({ ...s, incomeProForma: false }));
                                    setEditError(e => ({ ...e, incomeProForma: null }));
                                    // Auto-regenerate reconciliation
                                    const values = form.getValues();
                                    try {
                                      const regen = await regenerateReconciliationSection(updatedCaseFile, {
                                        userRationale: values.userRationale || '',
                                        finalUserValue: Number(values.finalUserValue) || 0,
                                      });
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), reconciliation: regen.narrative },
                                        valuationResults: { ...(prev.valuationResults || {}), reconciliation: regen.output },
                                      }) : prev);
                                      toast ? toast.success('Reconciliation updated after Income edit!') : alert('Reconciliation updated after Income edit!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Reconciliation after Income edit.') : alert('Failed to update Reconciliation after Income edit.');
                                    }
                                    // After reconciliation regeneration, update Executive Summary and Cover Letter
                                    try {
                                      const exec = await regenerateExecutiveSummarySection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), executiveSummary: exec.narrative },
                                      }) : prev);
                                      toast ? toast.success('Executive Summary updated!') : alert('Executive Summary updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Executive Summary.') : alert('Failed to update Executive Summary.');
                                    }
                                    try {
                                      const cover = await regenerateCoverLetterSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), coverLetter: cover.narrative },
                                      }) : prev);
                                      toast ? toast.success('Cover Letter updated!') : alert('Cover Letter updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Cover Letter.') : alert('Failed to update Cover Letter.');
                                    }
                                    try {
                                      const compliance = await regenerateComplianceCheckSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        complianceCheckOutput: compliance,
                                      }) : prev);
                                      toast ? toast.success('Compliance Check updated!') : alert('Compliance Check updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Compliance Check.') : alert('Failed to update Compliance Check.');
                                    }
                                  } catch (err) {
                                    setEditError(e => ({ ...e, incomeProForma: 'Invalid JSON or failed to save' }));
                                  }
                                }}>Save</Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <pre className="bg-secondary/30 rounded p-2 text-xs overflow-x-auto mt-1">{JSON.stringify(generatedReport.valuationResults?.income?.proForma, null, 2)}</pre>
                              <Button size="xs" className="mt-1" onClick={() => {
                                setEditState(s => ({ ...s, incomeProForma: true }));
                                setEditValue(v => ({ ...v, incomeProForma: JSON.stringify(generatedReport.valuationResults?.income?.proForma, null, 2) }));
                              }}>Edit</Button>
                            </>
                          )}
                        </div>
                      )}
                      {generatedReport.valuationResults?.income?.indicatedValue && (
                        <div className="mb-2"><span className="font-medium">Indicated Value: </span>${generatedReport.valuationResults.income.indicatedValue.toLocaleString()}</div>
                      )}
                      <Button size="sm" className="mt-2" onClick={async () => {
                        setRegenLoading('income');
                        try {
                          const values = form.getValues();
                          const regen = await regenerateIncomeApproachSection(lastCaseFile!, { 
                            marketRentPerSF: Number(values.marketRentPerSF) || 0,
                            vacancyRate: Number(values.vacancyRate) || 0,
                            operatingExpenses: Number(values.operatingExpenses) || 0,
                            capRate: Number(values.capRate) || 0,
                            discountRate: values.discountRate !== undefined ? Number(values.discountRate) : undefined,
                          });
                          setGeneratedReport(prev => prev ? ({
                            ...prev,
                            narratives: { ...(prev.narratives || {}), incomeApproach: regen.narrative },
                            valuationResults: { ...(prev.valuationResults || {}), income: regen.output },
                          }) : prev);
                          toast ? toast.success('Income Approach regenerated!') : alert('Income Approach regenerated!');
                        } catch (e) {
                          toast ? toast.error('Failed to regenerate Income Approach.') : alert('Failed to regenerate Income Approach.');
                        }
                        setRegenLoading(null);
                      }} disabled={regenLoading === 'income'}>
                        {regenLoading === 'income' ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}
                        Regenerate Section
                      </Button>
                    </>
                  ) : <span className="text-muted-foreground italic">No Income Approach data.</span>}
                </div>
                {/* Cost Approach */}
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center"><DollarSign className="h-5 w-5 mr-2" />Cost Approach</h3>
                  {generatedReport.narratives?.costApproach ? ( // Check narrative for cost approach
                    <>
                      <p className="mb-2 text-sm text-foreground whitespace-pre-wrap">{generatedReport.narratives.costApproach}</p>
                      {/* Display cost details if available */}
                      {generatedReport.valuationResults?.cost && (
                        <>
                          <div className="mb-2"><span className="font-medium">Indicated Value: </span>${generatedReport.valuationResults.cost.indicatedValue?.toLocaleString()}</div>
                          <div className="mb-2"><span className="font-medium">Land Value: </span>${generatedReport.valuationResults.cost.landValue?.toLocaleString()}</div>
                          <div className="mb-2"><span className="font-medium">Cost New: </span>${generatedReport.valuationResults.cost.costNew?.toLocaleString()}</div>
                          <div className="mb-2"><span className="font-medium">Total Depreciation: </span>${generatedReport.valuationResults.cost.totalDepreciation?.toLocaleString()}</div>
                        </>
                      )}
                      <div className="mb-2">
                        <span className="font-medium">Cost Approach Data (JSON):</span>
                        {editState['costApproach'] ? (
                          <>
                            <textarea
                              className="w-full min-h-[120px] border rounded-md p-2 text-xs mt-1"
                              value={editValue['costApproach'] ?? JSON.stringify(generatedReport.valuationResults.cost, null, 2)}
                              onChange={e => setEditValue(v => ({ ...v, costApproach: e.target.value }))}
                            />
                            {editError['costApproach'] && <div className="text-red-600 text-xs">{editError['costApproach']}</div>}
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" onClick={() => setEditState(s => ({ ...s, costApproach: false }))}>Cancel</Button>
                              <Button size="sm" onClick={async () => {
                                try {
                                  const parsed = JSON.parse(editValue['costApproach'] ?? '');
                                    const updatedCaseFile = await saveCostApproachData(lastCaseFile!, parsed); 
                                  setLastCaseFile(updatedCaseFile);
                                    setGeneratedReport(prev => prev ? ({
                                    ...prev,
                                    valuationResults: {
                                      ...(prev.valuationResults || {}),
                                      cost: parsed,
                                    },
                                    }) : prev);
                                  setEditState(s => ({ ...s, costApproach: false }));
                                  setEditError(e => ({ ...e, costApproach: null }));
                                  // Auto-regenerate reconciliation
                                  const values = form.getValues();
                                  try {
                                    const regen = await regenerateReconciliationSection(updatedCaseFile, {
                                      userRationale: values.userRationale || '',
                                      finalUserValue: Number(values.finalUserValue) || 0,
                                    });
                                      setGeneratedReport(prev => prev ? ({
                                      ...prev,
                                      narratives: { ...(prev.narratives || {}), reconciliation: regen.narrative },
                                      valuationResults: { ...(prev.valuationResults || {}), reconciliation: regen.output },
                                      }) : prev);
                                    toast ? toast.success('Reconciliation updated after Cost Approach edit!') : alert('Reconciliation updated after Cost Approach edit!');
                                  } catch (e) {
                                    toast ? toast.error('Failed to update Reconciliation after Cost Approach edit.') : alert('Failed to update Reconciliation after Cost Approach edit.');
                                  }
                                  // After reconciliation regeneration, update Executive Summary and Cover Letter
                                  try {
                                    const exec = await regenerateExecutiveSummarySection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                      ...prev,
                                      narratives: { ...(prev.narratives || {}), executiveSummary: exec.narrative },
                                      }) : prev);
                                      toast ? toast.success('Executive Summary updated!') : alert('Executive Summary updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Executive Summary.') : alert('Failed to update Executive Summary.');
                                    }
                                    try {
                                      const cover = await regenerateCoverLetterSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        narratives: { ...(prev.narratives || {}), coverLetter: cover.narrative },
                                      }) : prev);
                                      toast ? toast.success('Cover Letter updated!') : alert('Cover Letter updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Cover Letter.') : alert('Failed to update Cover Letter.');
                                    }
                                    try {
                                      const compliance = await regenerateComplianceCheckSection(updatedCaseFile);
                                      setGeneratedReport(prev => prev ? ({
                                        ...prev,
                                        complianceCheckOutput: compliance,
                                      }) : prev);
                                      toast ? toast.success('Compliance Check updated!') : alert('Compliance Check updated!');
                                    } catch (e) {
                                      toast ? toast.error('Failed to update Compliance Check.') : alert('Failed to update Compliance Check.');
                                  }
                                } catch (err) {
                                  setEditError(e => ({ ...e, costApproach: 'Invalid JSON or failed to save' }));
                                }
                              }}>Save</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <pre className="bg-secondary/30 rounded p-2 text-xs overflow-x-auto mt-1">{JSON.stringify(generatedReport.valuationResults.cost, null, 2)}</pre>
                            <Button size="xs" className="mt-1" onClick={() => {
                              setEditState(s => ({ ...s, costApproach: true }));
                              setEditValue(v => ({ ...v, costApproach: JSON.stringify(generatedReport.valuationResults.cost, null, 2) }));
                            }}>Edit</Button>
                          </>
                        )}
                      </div>
                      <Button size="sm" className="mt-2" onClick={async () => {
                        setRegenLoading('cost');
                        try {
                          const values = form.getValues();
                          const regen = await regenerateCostApproachSection(lastCaseFile!, { 
                            landValue: Number(values.landValue) || 0,
                            costNew: Number(values.costNew) || 0,
                            totalDepreciation: Number(values.totalDepreciation) || 0,
                          });
                          setGeneratedReport(prev => prev ? ({
                            ...prev,
                            narratives: { ...(prev.narratives || {}), costApproach: regen.narrative }, 
                            valuationResults: { ...(prev.valuationResults || {}), cost: regen.output },
                          }) : prev);
                          toast ? toast.success('Cost Approach regenerated!') : alert('Cost Approach regenerated!');
                        } catch (e) {
                          toast ? toast.error('Failed to regenerate Cost Approach.') : alert('Failed to regenerate Cost Approach.');
                        }
                        setRegenLoading(null);
                      }} disabled={regenLoading === 'cost'}>
                        {regenLoading === 'cost' ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}
                        Regenerate Section
                      </Button>
                    </>
                  ) : <span className="text-muted-foreground italic">No Cost Approach data.</span>}
                </div>
                {/* Reconciliation */}
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center"><Scale className="h-5 w-5 mr-2" />Reconciliation</h3>
                  {generatedReport.narratives?.reconciliation ? (
                    <>
                      <p className="mb-2 text-sm text-foreground whitespace-pre-wrap">{generatedReport.narratives.reconciliation}</p>
                      {generatedReport.valuationResults?.reconciliation?.finalReconciledValue && (
                        <div className="mb-2"><span className="font-medium">Final Reconciled Value: </span>${generatedReport.valuationResults.reconciliation.finalReconciledValue.toLocaleString()}</div>
                      )}
                      <Button size="sm" className="mt-2" onClick={async () => {
                        setRegenLoading('reconciliation');
                        try {
                          const values = form.getValues();
                          const regen = await regenerateReconciliationSection(lastCaseFile!, { 
                            userRationale: values.userRationale || '',
                            finalUserValue: Number(values.finalUserValue) || 0,
                          });
                          setGeneratedReport(prev => prev ? ({
                            ...prev,
                            narratives: { ...(prev.narratives || {}), reconciliation: regen.narrative },
                            valuationResults: { ...(prev.valuationResults || {}), reconciliation: regen.output },
                          }) : prev);
                          toast ? toast.success('Reconciliation regenerated!') : alert('Reconciliation regenerated!');
                        } catch (e) {
                          toast ? toast.error('Failed to regenerate Reconciliation.') : alert('Failed to regenerate Reconciliation.');
                        }
                        setRegenLoading(null);
                      }} disabled={regenLoading === 'reconciliation'}>
                        {regenLoading === 'reconciliation' ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}
                        Regenerate Section
                      </Button>
                    </>
                  ) : <span className="text-muted-foreground italic">No Reconciliation data.</span>}
                </div>
              </CardContent>
            )}
          </Card>

          <div className="flex justify-end mt-8">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="lg"
                      className="bg-primary text-primary-foreground"
                      disabled={!canExportReport(generatedReport)}
                      onClick={() => {
                        // Placeholder for export/print logic
                        alert('Export/Print triggered!');
                      }}
                    >
                      Export / Print Report
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canExportReport(generatedReport) && (
                  <TooltipContent>
                    <span>
                      You must approve all major sections and resolve all compliance issues before exporting or printing the report.
                    </span>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
    </div>
  );
}

    
