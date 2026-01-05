
export type ScriptElementType = 
  | 'SLUGLINE' 
  | 'ACTION' 
  | 'CHARACTER' 
  | 'DIALOGUE' 
  | 'PARENTHETICAL' 
  | 'TRANSITION' 
  | 'TITLE_PAGE'
  | 'SHOT'
  | 'NOTE';

export interface ScriptElement {
  id: string;
  type: ScriptElementType;
  content: string;
}

export interface Screenplay {
  title: string;
  author: string;
  elements: ScriptElement[];
}

export enum Type {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}
