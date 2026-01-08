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
  story_stage: 'viability_assessment' | 'background_research' | 'source_development' | 'verification' | 'writing' | 'published' | 'follow_up';
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
    name: string;
    credibility: number; // 0-100
    affiliation?: string;
    contact?: string;
    notes?: string;
    anonymity?: 'none' | 'requested' | 'promised';
    createdAt?: string;
  };
}

export interface ClaimNode {
  id: UUID;
  storyId: UUID;
  type: 'claim';
  position: Position;
  data: {
    text: string;
    verificationStatus: 'unverified' | 'corroborated' | 'refuted' | 'in_progress';
    originSourceId?: UUID;
    timestamp?: string;
    relatedEvidenceIds?: UUID[];
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
    kind: 'document' | 'image' | 'audio' | 'video' | 'dataset' | 'other';
    description: string;
    provenance?: string;
    verified: boolean;
    attachments?: Attachment[];
    sourceId?: UUID;
  };
}
