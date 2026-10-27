// src/memory/types.ts

export type MemoryCategory = 'preference' | 'project' | 'goal' | 'relationship' | 'fact';

export interface MemoryRecord {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  key?: string;
  confidence: number;
  isActive: boolean;
  source: 'user' | 'assistant' | 'supermemory';
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRelationship {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  relationType: 'relates_to' | 'depends_on' | 'part_of' | 'conflicts_with';
  createdAt: string;
}

export interface MemoryGraphNode {
  id: string;
  label: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  source: string;
  updatedAt: string;
}

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
}

export interface MemoryGraphData {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}
