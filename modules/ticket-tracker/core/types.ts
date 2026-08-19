export type TicketFieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: string[]; // required when type === 'select', ignored otherwise
};

export type TicketSchema = {
  fields: TicketFieldDef[];
  statuses: string[];        // statuses[0] is the initial status for new tickets
  allowedTransitions: Record<string, string[]>;
  priorities?: string[];     // defaults to ['Low','Medium','High'] if omitted
};

export type Ticket = {
  id: string;
  status: string;
  priority?: string;
  field_values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateTicketInput = {
  field_values: Record<string, unknown>;
  priority?: string;
};

export type TicketListFilter = {
  status?: string;
  priority?: string;
};

export type ValidationResult =
  | { ok: true; data: CreateTicketInput }
  | { ok: false; errors: Record<string, string> };

export type UpdateStatusResult =
  | {
      ok: true;
      ticket: Ticket;
    }
  | {
      ok: false;
      error: 'NOT_FOUND' | 'INVALID_STATUS' | 'INVALID_TRANSITION';
      message: string;
      current_status?: string;
      allowed_statuses?: string[];
    };
