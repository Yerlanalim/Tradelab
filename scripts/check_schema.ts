import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const { data, error } = await supabase.from("reports").select("*").limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Columns:", Object.keys(data[0] || {}));
    console.log("Sample row:", JSON.stringify(data[0], null, 2));
  }
}

check();
