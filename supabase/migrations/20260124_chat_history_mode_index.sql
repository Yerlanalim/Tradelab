create index if not exists chat_history_user_mode_last_message_idx
  on public.chat_history (user_id, mode, last_message_at desc);
