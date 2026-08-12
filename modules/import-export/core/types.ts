export type DataFormat = 'csv' | 'jsonl' | 'xlsx';

export type ParserOptions = {
  format: DataFormat;
  delimiter?: string;
  hasHeader?: boolean;
  skipRows?: number;
  maxBytes?: number;
  maxRows?: number;
};

export type SerializerOptions = {
  format: DataFormat;
  delimiter?: string;
  columns?: string[];
  includeHeader?: boolean;
  escapeFormulas?: boolean;
};

export type ImportRowError = {
  code: string;
  message: string;
  field?: string;
};

export type ImportedRecord<T = Record<string, unknown>> = {
  row: number;
  value?: T;
  valid: boolean;
  errors?: ImportRowError[];
};

export type ImportResult<T = Record<string, unknown>> = {
  total: number;
  accepted: number;
  rejected: number;
  records: ImportedRecord<T>[];
};

export type ExportResult = {
  contentType: string;
  filenameExtension: string;
  data: string | Uint8Array;
  recordCount: number;
};
