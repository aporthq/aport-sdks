/**
 * Compliance Metadata Types
 *
 * Enhanced compliance tracking for enterprise clients and regulatory requirements.
 * Supports GDPR, CCPA, SOC2, and other compliance frameworks.
 */

export interface DataResidencyInfo {
  region: string;
  country: string;
  dataCenter: string;
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  dataSovereignty: "strict" | "flexible";
  lastVerified: string; // ISO timestamp
}

export interface ProcessingInfo {
  lawfulBasis:
    | "consent"
    | "contract"
    | "legitimate-interest"
    | "vital-interests"
    | "public-task"
    | "legal-obligation";
  purpose: string;
  retentionPeriodDays: number;
  dataCategories: string[];
  processingActivities: string[];
  dataController: string;
  dataProcessor: string;
  thirdPartySharing: boolean;
  automatedDecisionMaking: boolean;
}

export interface DataSubjectRights {
  deletion: boolean;
  portability: boolean;
  rectification: boolean;
  access: boolean;
  restriction: boolean;
  objection: boolean;
  withdrawalOfConsent: boolean;
  dataPortabilityFormat: "json" | "csv" | "xml";
}

export interface ComplianceMetadata {
  dataResidency: DataResidencyInfo;
  processing: ProcessingInfo;
  rights: DataSubjectRights;
  complianceFrameworks: string[]; // ["GDPR", "CCPA", "SOC2", "ISO27001"]
  auditLevel: "basic" | "enhanced" | "enterprise";
  lastComplianceCheck: string; // ISO timestamp
  complianceStatus: "compliant" | "non-compliant" | "pending-review";
  notes?: string;
}

export interface ComplianceEvent {
  id: string;
  tenantId: string;
  eventType:
    | "data-access"
    | "data-modification"
    | "data-deletion"
    | "consent-given"
    | "consent-withdrawn"
    | "data-export"
    | "compliance-check";
  timestamp: string;
  userId?: string;
  dataCategories: string[];
  lawfulBasis: string;
  purpose: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
}

export interface ComplianceReport {
  tenantId: string;
  reportPeriod: {
    start: string;
    end: string;
  };
  dataProcessingActivities: ComplianceEvent[];
  dataSubjectRequests: ComplianceEvent[];
  complianceViolations: ComplianceEvent[];
  summary: {
    totalDataAccess: number;
    totalDataModifications: number;
    totalDataDeletions: number;
    totalConsentChanges: number;
    totalDataExports: number;
    complianceScore: number; // 0-100
  };
  generatedAt: string;
  generatedBy: string;
}

// Compliance validation utilities
export class ComplianceValidator {
  static validateDataResidency(metadata: DataResidencyInfo): boolean {
    return !!(
      metadata.region &&
      metadata.country &&
      metadata.dataCenter &&
      metadata.encryptionAtRest &&
      metadata.encryptionInTransit
    );
  }

  static validateProcessingInfo(metadata: ProcessingInfo): boolean {
    return !!(
      metadata.lawfulBasis &&
      metadata.purpose &&
      metadata.retentionPeriodDays > 0 &&
      metadata.dataCategories.length > 0 &&
      metadata.dataController &&
      metadata.dataProcessor
    );
  }

  static validateComplianceMetadata(metadata: ComplianceMetadata): boolean {
    return !!(
      this.validateDataResidency(metadata.dataResidency) &&
      this.validateProcessingInfo(metadata.processing) &&
      metadata.complianceFrameworks.length > 0 &&
      metadata.auditLevel &&
      metadata.complianceStatus
    );
  }

  static getDefaultComplianceMetadata(
    region: string,
    complianceLevel: string = "standard"
  ): ComplianceMetadata {
    const regionConfig = this.getRegionComplianceConfig(region);

    return {
      dataResidency: {
        region: regionConfig.region,
        country: regionConfig.country,
        dataCenter: regionConfig.dataCenter,
        encryptionAtRest: true,
        encryptionInTransit: true,
        dataSovereignty:
          complianceLevel === "enterprise" ? "strict" : "flexible",
        lastVerified: new Date().toISOString(),
      },
      processing: {
        lawfulBasis: "legitimate-interest",
        purpose: "AI Agent Identity Verification and Authentication",
        retentionPeriodDays: complianceLevel === "enterprise" ? 2555 : 365, // 7 years vs 1 year
        dataCategories: ["identity", "authentication", "verification", "audit"],
        processingActivities: [
          "verification",
          "authentication",
          "audit-logging",
        ],
        dataController: "Agent Passport Platform",
        dataProcessor: "Agent Passport Platform",
        thirdPartySharing: false,
        automatedDecisionMaking: true,
      },
      rights: {
        deletion: true,
        portability: true,
        rectification: true,
        access: true,
        restriction: true,
        objection: true,
        withdrawalOfConsent: true,
        dataPortabilityFormat: "json",
      },
      complianceFrameworks: regionConfig.frameworks,
      auditLevel: complianceLevel as "basic" | "enhanced" | "enterprise",
      lastComplianceCheck: new Date().toISOString(),
      complianceStatus: "compliant",
      notes: `Default compliance configuration for ${region} region with ${complianceLevel} level`,
    };
  }

  private static getRegionComplianceConfig(region: string) {
    const configs: Record<string, any> = {
      US: {
        region: "US",
        country: "United States",
        dataCenter: "us-east-1",
        frameworks: ["CCPA", "SOC2", "ISO27001"],
      },
      EU: {
        region: "EU",
        country: "Ireland",
        dataCenter: "eu-west-1",
        frameworks: ["GDPR", "SOC2", "ISO27001"],
      },
      CA: {
        region: "CA",
        country: "Canada",
        dataCenter: "ca-central-1",
        frameworks: ["PIPEDA", "SOC2", "ISO27001"],
      },
    };

    return configs[region] || configs.US;
  }
}
