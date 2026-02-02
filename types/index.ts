export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  name?: string;
  createdAt?: string;
}

export interface Story {
  id: UUID;
  title: string;
  centralQuestion: string;
  status: 'active' | 'cold' | 'solved';
  createdAt: string;
  updatedAt: string;
  userId: UUID;
  public_interest_score: number;
  ethical_concerns?: string;
  story_stage: 'viability_assessment' | 'background_research' | 'source_development' | 'verification' | 'writing' | 'published';
}

export interface Position {
  x: number;
  y: number;
}

export type NodeType = 'person' | 'location' | 'event' | 'evidence' | 'theory';

export interface Attachment {
  id: UUID;
  name: string;
  url?: string;
  type?: string;
}

export interface NodeData {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  confidence?: 1 | 2 | 3 | 4 | 5;
  verified?: boolean;
  source?: string;
  createdAt?: string;
  aiExtracted?: boolean;
  attachments?: Attachment[];
}

export interface Node {
  id: UUID;
  storyId: UUID;
  type: NodeType;
  position: Position;
  data: NodeData;
}

export type EdgeType = 'confirmed' | 'suspected' | 'contradicts';
export type EdgeStrength = 'weak' | 'medium' | 'strong';

export interface Edge {
  id: UUID;
  storyId: UUID;
  source: UUID;
  target: UUID;
  type: EdgeType;
  strength: EdgeStrength;
  label: string;
  evidence: UUID[];
  createdAt: string;
}

export interface TimelineEvent {
  id: UUID;
  storyId: UUID;
  timestamp: string;
  description: string;
  entities: UUID[];
  verified: boolean;
}

export type InsightType = 'suggestion' | 'contradiction' | 'pattern' | 'gap' | 'warning';
export type InsightPriority = 'low' | 'medium' | 'high' | 'critical';

export interface AIInsight {
  id: UUID;
  storyId: UUID;
  type: InsightType;
  content: string;
  priority: InsightPriority;
  dismissed: boolean;
  createdAt: string;
}

export interface SourceNode {
  id: UUID;
  storyId: UUID;
  type: 'source';
  position: Position;
  data: {
    label: string;
    role: string;
    credibility: 1 | 2 | 3 | 4 | 5;
    anonymity: boolean;
    contactInfo: string;
    quotes: string[];
    protectIdentity?: boolean;
    protectedName?: string;
    protectedContactInfo?: string;
    createdAt?: string;
  };
}

export interface ClaimNode {
  id: UUID;
  storyId: UUID;
  type: 'claim';
  position: Position;
  data: {
    label: string;
    statement: string;
    verificationStatus: 'unverified' | 'verified' | 'debunked' | 'partially_true';
    factCheckNotes: string;
    rightToReplyContacted?: boolean;
    rightToReplyDeadline?: string;
    rightToReplyResponse?: string;
  };
}

export interface PublicationNode {
  id: UUID;
  storyId: UUID;
  type: 'publication';
  position: Position;
  data: {
    outlet: string;
    datePublished?: string;
    url?: string;
    editor?: string;
    status?: 'draft' | 'submitted' | 'published' | 'retracted';
  };
}

export interface EvidenceNode {
  id: UUID;
  storyId: UUID;
  type: 'evidence';
  position: Position;
  data: {
    label: string;
    evidenceType: 'document' | 'photo' | 'data';
    acquisitionMethod: 'FOIA' | 'leak' | 'public_record';
    legalClearance: boolean;
    attachments?: Attachment[];
  };
}
