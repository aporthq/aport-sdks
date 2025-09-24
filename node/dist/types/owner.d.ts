export type CapabilityId = "payments.refund" | "payments.payout" | "returns.process" | "inventory.adjust" | "data.export" | "data.delete" | "identity.manage_roles" | "messaging.send" | "crm.update" | "repo.merge" | "repo.pr.create" | "infra.deploy";
import { AssuranceLevel, AssuranceMethod } from "../functions/utils/assurance";
export type OwnerType = "org" | "user";
export interface PreviousAttestation {
    attestation_id: string;
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
    assurance_verified_at: string;
    attested_at: string;
    attested_by: string;
    attested_reason: string;
    attested_evidence: {
        type: string;
        value: string;
        verified_at: string;
        expires_at?: string;
        metadata?: Record<string, any>;
    };
    status: "verified" | "expired" | "revoked";
    previous_assurance_level?: AssuranceLevel;
}
export interface User {
    user_id: string;
    email?: string;
    display_name?: string;
    created_at: string;
    updated_at: string;
    assurance_level: AssuranceLevel;
    assurance_method?: AssuranceMethod;
    assurance_verified_at?: string;
    github_id?: string;
    github_login?: string;
    github_org_memberships?: GitHubOrgMembership[];
    last_login_at?: string;
    previous_attestations?: PreviousAttestation[];
    webhook_url?: string;
}
export interface GitHubOrgMembership {
    org_id: number;
    org_login: string;
    org_name: string;
    role: "member" | "admin";
    verified_at: string;
    metadata?: {
        org_avatar_url?: string;
        org_html_url?: string;
        org_description?: string;
    };
}
export interface OrgMember {
    user_id: string;
    role: "admin" | "member";
    added_at: string;
}
export interface Organization {
    org_id: string;
    name: string;
    domain?: string;
    contact_email: string;
    members: OrgMember[];
    created_at: string;
    updated_at: string;
    assurance_level: AssuranceLevel;
    assurance_method?: AssuranceMethod;
    assurance_verified_at?: string;
    previous_attestations?: PreviousAttestation[];
    webhook_url?: string;
}
export interface CreateUserRequest {
    email: string;
    display_name: string;
}
export interface CreateOrgRequest {
    name: string;
    domain?: string;
    contact_email: string;
}
export interface AddMemberRequest {
    user_id: string;
    role: "admin" | "member";
}
export interface OwnerInfo {
    owner_id: string;
    owner_type: OwnerType;
    owner_display: string;
    assurance_level: AssuranceLevel;
    assurance_method?: AssuranceMethod;
    assurance_verified_at?: string;
}
//# sourceMappingURL=owner.d.ts.map