"use client";

import { Send, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { sendChatMessage } from "@/lib/api/ai";
import { useSupabaseAuth } from "@/lib/auth/supabaseAuth";
import { supabaseClient } from "@/lib/supabase/client";
import { fetchTcBalance } from "@/lib/api/tc";
import { TC_PRICING, TC_SPEND_PRIORITY } from "@/lib/config/pricing";
import { dispatchTcBalanceUpdate } from "@/lib/events/tcBalance";

const chatHints: Record<string, string[]> = {
  assistant: [
    "Подскажу, какие данные нужны для отчета.",
    "Могу помочь подобрать HS-код.",
    "Поясню риски и интерпретацию.",
  ],
  supplier_search: [
    "Опишите товар, спецификации и MOQ.",
    "Укажите бюджет или диапазон цены за штуку.",
    "Уточните регион/город и сроки поставки.",
  ],
  report: [
    "Объясню разделы отчета и показатели.",
    "Подскажу, какие данные нужны для формы.",
    "Помогу интерпретировать риск‑оценку.",
  ],
};

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

const quickQuestions: Record<string, string[]> = {
  assistant: ["Как найти поставщика?", "Что такое HS‑код?", "Какие данные нужны для отчета?"],
  supplier_search: [
    "Нужен поиск поставщиков по моему товару",
    "Хочу добавить MOQ и бюджет",
    "Укажу город в Китае и сроки поставки",
  ],
  report: [
    "Что означает этот раздел отчета?",
    "Как интерпретировать риск‑оценку?",
    "Что делать дальше после отчета?",
  ],
};

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

const trimMessages = (items: Message[], limit = 40) =>
  items.length > limit ? items.slice(items.length - limit) : items;

type ChatMeta = {
  tool_calls?: Record<string, unknown>[] | null;
  entities?: Record<string, unknown> | null;
  summary?: string | null;
};
type SupplierResultItem = {
  name: string;
  platform?: string;
  price_range?: string;
  moq?: string;
  location?: string;
  link?: string;
  model?: string;
  brand?: string;
  supplier_type?: string;
  years_on_platform?: string;
  verification_badges?: string[];
  risk_level?: "low" | "medium" | "high";
  risk_factors?: string[];
};

type SupplierResultState = {
  scope: "preview" | "full";
  items: SupplierResultItem[];
  bench?: {
    price_range?: string;
    moq_range?: string;
  } | null;
  limitations?: string | null;
  foundCount?: number | null;
  totalFound?: number | null;
  dedupedCount?: number | null;
  finalCount?: number | null;
  sourceCounts?: { alibaba: number; mic: number } | null;
  reportId?: string | null;
  previewCount?: number | null;
  summary?: string | null;
};

type ChipAction = "redirect" | "insert" | "confirm";

const resolveSupplierStatus = (step?: string) => {
  if (step === "paywall") {
    return `Ожидаем подтверждение запуска (списание ${TC_PRICING.p3FullAnalysis} TC, возврат при ошибке).`;
  }
  if (step === "preview") {
    return "Preview: покажем 3–5 примеров перед оплатой.";
  }
  if (step === "shortlist") {
    return "Проверьте выборку и подтвердите фильтры перед оплатой.";
  }
  if (step === "analysis") {
    return "Идет полный анализ, результат будет готов через несколько минут.";
  }
  if (step === "confirm") {
    return "Требуется подтверждение списания перед запуском анализа.";
  }
  return "Опишите товар и ключевые параметры, чтобы начать поиск.";
};

type ChatPanelProps = {
  variant?: "sidebar" | "center";
};

export function ChatPanel({ variant = "sidebar" }: ChatPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const section = useMemo(() => resolveSection(pathname), [pathname]);
  const mode = useMemo(() => resolveMode(pathname), [pathname]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestedChips, setSuggestedChips] = useState<
    { id: string; label: string; action: ChipAction; payload: string }[]
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
  const [pendingConfirm, setPendingConfirm] = useState<{
    actionId: string;
    message: string;
    requiresPayment: boolean;
    amount?: number;
    title?: string;
    description?: string;
    rfqSuppliers?: string[];
  } | null>(null);
  const [supplierResult, setSupplierResult] = useState<SupplierResultState | null>(null);
  const [confirmBalance, setConfirmBalance] = useState<number | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  // --- НОВОЕ: Состояние для текста загрузки ---
  const [loadingText, setLoadingText] = useState("Обрабатываю запрос...");

  // --- НОВОЕ: Эффект таймера ---
  useEffect(() => {
    if (!isLoading) return;

    const isSupplier = mode === "supplier_search";

    // Начальный текст
    setLoadingText(isSupplier ? "Запускаю поиск..." : "Думаю...");

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isSupplier) {
      // Тайминги для поиска поставщиков (более длительный процесс)
      timers.push(setTimeout(() => setLoadingText("Опрашиваю платформы (Alibaba, MIC)..."), 7500));
      timers.push(setTimeout(() => setLoadingText("Фильтрую результаты и проверяю ссылки..."), 12500));
      timers.push(setTimeout(() => setLoadingText("Анализирую цены и MOQ..."), 15000));
      timers.push(setTimeout(() => setLoadingText("Формирую структуру отчета..."), 22000));
      timers.push(setTimeout(() => setLoadingText("Почти готово, завершаю форматирование..."), 30000));
    } else {
      // Тайминги для обычного чата
      timers.push(setTimeout(() => setLoadingText("Анализирую контекст..."), 2000));
      timers.push(setTimeout(() => setLoadingText("Генерирую ответ..."), 5000));
    }

    return () => timers.forEach(clearTimeout);
  }, [isLoading, mode]);
  const [intake, setIntake] = useState({
    product: "",
    specs: "",
    moq: "",
    budget: "",
    region: "",
    leadTime: "",
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isCentered = variant === "center";
  const headerTitle =
    mode === "supplier_search" && isCentered ? "Поиск поставщиков" : "AI-помощник TradeLab";
  const headerSubtitle =
    mode === "supplier_search" && isCentered
      ? "Preview → подтверждение → отчет"
      : `Онлайн · ${modeLabel[mode] ?? mode}`;
  const [showHistory, setShowHistory] = useState(!isCentered);
  const supplierStep = String(flowState?.step ?? "discovery");
  const supplierProgressIndex = [
    "discovery",
    "preview",
    "shortlist",
    "confirm",
    "paywall",
    "analysis",
    "done",
  ].indexOf(supplierStep);
  const lastAssistantIndex = useMemo(
    () => [...messages].reverse().findIndex((message) => message.role === "assistant"),
    [messages]
  );
  const lastAssistantPosition =
    lastAssistantIndex === -1 ? -1 : messages.length - 1 - lastAssistantIndex;

  const supplierIntakeTemplate =
    "Товар: \nМатериалы/спецификации: \nMOQ: \nБюджет/цена за штуку: \nРегион/город в Китае: \nСроки поставки: ";

  const getExportAuth = async () => {
    const { data: refreshed, error } = await supabaseClient.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return {
        accessToken: refreshed.session.access_token,
        refreshToken: refreshed.session.refresh_token ?? null,
      };
    }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    return {
      accessToken: sessionData.session?.access_token ?? null,
      refreshToken: sessionData.session?.refresh_token ?? null,
    };
  };

  const buildIntakeMessage = () =>
    [
      `Товар: ${intake.product || "—"}`,
      `Материалы/спецификации: ${intake.specs || "—"}`,
      `MOQ: ${intake.moq || "—"}`,
      `Бюджет/цена за штуку (в USD): ${intake.budget || "—"}`,
      `Регион/город в Китае: ${intake.region || "—"}`,
      `Сроки поставки: ${intake.leadTime || "—"}`,
    ].join("\n");

  const openSignedDownload = async (bucket: "exports" | "reports", path?: string | null) => {
    if (!path) return;
    const { data } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    if (!confirmOpen || !pendingConfirm?.requiresPayment) {
      setConfirmBalance(null);
      return;
    }
    let isActive = true;
    setIsBalanceLoading(true);
    fetchTcBalance()
      .then((balance) => {
        if (isActive) setConfirmBalance(balance.balance_total);
      })
      .catch(() => {
        if (isActive) setConfirmBalance(null);
      })
      .finally(() => {
        if (isActive) setIsBalanceLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [confirmOpen, pendingConfirm?.requiresPayment]);

  // --- SESSION CONTROLS ---

  const startNewChat = () => {
    setMessages([]);
    setHistoryId(null);
    setIsArchiveView(false);
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(null);
    setConfirmOpen(false);
    setPendingConfirm(null);
    setSupplierResult(null);
  };

  const openHistory = (history: ChatHistory) => {
    setMessages(history.messages ?? []);
    setHistoryId(history.id);
    setIsArchiveView(false); // Changed to false to allow continuation
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(normalizeFlowState(history.flow_state ?? null));
    setConfirmOpen(false);
    setPendingConfirm(null);

    // Restore supplier result from entities
    const ent = history.entities as any;
    if (ent?.result_items && Array.isArray(ent.result_items) && ent.result_items.length > 0) {
      setSupplierResult({
        scope: ent.result_scope || "preview",
        items: ent.result_items,
        bench: ent.bench ?? null,
        limitations: ent.limitations ?? null,
        foundCount: ent.found_count ?? null,
        totalFound: ent.total_found ?? null,
        dedupedCount: ent.deduped_count ?? null,
        finalCount: ent.final_count ?? null,
        sourceCounts: ent.source_counts ?? null,
        reportId: ent.report_id ?? null,
        previewCount: ent.preview_count ?? null,
        summary: history.summary ?? ent.summary ?? null,
      });
    } else {
      setSupplierResult(null);
    }
  };

  const persistChat = async (
    nextMessages: Message[],
    nextFlowState: Record<string, unknown> | null,
    meta?: ChatMeta
  ) => {
    if (!user) return;
    const trimmedMessages = trimMessages(nextMessages);
    const lastMessageAt = new Date().toISOString();
    
    // Use functional update to avoid stale closures
    let finalizedEntities: any = null;

    if (!historyId) {
      finalizedEntities = meta?.entities ?? null;
      const title = toTitle(
        trimmedMessages.find((message) => message.role === "user")?.content ?? ""
      );
      const { data } = await supabaseClient
        .from("chat_history")
        .insert({
          user_id: user.id,
          section,
          mode,
          messages: trimmedMessages,
          title,
          last_message_at: lastMessageAt,
          flow_state: mode === "supplier_search" ? nextFlowState : null,
          tool_calls: meta?.tool_calls ?? null,
          entities: finalizedEntities,
          summary: meta?.summary ?? null,
        })
        .select(
          "id,title,messages,created_at,last_message_at,mode,flow_state,tool_calls,entities,summary"
        )
        .single();
      if (data?.id) {
        setHistoryId(data.id);
        const nextHistory = data as ChatHistory;
        setHistoryList((prev) => [
          nextHistory,
          ...prev.filter((item) => item.id !== nextHistory.id),
        ]);
      }
      return;
    }

    // Update existing history
    setHistoryList((prev) => {
      const currentItem = prev.find((h) => h.id === historyId);
      finalizedEntities = meta?.entities 
        ? { ...(currentItem?.entities as Record<string, unknown> ?? {}), ...meta.entities }
        : (currentItem?.entities ?? null);

      const updated = prev.map((item) =>
        item.id === historyId
          ? {
              ...item,
              messages: trimmedMessages,
              last_message_at: lastMessageAt,
              flow_state: mode === "supplier_search" ? nextFlowState : item.flow_state,
              tool_calls: meta?.tool_calls !== undefined ? meta.tool_calls : item.tool_calls,
              entities: finalizedEntities,
              summary: meta?.summary !== undefined ? meta.summary : item.summary,
            }
          : item
      );

      // Async update to DB
      const updatePayload: any = {
        messages: trimmedMessages,
        last_message_at: lastMessageAt,
      };
      if (mode === "supplier_search") updatePayload.flow_state = nextFlowState;
      if (meta?.tool_calls !== undefined) updatePayload.tool_calls = meta.tool_calls;
      if (meta?.entities !== undefined) updatePayload.entities = finalizedEntities;
      if (meta?.summary !== undefined) updatePayload.summary = meta.summary;

      supabaseClient
        .from("chat_history")
        .update(updatePayload)
        .eq("id", historyId)
        .then(({ error }) => {
          if (error) console.error("[PERSIST ERROR]", error);
        });

      const current = updated.find((item) => item.id === historyId);
      if (!current) return updated;
      return [current, ...updated.filter((item) => item.id !== historyId)];
    });
  };

  useEffect(() => {
    setMessages([]);
    setHistoryId(null);
    setHistoryList([]);
    setIsArchiveView(false);
    setErrorMessage(null);
    setSuggestedChips([]);
    setFlowState(null);
    setSupplierResult(null);

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
      const list = (data as ChatHistory[]) ?? [];
      setHistoryList(list);

      // --- AUTO-LOAD LATEST SESSION ---
      if (list.length > 0 && !historyId) {
        openHistory(list[0]);
      }
    };

    loadHistory();
    return () => {
      isActive = false;
    };
  }, [mode, section, isAuthenticated, isAuthLoading]);

  useEffect(() => {
    setShowHistory(!isCentered);
  }, [isCentered, mode]);

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

  const sendMessage = async (
    content: string,
    options?: {
      confirmActionId?: string;
      rfqSuppliers?: string[];
    }
  ) => {
    if (!content.trim() || !isAuthenticated || isAuthLoading || isArchiveView) return;
    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: content.trim() },
    ];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setErrorMessage(null);
    setSupplierResult(null);
    try {
      const response = await sendChatMessage({
        pageContext: pathname,
        messages: trimMessages(nextMessages, 16),
        sessionId: sessionId ?? undefined,
        context: {
          flow_state: flowState,
          mode,
          ...(options?.confirmActionId ? { confirm: { action_id: options.confirmActionId } } : {}),
          ...(options?.rfqSuppliers?.length
            ? { rfq: { suppliers: options.rfqSuppliers } }
            : {}),
        },
      });
      if (response.ok && (response.response || response.message)) {
        const assistantText = response.response ?? response.message ?? "Нет ответа.";
        const uiHints = response.ui_hints as any;
        const meta: ChatMeta = {};
        if (response.tool_calls) meta.tool_calls = response.tool_calls as Record<string, unknown>[];
        if (response.entities) meta.entities = response.entities as Record<string, unknown>;
        if (response.summary) meta.summary = response.summary;
        const resolvedQuery =
          (response.entities as { query?: string } | null | undefined)?.query ??
          (flowState?.query as string | undefined) ??
          content.trim();
        const resolvedSearchId =
          (response.entities as { search_id?: string } | null | undefined)?.search_id ??
          (flowState?.search_id as string | undefined) ??
          null;
        const refineCount =
          (response.entities as { refine_count?: number } | null | undefined)?.refine_count ??
          (flowState?.refine_count as number | undefined) ??
          0;
        const nextFlowState =
          mode === "supplier_search"
            ? {
                step:
                  uiHints?.progress_state ??
                  (flowState?.step as string | undefined) ??
                  "discovery",
                query: resolvedQuery,
                refine_count: refineCount,
                search_id: resolvedSearchId,
                normalized_search:
                  (response.entities as { normalized_search?: unknown } | null | undefined)
                    ?.normalized_search ?? flowState?.normalized_search ?? null,
                updated_at: new Date().toISOString(),
              }
            : null;
        const progressState = uiHints?.progress_state;
        if (mode === "supplier_search" && progressState === "analysis") {
          dispatchTcBalanceUpdate();
        }
        const updatedMessages: Message[] = [
          ...nextMessages,
          { role: "assistant", content: assistantText },
        ];
        setMessages(updatedMessages);
        setFlowState(nextFlowState);

        if (uiHints?.requires_confirm && uiHints.confirm_action_id) {
          handleChipAction({
            label: "Подтвердить",
            action: "confirm",
            payload: uiHints.confirm_action_id,
          });
        }

        const redirectHint = uiHints?.redirect_to;
        const chips = (response.suggested_chips as any[]) ?? [];
        const supplierEntities = response.entities as
          | {
              result_scope?: "preview" | "full";
              result_items?: SupplierResultItem[];
              bench?: SupplierResultState["bench"];
              limitations?: string | null;
              found_count?: number;
              total_found?: number;
              deduped_count?: number;
              final_count?: number;
              source_counts?: { alibaba: number; mic: number };
              report_id?: string | null;
              preview_count?: number | null;
            }
          | null
          | undefined;
        if (
          mode === "supplier_search" &&
          supplierEntities?.result_scope &&
          Array.isArray(supplierEntities.result_items) &&
          supplierEntities.result_items.length > 0
        ) {
          setSupplierResult({
            scope: supplierEntities.result_scope,
            items: supplierEntities.result_items,
            bench: supplierEntities.bench ?? null,
            limitations: supplierEntities.limitations ?? null,
            foundCount: supplierEntities.found_count ?? null,
            totalFound: supplierEntities.total_found ?? null,
            dedupedCount: supplierEntities.deduped_count ?? null,
            finalCount: supplierEntities.final_count ?? null,
            sourceCounts: supplierEntities.source_counts ?? null,
            reportId: supplierEntities.report_id ?? null,
            previewCount: supplierEntities.preview_count ?? null,
            summary: response.summary ?? (response.entities as any)?.summary ?? null,
          });
        }
        setSuggestedChips(
          chips.length || !redirectHint
            ? chips
            : [
                {
                  id: "redirect-hint",
                  label: "Открыть поиск поставщиков",
                  action: "redirect",
                  payload: redirectHint ?? "",
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
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Session expired") ||
        message.includes("not authenticated") ||
        message.includes("Invalid JWT")
      ) {
        setErrorMessage("Сессия истекла. Пожалуйста, войдите заново.");
      } else {
        setErrorMessage("Сервис чата временно недоступен.");
      }
      setSuggestedChips([]);
      await persistChat(nextMessages, flowState);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    await sendMessage(input.trim());
  };

  const handleQuickInsert = (value: string) => {
    if (isArchiveView) return;
    setInput(value);
    inputRef.current?.focus();
  };

  const handleChipAction = (chip: {
    id?: string;
    label?: string;
    action: ChipAction;
    payload: string;
  }) => {
    if (chip.action === "insert") {
      handleQuickInsert(chip.payload);
      return;
    }
    if (chip.action === "confirm") {
      const requiresPayment = chip.payload === "p3_full_v1" || chip.payload === "p3_full_analysis";
      setPendingConfirm({
        actionId: chip.payload,
        message: requiresPayment
          ? "Подтверждаю запуск полного анализа."
          : "Подтверждаю фильтры для полного анализа.",
        requiresPayment,
        amount: requiresPayment ? TC_PRICING.p3FullAnalysis : undefined,
        title: requiresPayment ? "Подтвердить списание" : "Подтвердить фильтры",
        description: requiresPayment
          ? `Полный анализ стоит ${TC_PRICING.p3FullAnalysis} TC. Подтвердить запуск?`
          : "Подтвердить фильтры? Далее будет подтверждение оплаты.",
      });
      setConfirmOpen(true);
      return;
    }
    if (chip.action === "redirect") {
      router.push(chip.payload);
    }
  };

  const containerClassName =
    variant === "center"
      ? "mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-linear-to-br from-[#0f172a] to-[#111c34] shadow-xl shadow-emerald-500/10"
      : "flex flex-col border-l border-white/10 bg-linear-to-br from-[#0f172a] to-[#111c34]";

  return (
    <aside className={containerClassName}>
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
              <div className="font-bold text-sm text-white">{headerTitle}</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                {headerSubtitle}
              </div>
            </div>
          </div>
          {historyList.length > 0 && (
            <button
              className="text-xs text-emerald-200 hover:text-emerald-100"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              {showHistory ? "Скрыть архив" : "Показать архив"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {mode === "supplier_search" && isCentered && (
          <div className="rounded-2xl ui-glass-panel p-4 text-xs text-white/70">
            <div className="text-[11px] font-semibold uppercase text-white/50">
              Прогресс поиска
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-7">
              {[
                { id: "discovery", label: "Параметры" },
                { id: "preview", label: "Поиск" },
                { id: "shortlist", label: "Уточнение" },
                { id: "confirm", label: "Подтвердить" },
                { id: "paywall", label: "Оплата" },
                { id: "analysis", label: "Анализ" },
                { id: "done", label: "Отчёт" },
              ].map((item, index) => {
                const isActive = supplierProgressIndex >= index;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl px-3 py-2 text-center text-xs ${
                      isActive ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-white/50"
                    }`}
                  >
                    {item.label}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-[11px] text-white/50">
              Подсказка: укажите товар, спецификации, MOQ, бюджет и регион.
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                className="text-[11px]"
                onClick={() => handleQuickInsert(supplierIntakeTemplate)}
              >
                Заполнить параметры
              </Button>
            </div>
          </div>
        )}
        {mode === "supplier_search" && isCentered && (
          <div className="rounded-2xl ui-glass-panel p-4 text-xs text-white/70">
            <div className="text-[11px] font-semibold uppercase text-white/50">
              Быстрый ввод параметров
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  key: "product",
                  label: "Товар",
                  placeholder: "Керамическая плитка",
                },
                {
                  key: "specs",
                  label: "Материалы/спецификации",
                  placeholder: "Размер 60×60 см",
                },
                {
                  key: "moq",
                  label: "MOQ",
                  placeholder: "От 1500 шт",
                },
                {
                  key: "budget",
                  label: "Бюджет/цена за штуку (в USD)",
                  placeholder: "$15–25",
                },
                {
                  key: "region",
                  label: "Регион/город",
                  placeholder: "Китай / не важно",
                },
                {
                  key: "leadTime",
                  label: "Сроки поставки",
                  placeholder: "До 40 дней",
                },
              ].map((field) => (
                <label key={field.key} className="space-y-1 text-[11px] text-white/50">
                  <span className="uppercase">{field.label}</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder={field.placeholder}
                    value={intake[field.key as keyof typeof intake]}
                    onChange={(event) =>
                      setIntake((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="text-[11px]"
                onClick={() => handleQuickInsert(buildIntakeMessage())}
              >
                Сформировать запрос
              </Button>
              <Button
                className="text-[11px]"
                onClick={() => sendMessage(buildIntakeMessage())}
                disabled={!isAuthenticated || isAuthLoading || isArchiveView}
              >
                Отправить запрос
              </Button>
            </div>
          </div>
        )}
        {historyList.length > 0 && showHistory && (
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
              <span className="text-white/40">Preview → Фильтры → Оплата</span>
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
              {(chatHints[mode] ?? chatHints.assistant).map((hint) => (
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
              (() => {
                const isPreviewMessage =
                  message.role === "assistant" &&
                  (message.content.includes("Вот preview") ||
                    message.content.includes("Результат полного анализа") ||
                    message.content.includes("Отчёт по поиску") ||
                    message.content.includes("Полный отчет") ||
                    message.content.includes("📜"));
                
                if (
                  supplierResult?.items?.length &&
                  index === lastAssistantPosition &&
                  isPreviewMessage
                ) {
                  return null;
                }
                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "ml-auto bg-linear-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        : "ui-glass-panel text-white"
                    }`}
                  >
                    <div className="chat-markdown prose-emerald">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })()
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
            {mode === "supplier_search" && supplierResult?.items?.length ? (
              <div className="rounded-2xl ui-glass-panel p-3 text-xs text-white/70">
                <div className="text-[11px] font-semibold uppercase text-white/50 mb-2">
                  {supplierResult.scope === "preview" ? "Preview результаты" : "Результаты анализа"}
                </div>
                {supplierResult.summary && (
                  <div className="mb-4 chat-markdown prose-emerald text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {supplierResult.summary}
                    </ReactMarkdown>
                  </div>
                )}
                {(supplierResult.foundCount ||
                  supplierResult.bench?.price_range ||
                  supplierResult.bench?.moq_range) && (
                  <div className="mb-3 text-white/60">
                    {supplierResult.totalFound
                      ? `Проанализировано: ${supplierResult.totalFound}`
                      : supplierResult.foundCount
                      ? `Найдено: ${supplierResult.foundCount}`
                      : null}
                    {(supplierResult.totalFound ||
                      supplierResult.foundCount) &&
                    supplierResult.dedupedCount
                      ? " · "
                      : null}
                    {supplierResult.dedupedCount
                      ? `После дедупа: ${supplierResult.dedupedCount}`
                      : null}
                    {supplierResult.dedupedCount && supplierResult.finalCount ? " · " : null}
                    {supplierResult.finalCount
                      ? `В отчёте: ${supplierResult.finalCount}`
                      : null}
                    {supplierResult.previewCount &&
                    (supplierResult.totalFound ||
                      supplierResult.foundCount ||
                      supplierResult.dedupedCount ||
                      supplierResult.finalCount)
                      ? " · "
                      : null}
                    {supplierResult.previewCount ? `В preview: ${supplierResult.previewCount}` : null}
                    {(supplierResult.totalFound ||
                      supplierResult.foundCount ||
                      supplierResult.dedupedCount ||
                      supplierResult.finalCount) &&
                    (supplierResult.bench?.price_range || supplierResult.bench?.moq_range)
                      ? " · "
                      : null}
                    {supplierResult.bench?.price_range
                      ? `Бенчмарк цены: ${supplierResult.bench.price_range}`
                      : null}
                    {supplierResult.bench?.price_range && supplierResult.bench?.moq_range
                      ? " · "
                      : null}
                    {supplierResult.bench?.moq_range
                      ? `Бенчмарк MOQ: ${supplierResult.bench.moq_range}`
                      : null}
                    {supplierResult.sourceCounts &&
                    (supplierResult.totalFound ||
                      supplierResult.foundCount ||
                      supplierResult.bench?.price_range ||
                      supplierResult.bench?.moq_range)
                      ? " · "
                      : null}
                    {supplierResult.sourceCounts
                      ? `Alibaba: ${supplierResult.sourceCounts.alibaba}, Made-in-China: ${supplierResult.sourceCounts.mic}`
                      : null}
                  </div>
                )}
                {supplierResult.scope === "preview" &&
                  supplierResult.sourceCounts &&
                  (supplierResult.sourceCounts.alibaba === 0 ||
                    supplierResult.sourceCounts.mic === 0) && (
                    <div className="mb-3 text-white/50">
                      Источников с одной из площадок мало — preview может быть неполным.
                    </div>
                  )}
                {supplierResult.scope === "preview" && (
                  <div className="mb-3 text-white/50">
                    Дальше: подтвердите фильтры → подтвердите списание → получите полный отчёт.
                  </div>
                )}
                <Table
                  headers={["Поставщик", "Площадка", "Цена", "MOQ", "Локация", "Риск"]}
                  rows={supplierResult.items.map((item) => [
                    item.link ? (
                      <a
                        key={item.link}
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    ),
                    item.platform ?? "—",
                    item.price_range ?? "—",
                    item.moq ?? "—",
                    item.location ?? "—",
                    item.risk_level === "high"
                      ? "Высокий"
                      : item.risk_level === "medium"
                      ? "Средний"
                      : item.risk_level === "low"
                      ? "Низкий"
                      : "—",
                  ])}
                />
                {supplierResult.limitations && (
                  <div className="mt-3 text-white/50">
                    Ограничение: {supplierResult.limitations}
                  </div>
                )}
                {supplierResult.scope === "full" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={async () => {
                        if (!supplierResult.reportId) return;
                        setErrorMessage(null);
                        const auth = await getExportAuth();
                        if (!auth.accessToken) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const response = await fetch("/api/reports/export", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${auth.accessToken}`,
                          },
                          body: JSON.stringify({
                            reportId: supplierResult.reportId,
                            accessToken: auth.accessToken,
                            refreshToken: auth.refreshToken,
                          }),
                        });
                        if (response.status === 401) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const data = await response.json().catch(() => null);
                        await openSignedDownload("exports", data?.exportPath ?? null);
                      }}
                    >
                      Экспорт CSV
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={async () => {
                        if (!supplierResult.reportId) return;
                        setErrorMessage(null);
                        const auth = await getExportAuth();
                        if (!auth.accessToken) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const response = await fetch("/api/reports/export-pdf", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${auth.accessToken}`,
                          },
                          body: JSON.stringify({
                            reportId: supplierResult.reportId,
                            accessToken: auth.accessToken,
                            refreshToken: auth.refreshToken,
                          }),
                        });
                        if (response.status === 401) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const data = await response.json().catch(() => null);
                        await openSignedDownload("reports", data?.pdfPath ?? null);
                      }}
                    >
                      Экспорт PDF
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={async () => {
                        if (!supplierResult.reportId) return;
                        setErrorMessage(null);
                        const auth = await getExportAuth();
                        if (!auth.accessToken) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const response = await fetch("/api/reports/export-xlsx", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${auth.accessToken}`,
                          },
                          body: JSON.stringify({
                            reportId: supplierResult.reportId,
                            accessToken: auth.accessToken,
                            refreshToken: auth.refreshToken,
                          }),
                        });
                        if (response.status === 401) {
                          setErrorMessage("Сессия истекла. Войдите заново и повторите экспорт.");
                          return;
                        }
                        const data = await response.json().catch(() => null);
                        await openSignedDownload("exports", data?.exportPath ?? null);
                      }}
                    >
                      Экспорт Excel
                    </Button>
                  </div>
                )}
                {supplierResult.scope === "full" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="text-[11px]"
                      onClick={() => {
                        const topSuppliers = supplierResult.items
                          .slice(0, 3)
                          .map((item) => item.name)
                          .filter(Boolean);
                        setPendingConfirm({
                          actionId: "p3_rfq_v1",
                          message: "Подтверждаю формирование RFQ для топ-3 поставщиков.",
                          requiresPayment: true,
                          amount: TC_PRICING.p3Rfq,
                          title: "Подтвердить списание",
                          description: `RFQ стоит ${TC_PRICING.p3Rfq} TC. Подтвердить запуск?`,
                          rfqSuppliers: topSuppliers,
                        });
                        setConfirmOpen(true);
                      }}
                      disabled={supplierResult.items.length < 1}
                    >
                      Сформировать RFQ (100 TC)
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={() =>
                        handleQuickInsert(`Определи HS-код для товара: ${flowState?.query ?? ""}`)
                      }
                    >
                      Определить HS‑код
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={() =>
                        handleQuickInsert(
                          `Рассчитать landed cost для товара: ${flowState?.query ?? ""}`
                        )
                      }
                    >
                      Рассчитать landed cost
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={() => router.push("/products/market-analysis")}
                    >
                      Анализ рынка поставок
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-[11px]"
                      onClick={startNewChat}
                    >
                      Новый поиск
                    </Button>
                  </div>
                )}
                {supplierResult.scope === "full" && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {supplierResult.items.slice(0, 10).map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-white">{item.name}</div>
                          <div className="text-[11px] text-white/50">
                            {item.risk_level === "high"
                              ? "🔴 Высокий риск"
                              : item.risk_level === "medium"
                              ? "🟡 Средний риск"
                              : item.risk_level === "low"
                              ? "🟢 Низкий риск"
                              : "—"}
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-white/60">
                          <div>Площадка: {item.platform ?? "—"}</div>
                          <div>Цена: {item.price_range ?? "—"}</div>
                          <div>MOQ: {item.moq ?? "—"}</div>
                          <div>Локация: {item.location ?? "—"}</div>
                          {item.model && <div>Модель: {item.model}</div>}
                          {item.brand && <div>Бренд: {item.brand}</div>}
                          {item.supplier_type && <div>Тип компании: {item.supplier_type}</div>}
                          {item.years_on_platform && (
                            <div>Стаж на площадке: {item.years_on_platform}</div>
                          )}
                          {item.verification_badges && item.verification_badges.length > 0 && (
                            <div>Бейджи: {item.verification_badges.join(", ")}</div>
                          )}
                          {item.risk_factors && item.risk_factors.length > 0 && (
                            <div>Факторы: {item.risk_factors.join(", ")}</div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="text-[11px]"
                            onClick={() => handleQuickInsert(`Проверить компанию ${item.name}.`)}
                          >
                            Проверить компанию
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-[11px]"
                            onClick={() =>
                              handleQuickInsert(`Экспортный профиль для ${item.name}.`)
                            }
                          >
                            Экспортный профиль
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-[11px]"
                            onClick={() =>
                              handleQuickInsert(
                                `Проверить компанию и экспортный профиль для ${item.name}.`
                              )
                            }
                          >
                            Компания + экспорт
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {!isCentered && (
        <div className="px-4 pb-3 space-y-2">
          <div className="text-xs text-white/50 font-medium mb-2">
            Популярные вопросы:
          </div>
          {(quickQuestions[mode] ?? quickQuestions.assistant).map((question) => (
            <button
              key={question}
              onClick={() => handleQuickInsert(question)}
              className="w-full text-left text-xs bg-white/10 hover:bg-white/20 backdrop-blur-sm p-3 rounded-xl transition-all border border-white/20 hover:border-emerald-500/50 text-white/80 hover:text-white"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 border-t border-white/10">
        {/* --- НОВОЕ: Индикатор загрузки --- */}
        {isLoading && (
          <div className="mb-3 flex items-center gap-2 text-xs text-emerald-400 animate-pulse">
            <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
            <span>{loadingText}</span>
          </div>
        )}

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
      {confirmOpen && pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a] p-6 text-white">
            <div className="text-sm font-semibold">
              {pendingConfirm.title ??
                (pendingConfirm.requiresPayment ? "Подтвердить списание" : "Подтвердить фильтры")}
            </div>
            <p className="mt-2 text-sm text-white/70">
              {pendingConfirm.description ??
                (pendingConfirm.requiresPayment
                  ? `Полный анализ стоит ${TC_PRICING.p3FullAnalysis} TC. Подтвердить запуск?`
                  : "Подтвердить фильтры? Далее будет подтверждение оплаты.")}
            </p>
            {pendingConfirm.requiresPayment && (
              <p className="mt-2 text-xs text-white/50">
                {isBalanceLoading
                  ? "Проверяем баланс..."
                  : `Твой баланс: ${confirmBalance ?? "н/д"} TC`}
              </p>
            )}
            {pendingConfirm.requiresPayment && (
              <p className="mt-2 text-xs text-white/50">
                Если анализ не сформируется, Trade Credits будут возвращены автоматически.
              </p>
            )}
            {pendingConfirm.requiresPayment && (
              <p className="mt-2 text-xs text-white/50">
                Списание происходит в порядке: {TC_SPEND_PRIORITY.join(" → ")}.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingConfirm(null);
                }}
              >
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  const text = pendingConfirm.message;
                  const actionId = pendingConfirm.actionId;
                  const rfqSuppliers = pendingConfirm.rfqSuppliers;
                  setConfirmOpen(false);
                  setPendingConfirm(null);
                  await sendMessage(text, { confirmActionId: actionId, rfqSuppliers });
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
