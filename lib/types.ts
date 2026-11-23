import type { PaymentMethod } from "@/lib/orders/draft";
import type { RiskLevel } from "@/lib/reputation";

export type Platform = "facebook" | "instagram";
export type ConversationStatus = "new" | "pending_review" | "confirmed" | "flagged";
export type OrderStatus = "draft" | "confirmed" | "shipped" | "delivered" | "returned";
export type PaymentStatus = "unpaid" | "pending_verification" | "verified";

export interface Merchant {
  id: string;
  business_name: string;
  phone: string | null;
  courier_pin_set: boolean;
  meta_page_id: string | null;
  meta_ig_account_id: string | null;
  delivery_rates_json: Record<string, number>;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  sku: string | null;
  price_lyd: number;
  stock_quantity: number;
  is_active: boolean;
}

export interface Conversation {
  id: string;
  merchant_id: string;
  platform: Platform;
  external_sender_id: string;
  customer_display_name: string | null;
  status: ConversationStatus;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  merchant_id: string;
  sender_type: "customer" | "merchant" | "system";
  content: string | null;
  attachment_url: string | null;
  attachment_path: string | null;
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  name?: string;
  sku?: string | null;
  quantity: number;
  unit_price_lyd?: number;
  line_total_lyd?: number;
}

export interface Order {
  id: string;
  merchant_id: string;
  conversation_id: string | null;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  city: string | null;
  address_details: string | null;
  items_json: OrderItem[];
  subtotal_lyd: number;
  shipping_fee_lyd: number;
  total_lyd: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  qr_token: string;
  tracking_code: string | null;
  risk_level: RiskLevel;
  risk_delivered: number;
  risk_returned: number;
  missing_fields: string[];
  ai_confidence: number | null;
  suggested_reply: string | null;
  locked_fields: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}
