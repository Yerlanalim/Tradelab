"use client";

import { Send, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { sendChatMessage } from "@/lib/api/ai";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { supabaseClient } from "@/lib/supabase/client";

const chatHints = [
  "Подскажу, какие данные нужны для отчета.",
  "Могу помочь подобрать HS-код.",
  "Поясню риски и интерпретацию.",
];

type Message = { role: "user" | "assistant"; content: string };
type ChatHistory = {
  id: string;
  title: string | null;
  messages: Message[] | null;
  created_at: string | null;
  last_message_at: string | null;
  mode: string | null;
  flow_state?: Record<string, unknown> | null;
  tool_calls?: Record<string, unknown>[] | null;
  entities?: Record<string, unknown> | null;
  summary?: string | null;
};

const quickQuestions = [
  "Как найти поставщика?",
  "Что такое HS‑код?",
  "Какие данные нужны для отчета?",
];

const disclaimerText =
  "Бот может допускать ошибки. Рекомендуем проверять важную информацию.";

const resolveSection = (pathname: string) => {
  if (pathname.startsWith("/products/company-check")) return "p1";
  if (pathname.startsWith("/products/export-profile")) return "p2";
  if (pathname.startsWith("/products/supplier-search")) return "p3";
  if (pathname.startsWith("/products/market-analysis")) return "p4";
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/zones")) return "zones";
  if (pathname.startsWith("/exhibitions")) return "exhibitions";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "general";
};

const resolveMode = (pathname: string) => {
  if (pathname.startsWith("/products/supplier-search")) return "supplier_search";
  if (
    pathname.startsWith("/products/company-check") ||
    pathname.startsWith("/products/export-profile") ||
    pathname.startsWith("/products/market-analysis") ||
    pathname.startsWith("/reports")
  ) {
    return "report";
  }
  return "assistant";
};

const modeLabel: Record<string, string> = {
  assistant: "Assistant",
  supplier_search: "Supplier Search",
  report: "Report",
};

const toTitle = (text: string) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Новый диалог";
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
};

const formatHistoryLabel = (history: ChatHistory) => {
  if (history.title) return history.title;
  if (!history.created_at) return "Диалог без названия";
  return new Date(history.created_at).toLocaleDateString("ru-RU");
};

const normalizeFlowState = (state?: Record<string, unknown> | null) => {
  if (!state) return null;
  const updatedAt = typeof state.updated_at === "string" ? Date.parse(state.updated_at) : NaN;
  if (!Number.isFinite(updatedAt)) return state;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt > sevenDaysMs ? null : state;
};

type ChatMeta = {
  tool_calls?: Record<string, unknown>[] | null;
  entities?: Record<string, unknown> | null;
  summary?: string | null;
};

const resolveSupplierStatus = (step?: string) => {
  if (step === "paywall") {
    return "Ожидаем подтверждение запуска (списание 500 TC).";
  }
  if (step === "preview") {
    return "Preview: покажем 3–5 примеров перед оплатой.";
  }
  if (step === "analysis") {
    return "Идет полный анализ, результат будет готов через несколько минут.";
  }
  return "Опишите товар и ключевые параметры, чтобы начать поиск.";
};

export function ChatPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const section = useMemo(() => resolveSection(pathname), [pathname]);
  const mode = useMemo(() => resolveMode(pathname), [pathname]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestedChips, setSuggestedChips] = useState<
    { id: string; label: string; action: "redirect" | "insert"; payload: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, isAuthenticated, isLoading: isAuthLoading } = useSupabaseAuth();
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<ChatHistory[]>([]);
  const [isArchiveView, setIsArchiveView] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<Record<string, unknown> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMessages([]);
    setHistoryId(null);
    setHistoryList([]);
    setIsArchiveView(false);
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(null);
    if (!isAuthenticated || isAuthLoading) return;
    let isActive = true;
    const loadHistory = async () => {
      const { data, error } = await supabaseClient
        .from("chat_history")
        .select("id,title,messages,created_at,last_message_at,mode,flow_state,tool_calls,entities,summary")
        .eq("mode", mode)
        .order("last_message_at", { ascending: false })
        .limit(20);
      if (!isActive) return;
      if (error) {
        setErrorMessage("Не удалось загрузить историю чата.");
        return;
      }
      setHistoryList((data as ChatHistory[]) ?? []);
    };
    loadHistory();
    return () => {
      isActive = false;
    };
  }, [mode, section, isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = "tradelab_chat_session";
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setSessionId(existing);
      return;
    }
    const fallbackId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nextId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallbackId;
    window.localStorage.setItem(storageKey, nextId);
    setSessionId(nextId);
  }, []);

  const startNewChat = () => {
    setMessages([]);
    setHistoryId(null);
    setIsArchiveView(false);
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(null);
    setConfirmOpen(false);
    setPendingText(null);
  };

  const openHistory = (history: ChatHistory) => {
    setMessages(history.messages ?? []);
    setHistoryId(history.id);
    setIsArchiveView(true);
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(normalizeFlowState(history.flow_state ?? null));
    setConfirmOpen(false);
    setPendingText(null);
  };

  const persistChat = async (
    nextMessages: Message[],
    nextFlowState: Record<string, unknown> | null,
    meta?: ChatMeta
  ) => {
    if (!user) return;
    const lastMessageAt = new Date().toISOString();
    if (!historyId) {
      const title = toTitle(nextMessages.find((message) => message.role === "user")?.content ?? "");
      const { data } = await supabaseClient
        .from("chat_history")
        .insert({
          user_id: user.id,
          section,
          mode,
          messages: nextMessages,
          title,
          last_message_at: lastMessageAt,
          flow_state: mode === "supplier_search" ? nextFlowState : null,
          tool_calls: meta?.tool_calls ?? null,
          entities: meta?.entities ?? null,
          summary: meta?.summary ?? null,
        })
        .select(
          "id,title,messages,created_at,last_message_at,mode,flow_state,tool_calls,entities,summary"
        )
        .single();
      if (data?.id) {
        setHistoryId(data.id);
        setHistoryList((prev) => [
          data as ChatHistory,
          ...prev.filter((item) => item.id !== data.id),
        ]);
      }
      return;
    }
    await supabaseClient
      .from("chat_history")
      .update({
        messages: nextMessages,
        last_message_at: lastMessageAt,
        ...(mode === "supplier_search" ? { flow_state: nextFlowState } : {}),
        tool_calls: meta?.tool_calls ?? null,
        entities: meta?.entities ?? null,
        summary: meta?.summary ?? null,
      })
      .eq("id", historyId);
    setHistoryList((prev) => {
      const updated = prev.map((item) =>
        item.id === historyId
          ? {
              ...item,
              messages: nextMessages,
              last_message_at: lastMessageAt,
              flow_state: mode === "supplier_search" ? nextFlowState : item.flow_state,
              tool_calls: meta?.tool_calls ?? item.tool_calls ?? null,
              entities: meta?.entities ?? item.entities ?? null,
              summary: meta?.summary ?? item.summary ?? null,
            }
          : item
      );
      const current = updated.find((item) => item.id === historyId);
      if (!current) return updated;
      return [current, ...updated.filter((item) => item.id !== historyId)];
    });
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !isAuthenticated || isAuthLoading || isArchiveView) return;
    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: content.trim() },
    ];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await sendChatMessage({
        pageContext: pathname,
        messages: nextMessages,
        sessionId: sessionId ?? undefined,
        context: {
          flow_state: flowState,
          mode,
        },
      });
      if (response.ok && (response.response || response.message)) {
        const assistantText = response.response ?? response.message ?? "Нет ответа.";
        const meta: ChatMeta = {
          tool_calls: (response.tool_calls as Record<string, unknown>[] | undefined) ?? null,
          entities: (response.entities as Record<string, unknown> | null | undefined) ?? null,
          summary: response.summary ?? null,
        };
        const nextFlowState =
          mode === "supplier_search"
            ? {
                step:
                  (response.ui_hints as { progress_state?: string } | undefined)?.progress_state ??
                  (flowState?.step as string | undefined) ??
                  "discovery",
                updated_at: new Date().toISOString(),
              }
            : null;
        const updatedMessages: Message[] = [
          ...nextMessages,
          { role: "assistant", content: assistantText },
        ];
        setMessages(updatedMessages);
        setFlowState(nextFlowState);
        const redirectHint = (response.ui_hints as { redirect_to?: string } | undefined)?.redirect_to;
        const chips = response.suggested_chips ?? [];
        setSuggestedChips(
          chips.length || !redirectHint
            ? chips
            : [
                {
                  id: "redirect-hint",
                  label: "Открыть поиск поставщиков",
                  action: "redirect",
                  payload: redirectHint,
                },
              ]
        );
        await persistChat(updatedMessages, nextFlowState, meta);
      } else {
        await persistChat(nextMessages, flowState);
        setErrorMessage("Не удалось получить ответ от бота.");
        setSuggestedChips([]);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Сервис чата временно недоступен.");
      setSuggestedChips([]);
      await persistChat(nextMessages, flowState);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const normalized = input.trim().toLowerCase();
    if (mode === "supplier_search" && normalized.includes("запустить полный анализ")) {
      setPendingText(input.trim());
      setConfirmOpen(true);
      return;
    }
    await sendMessage(input.trim());
  };

  const handleQuickInsert = (value: string) => {
    if (isArchiveView) return;
    setInput(value);
    inputRef.current?.focus();
  };

  const handleChipAction = (chip: {
    action: "redirect" | "insert";
    payload: string;
  }) => {
    if (chip.action === "insert") {
      if (
        mode === "supplier_search" &&
        chip.payload.toLowerCase().includes("запустить полный анализ")
      ) {
        setPendingText(chip.payload);
        setConfirmOpen(true);
        return;
      }
      handleQuickInsert(chip.payload);
      return;
    }
    if (chip.action === "redirect") {
      router.push(chip.payload);
    }
  };

  return (
    <aside className="hidden bg-linear-to-br from-[#0f172a] to-[#111c34] lg:flex lg:flex-col border-l border-white/10">
      <div className="p-4 border-b border-white/10 bg-linear-to-br from-emerald-500/20 to-emerald-600/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-linear-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-linear-to-br from-emerald-400 to-emerald-500 rounded-full border-2 border-[#1A2B4A] flex items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <div className="font-bold text-sm text-white">AI-помощник TradeLab</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                Онлайн · {modeLabel[mode] ?? mode}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {historyList.length > 0 && (
          <div className="rounded-2xl ui-glass-panel p-4 text-white/80">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-white/50 mb-3">
              Архив диалогов
              <button
                className="text-emerald-400 hover:text-emerald-300"
                onClick={startNewChat}
              >
                Новый
              </button>
            </div>
            <div className="space-y-2">
              {historyList.map((history) => (
                <button
                  key={history.id}
                  onClick={() => openHistory(history)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-xs transition ${
                    history.id === historyId
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >
                  {formatHistoryLabel(history)}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isAuthenticated && !isAuthLoading && (
          <div className="rounded-2xl ui-glass-panel p-4 text-white/80">
            <div className="text-xs font-semibold uppercase text-white/50 mb-3">
              Требуется вход
            </div>
            <p className="text-sm text-white/70">
              Войдите, чтобы использовать AI‑чат и сохранять историю.
            </p>
            <Link className="mt-3 inline-flex text-emerald-400 underline" href="/login">
              Перейти к входу
            </Link>
          </div>
        )}
        {isArchiveView && (
          <div className="rounded-2xl ui-glass-panel p-3 text-xs text-white/70">
            Вы просматриваете архивный диалог. Чтобы продолжить общение, начните новый.
          </div>
        )}
        {errorMessage && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
            {errorMessage}
          </div>
        )}
        {mode === "supplier_search" && (
          <div className="rounded-2xl ui-glass-panel p-3 text-xs text-white/70">
            <div className="text-[11px] font-semibold uppercase text-white/50 mb-2">
              Supplier Search
            </div>
            <div className="flex items-center justify-between">
              <span>Статус: {String(flowState?.step ?? "ожидание")}</span>
              <span className="text-white/40">Preview → Оплата → Результат</span>
            </div>
            <div className="mt-2 text-white/60">
              {resolveSupplierStatus(String(flowState?.step ?? ""))}
            </div>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="rounded-2xl ui-glass-panel p-4 text-white/80">
            <div className="text-xs font-semibold uppercase text-white/50 mb-3">
              Подсказки
            </div>
            <ul className="space-y-2">
              {chatHints.map((hint) => (
                <li key={hint}>
                  <button
                    className="w-full rounded-xl bg-white/10 px-3 py-2 text-left text-white/80 hover:bg-white/20"
                    onClick={() => handleQuickInsert(hint)}
                  >
                    {hint}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  message.role === "user"
                    ? "ml-auto bg-linear-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    : "ui-glass-panel text-white"
                }`}
              >
                {message.content}
              </div>
            ))}
            {suggestedChips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestedChips.map((chip) => (
                  <Button
                    key={chip.id}
                    variant="secondary"
                    className="text-xs"
                    onClick={() => handleChipAction(chip)}
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-4 pb-3 space-y-2">
        <div className="text-xs text-white/50 font-medium mb-2">
          Популярные вопросы:
        </div>
        {quickQuestions.map((question) => (
          <button
            key={question}
            onClick={() => handleQuickInsert(question)}
            className="w-full text-left text-xs bg-white/10 hover:bg-white/20 backdrop-blur-sm p-3 rounded-xl transition-all border border-white/20 hover:border-emerald-500/50 text-white/80 hover:text-white"
          >
            {question}
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-white/10">
        <div className="mb-2 text-[11px] text-white/50">{disclaimerText}</div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-white placeholder-white/40 transition-all"
            placeholder="Введите сообщение..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={!isAuthenticated || isAuthLoading || isArchiveView}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !isAuthenticated || isAuthLoading || isArchiveView}
            variant="ghost"
            className="px-4 py-3 bg-linear-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300"
          >
            {isLoading ? "..." : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {confirmOpen && pendingText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a] p-6 text-white">
            <div className="text-sm font-semibold">Подтвердить списание</div>
            <p className="mt-2 text-sm text-white/70">
              Полный анализ стоит 500 TC. Подтвердить запуск?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingText(null);
                }}
              >
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  const text = pendingText;
                  setConfirmOpen(false);
                  setPendingText(null);
                  await sendMessage(text);
                }}
              >
                Подтвердить
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
