// src/shared/types.ts

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'completed' | 'cancelled';

export type ReminderStatus =
  | 'scheduled'
  | 'sending'
  | 'awaiting_ack'
  | 'acknowledged'
  | 'rescheduled'
  | 'cancelled'
  | 'paused'
  | 'failed';

export interface AppUser {
  id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  display_name: string | null;
  timezone: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_at: string | null; // ISO 8601 UTC
  priority: TaskPriority;
  status: TaskStatus;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  task_id: string;
  scheduled_at: string; // ISO 8601 UTC
  status: ReminderStatus;
  follow_up_count: number;
  max_follow_ups: number;
  last_sent_at: string | null;
  next_follow_up_at: string | null;
  acknowledged_at: string | null;
  lease_until: string | null;
  lease_token: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderEvent {
  id: string;
  user_id: string;
  reminder_id: string | null;
  task_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ClaimedReminder {
  reminder_id: string;
  user_id: string;
  task_id: string;
  task_title: string;
  task_due_at: string | null;
  telegram_chat_id: number;
  user_timezone: string;
  scheduled_at: string;
  status: ReminderStatus;
  follow_up_count: number;
  max_follow_ups: number;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramWebhookUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramForceReply {
  force_reply: true;
  input_field_placeholder?: string;
  selective?: boolean;
}

export interface SendTextInput {
  chat_id: number;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: TelegramInlineKeyboardMarkup | TelegramForceReply;
}

export interface SendTextResult {
  ok: boolean;
  message_id?: number;
  error?: string;
}

export interface EditMessageInput {
  chat_id: number;
  message_id: number;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface NotificationProvider {
  sendText(input: SendTextInput): Promise<SendTextResult>;
  answerCallbackQuery(callback_query_id: string, text?: string): Promise<boolean>;
  deleteMessage?(chat_id: number, message_id: number): Promise<boolean>;
  editMessageText?(input: EditMessageInput): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}
