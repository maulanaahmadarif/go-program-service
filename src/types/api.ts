import { Request } from 'express';
import { Logger } from 'pino';

export interface CustomRequest extends Request {
  user?: {
    userId: number;
    email: string;
    companyId: number;
  };
  log: Logger;
}

export interface RedeemPointRequest {
  product_id: number;
  points_spent: number;
  shipping_address: string;
  fullname: string;
  email: string;
  phone_number: string;
  postal_code: string;
  notes?: string;
}

export interface RedeemPointResponse {
  message: string;
  redemption_id: number;
  remaining_points: number;
  status: number;
}

export interface FormSubmissionRequest {
  form_type_id: number;
  form_data: any[];
  project_id: number;
  product_quantity?: number;
}

export interface FormSubmissionResponse {
  message: string;
  status: number;
  data: {
    form_completed: boolean;
    first_submission_bonus: boolean;
  };
}

export interface PointTransactionResponse {
  transaction_id: number;
  user_id: number;
  points: number;
  transaction_type: 'earn' | 'spend' | 'adjust';
  description: string;
  form_id?: number;
  redemption_id?: number;
  created_at: string;
  user: {
    username: string;
  };
}

export interface PaginatedResponse<T> {
  message: string;
  status: number;
  data: T[];
  pagination: {
    total_items: number;
    total_pages: number;
    current_page: number;
    items_per_page: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface ErrorResponse {
  message: string;
  errors?: string[] | Record<string, string | null>;
  error?: string;
} 