export type Capability = {
    id: string;
    params?: Record<string, string | number | boolean>;
};
import { TypedLimits } from "../functions/utils/limits";
import { PassportCategory, PassportFramework } from "../functions/utils/taxonomy";
export type { PassportCategory, PassportFramework };
import { AssuranceLevel, AssuranceMethod } from "../functions/utils/assurance";
import { AttestationType } from "./attestation";
export type PassportLimits = TypedLimits;
export interface ModelInfo {
    model_refs?: Array<{
        provider: string;
        id: string;
        version?: string;
        hash?: string;
        modality?: string;
        evals?: Array<{
            name: string;
            score: number | string;
            date?: string;
        }>;
        safety?: {
            jailbreak?: "low" | "med" | "high";
            toxicity?: "low" | "med" | "high";
        };
    }>;
    tools?: Array<{
        name: string;
        provider?: string;
        version?: string;
        scopes?: string[];
    }>;
    provenance?: {
        repo?: string;
        commit?: string;
        manifest_hash?: string;
    };
    data_access?: {
        pii?: boolean;
        pci?: boolean;
        sources?: string[];
    };
}
export interface PassportData {
    agent_id: string;
    slug: string;
    name: string;
    owner_id: string;
    owner_type: "org" | "user";
    owner_display: string;
    controller_type: "org" | "person" | "api" | "user";
    claimed: boolean;
    role: string;
    description: string;
    capabilities: Capability[];
    limits: PassportLimits;
    regions: string[];
    status: "draft" | "active" | "suspended" | "revoked";
    verification_status: "unverified" | "email_verified" | "github_verified";
    verification_method?: "email" | "github_oauth";
    verification_evidence?: {
        email?: string;
        github_username?: string;
        github_org?: string;
        verified_at?: string;
    };
    assurance_level: AssuranceLevel;
    assurance_method?: AssuranceMethod;
    assurance_verified_at?: string;
    contact: string;
    links: {
        homepage?: string;
        docs?: string;
        repo?: string;
    };
    categories?: PassportCategory[];
    framework?: PassportFramework[];
    logo_url?: string;
    source: "admin" | "form" | "crawler";
    created_at: string;
    updated_at: string;
    version: string;
    model_info?: ModelInfo;
    issuer_type?: "user" | "org";
    issued_by?: string;
    provisioned_by_org_id?: string;
    pending_owner?: {
        email?: string;
        github_username?: string;
    };
    sponsor_orgs?: string[];
    registry_key_id?: string;
    registry_sig?: string;
    canonical_hash?: string;
    verified_at?: string;
    mcp?: {
        servers?: string[];
        tools?: string[];
    };
    evaluation?: {
        pack_id: string;
        assurance_ok: boolean;
        capability_ok: boolean;
        limits_ok: boolean;
        regions_ok: boolean;
        mcp_ok: boolean;
        reasons: string[];
    };
    attestations?: Array<{
        type: AttestationType;
        issuer?: string;
        reference?: string;
        claims?: Record<string, any>;
        signature?: string;
        verified_at?: string;
    }>;
    kind?: "template" | "instance";
    parent_agent_id?: string;
    platform_id?: string;
    controller_id?: string;
    tenant_ref?: string;
    creator_id?: string;
    creator_type?: "org" | "user";
    updated_from_parent_at?: string;
    webhook_url?: string;
    email?: string;
    integrations?: {
        github?: {
            allowed_actors?: string[];
            allowed_apps?: string[];
        };
    };
}
export interface AttestationAdapter {
    type: "vc" | "did" | "ap2" | "oidc";
    verify(input: any): Promise<{
        valid: boolean;
        fields: Record<string, any>;
    }>;
    toPassport?(fields: Record<string, any>): Partial<PassportData>;
    fromPassport?(passport: PassportData): any;
}
export interface CreatePassportRequest {
    name: string;
    owner_id?: string;
    controller_type: "org" | "person";
    role: string;
    description: string;
    capabilities?: Capability[];
    limits?: PassportLimits;
    regions: string[];
    status: "draft" | "active" | "suspended" | "revoked";
    verification_status?: "unverified" | "verified";
    verification_method?: string;
    contact: string;
    links?: {
        homepage?: string;
        docs?: string;
        repo?: string;
    };
    framework?: PassportFramework[];
    categories?: PassportCategory[];
    logo_url?: string;
    source?: "admin" | "form" | "crawler";
    version?: string;
}
export interface UpdatePassportRequest {
    agent_id: string;
    name?: string;
    owner_id?: string;
    role?: string;
    description?: string;
    capabilities?: Capability[];
    limits?: PassportLimits;
    regions?: string[];
    contact?: string;
    links?: {
        homepage?: string;
        docs?: string;
        repo?: string;
    };
    framework?: PassportFramework[];
    categories?: PassportCategory[];
    logo_url?: string;
    status?: "draft" | "active" | "suspended" | "revoked";
    registry_key_id?: string;
    registry_sig?: string;
    canonical_hash?: string;
    verified_at?: string;
    verification_evidence?: {
        github_user?: string;
        org_id?: string;
        repo_ids?: string[];
        email?: string;
        verified_at: string;
    };
    manifest_hash?: string;
    manifest_status?: "up_to_date" | "stale" | "missing";
}
export interface UpdateStatusRequest {
    agent_id: string;
    status: "draft" | "active" | "suspended" | "revoked";
}
export interface AgentSummary {
    agent_id: string;
    name: string;
    status: string;
    source: string;
    slug?: string;
}
//# sourceMappingURL=passport.d.ts.map