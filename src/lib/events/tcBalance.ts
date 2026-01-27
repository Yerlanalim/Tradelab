const TC_BALANCE_EVENT = "tc:updated";

export const dispatchTcBalanceUpdate = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TC_BALANCE_EVENT));
};

export const onTcBalanceUpdate = (handler: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TC_BALANCE_EVENT, handler);
  return () => window.removeEventListener(TC_BALANCE_EVENT, handler);
};
