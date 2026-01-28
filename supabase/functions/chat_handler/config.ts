const getEnv = (key: string) => Deno.env.get(key) ?? "";

export const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
// export const P3_SEARCH_MODEL = getEnv("P3_SEARCH_MODEL");
// export const P3_BASE_MODEL = getEnv("P3_BASE_MODEL");
export const P3_SEARCH_MODEL = "gpt-4.1-mini"; 
export const P3_BASE_MODEL = "gpt-5-mini";
