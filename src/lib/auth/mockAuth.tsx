"use client";

import { createContext, useContext, useMemo, useState } from "react";

type MockUser = {
  id: string;
  name: string;
  email: string;
};

type MockAuthContextValue = {
  user: MockUser | null;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
};

const MockAuthContext = createContext<MockAuthContextValue | undefined>(
  undefined
);

const demoUser: MockUser = {
  id: "demo-user",
  name: "Demo User",
  email: "demo@tradelab.ai",
};

export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(demoUser);

  const value = useMemo<MockAuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signIn: () => setUser(demoUser),
      signOut: () => setUser(null),
    }),
    [user]
  );

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useMockAuth() {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error("useMockAuth must be used within MockAuthProvider");
  }
  return context;
}
