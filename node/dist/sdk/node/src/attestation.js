"use strict";
/**
 * Attestation Types and Interfaces
 *
 * This module defines all attestation-related types for the agent passport system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATTESTATION_TO_ASSURANCE = void 0;
// Map attestation types to assurance levels and methods
exports.ATTESTATION_TO_ASSURANCE = {
    email_verification: {
        assurance_level: "L1",
        assurance_method: "email_verified",
    },
    github_verification: {
        assurance_level: "L1",
        assurance_method: "github_verified",
    },
    github_org_verification: {
        assurance_level: "L2",
        assurance_method: "github_verified",
    },
    domain_verification: {
        assurance_level: "L2",
        assurance_method: "domain_verified",
    },
    platform_verification: {
        assurance_level: "L2",
        assurance_method: "github_verified",
    },
    kyc_verification: { assurance_level: "L3", assurance_method: "kyc_verified" },
    kyb_verification: { assurance_level: "L3", assurance_method: "kyb_verified" },
    financial_verification: {
        assurance_level: "L4FIN",
        assurance_method: "financial_data_verified",
    },
};
//# sourceMappingURL=attestation.js.map