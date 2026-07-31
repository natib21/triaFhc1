/**
 * Types for Housing Allocation & Mapping Management Module
 */

export type MappingDecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type BeneficiaryStatus = 'WAITING_LIST' | 'MAPPED' | 'ALLOCATED';
export type PropertyStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED';
export type DecisionLetterStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';

export interface Property {
  id: string;
  code: string;
  address: string;
  propertyType: 'VILLA' | 'APARTMENT' | 'TOWNHOUSE' | 'CONDOMINIUM';
  bedrooms: number;
  bathrooms?: number;
  status: PropertyStatus;
  monthlyRent?: number;
  city?: string;
  subcity?: string;
  woreda?: string;
  features?: string[];
  imageUrl?: string;
}

export interface MatchingCriteria {
  criteriaVersion: number;
  rankCode: string;
  priorityLevel: number;
  bedroomEntitlementRule: string;
  requiredBedrooms: number;
  actualBedrooms: number;
  bedroomMatch: boolean;
  houseTypeMatch: boolean;
  preferredHouseTypes: string[];
  fallbackHouseTypes: string[];
}

export interface BeneficiaryInfo {
  id: string;
  userExtensionId?: string;
  requestId?: string;
  fullName: string;
  email?: string;
  phone?: string;
  rank?: string;
  rankCode?: string;
  institution?: string;
  priorityLevel?: string | number;
  status: BeneficiaryStatus;
  preferredHouseTypes?: string[];
  bedroomEntitlement?: number;
  queuePosition?: number;
  totalInQueue?: number;
}

export interface HouseAllocationMapping {
  id: string;
  referenceCode: string;
  beneficiaryId: string;
  beneficiary: BeneficiaryInfo;
  propertyId: string;
  property: Property;
  requestId?: string;
  requestReference?: string;
  decisionStatus: MappingDecisionStatus;
  isForced: boolean;
  forceReason?: string;
  notes?: string;
  mappedBy: string;
  createdAt: string;
  updatedAt?: string;
  decisionDate?: string;
  decisionBy?: string;
  decisionNotes?: string;
  rejectionReason?: string;
  allocatedAt?: string;
  allocatedBy?: string;
  isAllocated?: boolean;
  decisionLetterId?: string;
  decisionLetterReference?: string;
  reversalStatus?: 'NONE' | 'REVERSED';
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  matchScore?: number;
  matchingCriteria?: MatchingCriteria;
}

export interface AllocationDecisionLetter {
  id: string;
  letterReference: string;
  letterDate: string;
  status: DecisionLetterStatus;
  mappingsCount: number;
  mappings?: HouseAllocationMapping[];
  notes?: string;
  approvalDate?: string;
  approvedBy?: string;
  createdAt: string;
}

export interface SuggestionResult {
  property: Property;
  score: number;
  matchReasons: string[];
  bedroomMatch: boolean;
  houseTypeMatch: boolean;
  matchingCriteria: MatchingCriteria;
}

export interface NextWithSuggestionsResponse {
  beneficiary: BeneficiaryInfo;
  suggestions: SuggestionResult[];
}
